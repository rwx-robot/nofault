/**
 * 拦截器：RPC 的洋葱模型。
 *
 * 与 HTTP 中间件唯一的区别是签名里的 `ctx`：
 * RPC 需要知道"现在调的是哪个方法"，才能做按方法的限流、审计与埋点。
 *
 * ctx 在**组合时**就传进去（而不是靠模块级变量偷偷取），
 * 因为同一个 server 上会有多个并发调用在飞——全局当前上下文必然串号。
 */
import type { RpcRequest } from './protocol';

export interface InterceptorContext {
  request: RpcRequest;
}

export type Invoker = (payload: unknown) => Promise<unknown>;

export type Interceptor = (payload: unknown, ctx: InterceptorContext, next: Invoker) => Promise<unknown>;

/**
 * 折叠拦截器链。
 *
 * @param ctx 本次调用的上下文，逐层传给每个拦截器
 * @param final 真正的 handler
 */
export function composeInterceptors(interceptors: Interceptor[], ctx: InterceptorContext, final: Invoker): Invoker {
  const dispatch = (index: number): Invoker => {
    const interceptor = interceptors[index];
    if (!interceptor) return final;
    return (current) => interceptor(current, ctx, (nextPayload) => dispatch(index + 1)(nextPayload));
  };
  return dispatch(0);
}

/** 常用拦截器：记录调用耗时 */
export function loggingInterceptor(logger: {
  info(message: string, fields?: Record<string, unknown>): void;
}): Interceptor {
  return async (payload, ctx, next) => {
    const started = Date.now();
    try {
      return await next(payload);
    } finally {
      logger.info('rpc call', {
        method: `${ctx.request.service}.${ctx.request.method}`,
        traceId: ctx.request.traceId,
        ms: Date.now() - started,
      });
    }
  };
}

/** 常用拦截器：把上游 traceId 接到本地日志上下文里 */
export function traceInterceptor(onTrace: (traceId: string | undefined) => void): Interceptor {
  return async (payload, ctx, next) => {