# @nofault/http

底层 HTTP 适配（基于 node:http，零依赖）。

**引入版本**：v0.1.0

## 为什么这么设计

- 只做一件事：把 Node 原生请求/响应包成统一形态
- 不绑 Express / Fastify——Web 框架的抽象不该泄漏到内核
- `@nofault/rest` 建立在它之上