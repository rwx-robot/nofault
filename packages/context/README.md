# @nofault/context

请求上下文：AsyncLocalStorage 传播、REQUEST 作用域、traceId 透传。

**引入版本**：v0.3.0

## 为什么这么设计

- 用 `AsyncLocalStorage` 而不是参数透传：业务代码不该为了"把 traceId 传下去"而多一个参数
- 生成/继承 W3C `traceparent`——跨服务调用链靠它串起来
- 给内核提供 REQUEST 作用域需要的 `contextId`

## 最快上手

```ts
import { requestContextStore, currentContext } from '@nofault/context';

await requestContextStore.run({ traceId: 'abc' }, async () => {
  currentContext()?.traceId;   // 'abc'
});
```

## 注意

**"当前上下文"只能存在这里**。用模块级变量在并发下必然串号（v0.6.0 的拦截器、v0.8.0 的活动 Span 都栽过）。

## 相关文档

- 架构说明 → [`docs/v0.3.0/ARCHITECTURE.md`](../../docs/v0.3.0/ARCHITECTURE.md)
- 变更记录 → [`docs/v0.3.0/CHANGELOG.md`](../../docs/v0.3.0/CHANGELOG.md)
