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
