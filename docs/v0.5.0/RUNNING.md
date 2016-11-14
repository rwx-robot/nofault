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

# 分页 + 校验
curl -s "http://127.0.0.1:3000/api/user/users?page=1&pageSize=10"
curl -s "http://127.0.0.1:3000/api/user/users?page=0&pageSize=10"   # 422
```

### 重新生成（含数据层）

```bash
node ../../packages/cli/bin/nofaultctl.js generate api api/user.api.ts --out src --with-orm
# --watch 可让它在契约变更时自动重跑
```

只会被覆盖的是**仍带生成标记**的文件；
`user.service.ts` / `user.module.ts` / `data/repositories/user-resp.repository.ts`
已删掉标记，属于手工接管，不会被覆盖。

## 跑基准测试

```bash
pnpm bench v0.5.0
pnpm bench v0.5.0 --iterations=800 --report
```

## 目录导航

```
packages/orm/src/decorators.ts      实体与列装饰器
packages/orm/src/dialect.ts         SQL 方言（纯字符串，可单测）
packages/orm/src/data-source.ts     内存 / SQL 两种数据源
packages/orm/src/memory-sql.ts      迁移所需的迷你 SQL 引擎
packages/orm/src/repository.ts      Repository + QueryBuilder + 映射
packages/orm/src/migration.ts       迁移执行器
packages/orm/src/orm.module.ts      OrmModule.forRoot / forFeature
packages/cache/src/memory-cache.ts  TTL + LRU + 抖动 + single-flight
examples/v0.5.0-data-user-api/      可运行示例
tests/integration/v0.5.0/           端到端
```
