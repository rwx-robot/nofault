/**
 * @nofault/rpc —— RPC 框架（v0.6.0）。
 *
 * 层次：`协议分帧 → 服务端分发 / 客户端调用 → 注册发现 → 负载均衡`
 * 传输用 `node:net`，不引入任何第三方网络库；序列化默认 JSON，可换 Codec。
 */
export {
  JsonCodec,
  FrameReader,
  RpcError,
  RPC_ERROR,
  DEFAULT_MAX_FRAME_BYTES,
  isAsyncIterable,
} from './protocol';
export type { RpcRequest, RpcResponse, Codec } from './protocol';

export { RpcServer } from './server';
export type { RpcServerOptions, RpcContext, Handler } from './server';

export { RpcClient } from './client';
export type { RpcClientOptions } from './client';

export { InMemoryRegistry, RoundRobinBalancer } from './registry';
export type { Registry, ServiceInstance, InMemoryRegistryOptions } from './registry';

export { composeInterceptors, loggingInterceptor, traceInterceptor } from './interceptor';
export type { Interceptor, InterceptorContext, Invoker } from './interceptor';

export { RpcModule, RpcClientToken, InjectRpcClient } from './rpc.module';
