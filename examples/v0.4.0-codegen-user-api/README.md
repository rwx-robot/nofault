# 示例：v0.4.0 codegen-user-api

一个**由契约生成、并且真的跑起来**的 user 服务。

演示：契约 → `nofaultctl generate` → controller / service / module / dto → 起服务 → curl。

## 跑起来

```bash
# 在 nofault/ 根目录
pnpm example v0.4.0-codegen-user-api
pnpm example v0.4.0-codegen-user-api PORT=3340
```

## 试一试

```bash
# 存活