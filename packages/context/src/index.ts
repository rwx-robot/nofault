/**
 * @nofault/context —— 请求上下文（v0.3.0）。
 *
 * 职责：
 * 1. 用 `AsyncLocalStorage` 传播请求上下文（Node 官方的请求级值传递机制）
 * 2. 生成/继承 W3C `traceparent`，为 v0.8.0 的链路追踪预留挂载点
 * 3. 给内核提供 REQUEST 作用域所需的 `contextId`
 */
// 先 import 再 export：`export { X } from './y'` 只是转发，
// 不会在本模块建立本地绑定，下面这些函数里引用 RequestContext 就会编译不过。
import { RequestContext } from './request-context';
export { RequestContext } from './request-context';
export type { RequestContextInit } from './request-context';

// 同理，`requestContextStore` 也被下面的便捷函数用到：必须先 import 建立本地绑定，
// 再 export 出去。删掉这行 import 会得到 TS2552 —— 这个坑在本仓库已经踩过三次了。
import { requestContextStore } from './store';

export { RequestContextStore, requestContextStore } from './store';

export {