import { RequestContext, requestContextStore } from '@nofault/context';
import type { RequestContextStore } from '@nofault/context';
import { parseTraceparent } from '@nofault/context';
import type { Middleware } from '../pipeline';

export interface RequestContextOptions {
  /** 自定义 store；默认用全局的 `requestContextStore` */
  store?: RequestContextStore;
  /** 是否把 requestId 写进响应头，默认 true */
  exposeRequestId?: boolean;
}

/**
 * 请求上下文中间件。
 *
 * 职责（v0.3.0）：
 * 1. 为每个请求建立 `RequestContext`（继承上游 `traceparent`，没有就新开一条 trace）
 * 2. 挂到 `AsyncLocalStorage` 上，让业务代码无需层层传参就能拿到
 * 3. 给内核提供 `contextId`，从而启用 `Scope.REQUEST`
 *
 * **必须放在中间件链最前面**，否则后置中间件拿不到上下文。
 *
 * @example
 * ```ts
 * RestApplication.create(AppModule, { middleware: [requestContext(), cors(), bodyParser()] })
 * ```
 */
export function requestContext(options: RequestContextOptions = {}): Middleware {
  const store = options.store ?? requestContextStore;
  const expose = options.exposeRequestId ?? true;

  return (ctx, next) => {
    // 复用框架在请求入口建好的上下文（如果存在）。
    // 否则会出现**两层嵌套上下文**：handler 里读到的 requestId 和
    // 请求级 Provider 拿到的 requestId 是两个不同的值——非常难查。
    const existing = ctx.requestContext<RequestContext>();
    const requestCtx = existing ?? new RequestContext({ traceparent: parseTraceparent(ctx.request.header('traceparent')) });
    ctx.state.set('requestContext', requestCtx);
    if (expose) ctx.response.header('x-request-id', requestCtx.id);

    // 在上下文中执行后续整条链；next() 返回的 Promise 会被正确透传
    return store.run(requestCtx, () => Promise.resolve(next()));
  };