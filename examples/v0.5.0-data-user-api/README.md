# 示例：v0.5.0 data-user-api

**契约一份 → controller / service / module / dto / entity / repository**，
并且真的接上了 ORM（事务、迁移）与缓存（击穿保护）。

## 跑起来

```bash
pnpm example v0.5.0-data-user-api
pnpm example v0.5.0-data-user-api PORT=3350
```

## 试一试

```bash
# 建用户（自增 id）
curl -s -X POST http://127.0.0.1:3000/api/user/users \