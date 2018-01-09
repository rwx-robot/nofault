/**
 * @nofault/context —— 请求上下文（v0.3.0）。
 *
 * 职责：
 * 1. 用 `AsyncLocalStorage` 传播请求上下文（Node 官方的请求级值传递机制）
 * 2. 生成/继承 W3C `traceparent`，为 v0.8.0 的链路追踪预留挂载点