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
  -H 'content-type: application/json' -d '{"name":"alice","email":"a@example.com"}'

# 邮箱重复 -> 409（唯一性检查在事务里）
curl -s -X POST http://127.0.0.1:3000/api/user/users \
  -H 'content-type: application/json' -d '{"name":"bob","email":"a@example.com"}'

# 读：第一次回源，之后走缓存；删除会同时失效缓存
curl -s http://127.0.0.1:3000/api/user/users/1
curl -s -X DELETE http://127.0.0.1:3000/api/user/users/1
curl -s http://127.0.0.1:3000/api/user/users/1     # 404（不是幽灵数据）

# 分页 + query 校验
curl -s "http://127.0.0.1:3000/api/user/users?page=1&pageSize=10"
curl -s "http://127.0.0.1:3000/api/user/users?page=0&pageSize=10"    # 422
```

## 文件说明

| 文件 | 谁维护 | 说明 |
| --- | --- | --- |
| `api/user.api.ts` | 人 | 契约 |
| `src/dto/*`、`src/user/user.controller.ts` | 生成器 | 传输对象与路由 |
| `src/data/entities/*`、`src/data/repositories/*` | 生成器（骨架） | entity / repository |
| `src/data/repositories/user-resp.repository.ts` | **已接管** | 补了 `findByEmail` / `remove` |
| `src/user/user.service.ts` | **已接管** | 事务 + 缓存 |
| `src/user/user.module.ts` | **已接管** | 加了 `imports: [DataModule]` |
| `src/app.module.ts`、`src/data/data.module.ts` | 人 | 选数据源与缓存实现 |
| `src/main.ts` | 人 | 迁移 + 启动 |

## 这个示例证明了什么

1. **一份契约产出六类文件** —— controller / service / module / dto / entity / repository
2. **迁移先跑、服务后起** —— 避免半初始化的实例开始接流量
3. **事务真的回滚** —— 邮箱冲突时不会留下半条记录