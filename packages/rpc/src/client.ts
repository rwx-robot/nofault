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
        this.discard(connection);
        reject(new RpcError(RPC_ERROR.TIMEOUT, `call ${service}.${method} timed out after ${this.options.timeoutMs}ms`));
      }, this.options.timeoutMs);
      timer.unref?.();

      connection.pending.set(id, {
        resolve: (res) => {
          clearTimeout(timer);
          resolve(res);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });

      const request: RpcRequest = { id, service, method, payload, traceId };
      connection.socket.write(this.codec.encodeRequest(request), (err) => {
        if (err) {
          clearTimeout(timer);
          connection.pending.delete(id);
          this.discard(connection);
          reject(err);
        }
      });
    });

    if (!response.ok) {
      throw new RpcError(response.error?.code ?? RPC_ERROR.HANDLER, response.error?.message ?? 'rpc failed');
    }
    return response.result as T;
  }

  /**
   * 服务端流调用：返回 AsyncIterable，逐条产出 chunk，末帧结束。
   *
   * 与 `call()` 的三条差异（都是刻意的）：
   * - **不重试**：流是过程性的，重发等于让服务端把过程重放一遍；
   * - **无整体超时**：流的价值就是"多久发完由服务端决定"，节奏由调用方控制；
   * - 连接断开 → 迭代器抛 `UNREACHABLE`，已收到的部分不回吐。
   */
  async *callStream<T = unknown>(service: string, method: string, payload?: unknown, traceId?: string): AsyncIterable<T> {
    if (this.closed) throw new RpcError(RPC_ERROR.UNREACHABLE, 'client is closed');
    const connection = await this.acquire();
    const id = nextId();
    const queue: RpcResponse[] = [];
    let done: { err?: unknown } | undefined;
    let notify: (() => void) | undefined;

    connection.streams.set(id, {
      resolve: (res) => {
        queue.push(res);
        notify?.();
      },
      reject: (err) => {
        done = { err };
        notify?.();
      },
    });

    const request: RpcRequest = { id, service, method, payload, traceId };
    connection.socket.write(this.codec.encodeRequest(request), (err) => {
      if (err) {
        connection.streams.delete(id);
        done = { err };
        notify?.();
      }
    });

    try {
      while (true) {
        while (queue.length > 0) {
          const res = queue.shift()!;
          if (!res.ok) throw new RpcError(res.error?.code ?? RPC_ERROR.HANDLER, res.error?.message ?? 'rpc failed');
          if (res.chunk !== undefined) {
            yield res.chunk as T;
          } else {
            return; // 末帧：正常收尾
          }
        }
        if (done) {
          if (done.err) throw done.err;
          return;
        }
        await new Promise<void>((wake) => {
          notify = wake;
        });
        notify = undefined;
      }
    } finally {
      connection.streams.delete(id);
    }
  }

  private async acquire(): Promise<PooledConnection> {
    const target = await this.resolveTarget();
    const idle = this.pool.find((c) => !c.socket.destroyed && c.pending.size < 64);
    if (idle) return idle;
    if (this.pool.length >= this.options.poolSize) {
      // 池满：挑在途最少的那条复用（长尾比新建连接划算）
      return this.pool.reduce((a, b) => (a.pending.size <= b.pending.size ? a : b));
    }

    const key = `${target.host}:${target.port}`;
    const inFlight = this.connecting.get(key);
    if (inFlight) return inFlight;

    const created = this.connect(target.host, target.port);
    this.connecting.set(key, created);
    try {
      return await created;
    } finally {
      this.connecting.delete(key);
    }
  }

  private async resolveTarget(): Promise<{ host: string; port: number }> {
    if (this.options.registry && this.options.service) {
      const instances = await this.options.registry.discover(this.options.service);
      const instance = this.balancer.pick(instances);
      if (!instance) throw new RpcError(RPC_ERROR.UNREACHABLE, `no instance for service ${this.options.service}`);
      return { host: instance.host, port: instance.port };
    }
    if (!this.options.host || !this.options.port) {
      throw new RpcError(RPC_ERROR.UNREACHABLE, 'rpc client needs host/port or a registry');
    }
    return { host: this.options.host, port: this.options.port };
  }

  private connect(host: string, port: number): Promise<PooledConnection> {
    return new Promise((resolve, reject) => {
      const socket = connect({ host, port });
      const reader = new FrameReader(this.options.maxFrameBytes);
      const connection: PooledConnection = { socket, reader, pending: new Map(), streams: new Map(), busy: 0 };

      const settle = (err?: Error): void => {
        for (const [, waiter] of connection.pending) waiter.reject(err ?? new RpcError(RPC_ERROR.UNREACHABLE, 'connection closed'));
        connection.pending.clear();
        for (const [, stream] of connection.streams) stream.reject(err ?? new RpcError(RPC_ERROR.UNREACHABLE, 'connection closed'));
        connection.streams.clear();
        const index = this.pool.indexOf(connection);
        if (index >= 0) this.pool.splice(index, 1);
      };

      socket.once('connect', () => {
        this.pool.push(connection);
        resolve(connection);
      });
      socket.once('error', (err) => {
        settle(err);
        reject(err);
      });
      socket.once('close', () => settle());

      socket.on('data', (chunk) => {
        for (const frame of reader.push(chunk)) {
          const response = this.codec.decode(frame) as RpcResponse;
          const stream = connection.streams.get(response?.id);
          if (stream) {
            // 流式帧不消费 pending：chunk 与末帧都交给消费器
            stream.resolve(response);
            continue;
          }
          const waiter = connection.pending.get(response?.id);
          if (!waiter) continue; // 超时后被丢弃的响应，忽略即可
          connection.pending.delete(response.id);
          waiter.resolve(response);
        }
      });
    });
  }

  private discard(connection: PooledConnection): void {
    const index = this.pool.indexOf(connection);
    if (index >= 0) this.pool.splice(index, 1);
    connection.socket.destroy();
  }

  async close(): Promise<void> {
    this.closed = true;
    this.connecting.clear();
    for (const connection of [...this.pool]) connection.socket.destroy();
    this.pool.length = 0;
  }
}

function isRetryable(err: unknown): boolean {
  if (!(err instanceof RpcError)) {
    // 连接层错误（ECONNREFUSED / ECONNRESET）值得重试
    return true;
  }
  return err.code === RPC_ERROR.TIMEOUT || err.code === RPC_ERROR.UNREACHABLE || err.code === RPC_ERROR.PARSE;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let counter = 0;
function nextId(): string {
  counter += 1;
  return `${process.pid}:${counter}`;
}