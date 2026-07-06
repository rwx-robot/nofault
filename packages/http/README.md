# @nofault/http

底层 HTTP 适配（基于 node:http，零依赖）。

**引入版本**：v0.1.0

## 为什么这么设计

- 只做一件事：把 Node 原生请求/响应包成统一形态
- 不绑 Express / Fastify——Web 框架的抽象不该泄漏到内核
- `@nofault/rest` 建立在它之上

## 最快上手

```ts
import { createHttpApplication } from '@nofault/http';
import { AppModule } from './app.module';

const app = await createHttpApplication(AppModule);
await app.listen(3000);
```

## 注意

业务代码通常直接用 `@nofault/rest`，这一层只在需要裸 HTTP 能力时才碰。

## 相关文档

- 架构说明 → [`docs/v0.1.0/ARCHITECTURE.md`](../../docs/v0.1.0/ARCHITECTURE.md)
- 变更记录 → [`docs/v0.1.0/CHANGELOG.md`](../../docs/v0.1.0/CHANGELOG.md)
