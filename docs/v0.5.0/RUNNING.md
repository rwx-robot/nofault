# nofault v0.5.0 运行说明

其余与 v0.1.0 相同，见 [`docs/v0.1.0/RUNNING.md`](../v0.1.0/RUNNING.md)。

## 跑测试

```bash
pnpm test                                    # 全部（270 项）
pnpm vitest run packages/orm                 # 映射 / Repository / 事务 / 迁移
pnpm vitest run packages/cache               # TTL / LRU / 击穿 / 抖动
pnpm vitest run tests/integration/v0.5.0     # ORM + 缓存真的接进 HTTP 服务
```

## 跑示例

```bash
pnpm example v0.5.0-data-user-api
pnpm example v0.5.0-data-user-api PORT=3350
```

### curl 试一遍

```bash
# 建用户（自增 id）
curl -s -X POST http://127.0.0.1:3000/api/user/users \
  -H 'content-type: application/json' -d '{"name":"alice","email":"a@example.com"}'
# → {"code":0,"data":{"id":1,...}}

# 邮箱重复 -> 409（事务里的唯一性检查）
curl -s -X POST http://127.0.0.1:3000/api/user/users \
  -H 'content-type: application/json' -d '{"name":"bob","email":"a@example.com"}'

# 读（第一次回源，之后走缓存）
curl -s http://127.0.0.1:3000/api/user/users/1

# 删除（同时失效缓存，避免读到幽灵数据）
curl -s -X DELETE http://127.0.0.1:3000/api/user/users/1
curl -s http://127.0.0.1:3000/api/user/users/1    # 404
