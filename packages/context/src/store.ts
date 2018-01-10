import { AsyncLocalStorage } from 'node:async_hooks';
import { RequestContext } from './request-context';
import type { RequestContextInit } from './request-context';

/**
 * 上下文存储：基于 `AsyncLocalStorage`。
 *
 * 为什么是 ALS 而不是"把 ctx 当参数一路传"：
 * - 业务代码不该为了拿个 traceId 就在每个函数签名里加参数
 * - ALS 能穿透 `await` / Promise 链，也能穿透事件回调
 * - 内核只需要一个不透明的 `contextId`，这里直接复用 `RequestContext` 实例本身
 */
export class RequestContextStore {
  private readonly storage = new AsyncLocalStorage<RequestContext>();

  /**
   * 在上下文中执行 `fn`。
   *
   * @returns `fn` 的返回值（泛型透传，不丢类型）
   */