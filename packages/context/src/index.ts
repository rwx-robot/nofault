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