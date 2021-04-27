/**
 * RPC 客户端：连接池 + 超时 + 重试。
 *
 * 三件事各自有独立的开关，因为它们应对的是**不同的故障**：
 * - 池化：避免每次调用都握手（省的是延迟与 fd）
 * - 超时：防止慢调用拖死调用方（必须有，否则级联雪崩）
 * - 重试：只对"可能成功"的失败重试（网络错误、超时），
 *        业务错误（method not found、参数错误）重试毫无意义，只会放大故障
 */
import { connect, type Socket } from 'node:net';
import type { RpcRequest, RpcResponse } from './protocol';
import { FrameReader, JsonCodec, RPC_ERROR, RpcError, DEFAULT_MAX_FRAME_BYTES } from './protocol';
import type { Registry, ServiceInstance } from './registry';
import { RoundRobinBalancer } from './registry';

export interface RpcClientOptions {
  host?: string;
  port?: number;
  /** 通过注册中心寻址（与 host/port 二选一） */
  registry?: Registry;
  service?: string;
  /** 单次调用超时（毫秒） */
  timeoutMs?: number;
  /** 最多重试次数（不含首次） */
  retries?: number;
  /** 重试间隔（毫秒） */
  retryDelayMs?: number;
  /** 连接池上限 */
  poolSize?: number;
  maxFrameBytes?: number;
}

interface PooledConnection {
  socket: Socket;
  reader: FrameReader;
  pending: Map<string, { resolve: (res: RpcResponse) => void; reject: (err: unknown) => void }>;
  /** 流式调用：按 id 收集 chunk 帧，不与一元调用的 pending 混用 */
  streams: Map<string, { resolve: (res: RpcResponse) => void; reject: (err: unknown) => void }>;
  busy: number;
}

export class RpcClient {
  private readonly options: Required<Pick<RpcClientOptions, 'timeoutMs' | 'retries' | 'retryDelayMs' | 'poolSize' | 'maxFrameBytes'>> &
    RpcClientOptions;
  private readonly codec: JsonCodec;
  private readonly pool: PooledConnection[] = [];
  /**
   * 在建连接（按 `host:port` 去重）。
   *
   * 没有它，N 个并发首调会同时发现"池是空的"，于是各建一条连接——
   * 池化在最需要它的那一刻（突发并发）失效了。
   */
  private readonly connecting = new Map<string, Promise<PooledConnection>>();
  private readonly balancer = new RoundRobinBalancer();
  private closed = false;

  constructor(options: RpcClientOptions = {}) {
    this.options = {
      timeoutMs: 3000,
      retries: 0,
      retryDelayMs: 50,
      poolSize: 4,
      maxFrameBytes: DEFAULT_MAX_FRAME_BYTES,
      ...options,
    };
    this.codec = new JsonCodec(this.options.maxFrameBytes);
  }

  get poolStats(): { size: number; inFlight: number } {
    return { size: this.pool.length, inFlight: this.pool.reduce((n, c) => n + c.pending.size, 0) };
  }

  /**
   * 发起一次调用。
   *
   * 返回的 Promise 在**响应帧到达且 id 匹配**时才 resolve——
   * id 匹配是必须的：同一个连接上会并发多个调用，靠顺序对不上。
   */
  async call<T = unknown>(service: string, method: string, payload?: unknown, traceId?: string): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.options.retries; attempt++) {
      if (this.closed) throw new RpcError(RPC_ERROR.UNREACHABLE, 'client is closed');
      if (attempt > 0) await sleep(this.options.retryDelayMs);
      try {
        return await this.once<T>(service, method, payload, traceId);
      } catch (err) {
        lastError = err;
        // 业务类错误不重试：重试只会让下游更痛，且错误是确定的
        if (!isRetryable(err)) throw err;
      }
    }
    throw lastError instanceof Error ? lastError : new RpcError(RPC_ERROR.UNREACHABLE, String(lastError));
  }

  private async once<T>(service: string, method: string, payload: unknown, traceId?: string): Promise<T> {
    const connection = await this.acquire();
    const id = nextId();

    const response = await new Promise<RpcResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        connection.pending.delete(id);
        // 超时后这条连接上的响应可能稍后才到，不能复用它等待后续调用