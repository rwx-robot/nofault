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