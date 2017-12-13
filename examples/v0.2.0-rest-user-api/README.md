# 示例：v0.2.0 rest-user-api

完整的 CRUD API，演示 v0.2.0 的全部能力：**装饰器路由 / 中间件 / 参数绑定 / DTO 校验 / 异常过滤**。

## 跑起来

```bash
# 在 nofault/ 根目录
pnpm install
pnpm example v0.2.0-rest-user-api
pnpm example v0.2.0-rest-user-api PORT=3222
```

默认监听 `3000`，全局前缀 `/api`。启动时会预置 Ada 与 Alan 两条数据。

## 路由表

| Method | Path | 说明 |
| --- | --- | --- |
| GET | `/api/users` | 列表，支持 `?keyword=` `?limit=` |
| GET | `/api/users/count` | 计数 |
| GET | `/api/users/:id` | 详情，找不到 → 404 |
| POST | `/api/users` | 创建，body 走 DTO 校验；邮箱重复 → 409 |
| POST | `/api/users/echo` | 解析+校验后原样返回（benchmark 成功路径样本） |
| PUT | `/api/users/:id` | 整量更新 |
| PATCH | `/api/users/:id` | 部分更新（只改 name） |
| DELETE | `/api/users/:id` | 删除 → 204 |
| GET | `/api/users/probe/missing` | 故意抛 404，演示异常过滤 |

## 试一试

```bash
curl http://127.0.0.1:3000/api/users
curl "http://127.0.0.1:3000/api/users?keyword=Ada"
curl http://127.0.0.1:3000/api/users/1

curl -X POST http://127.0.0.1:3000/api/users \
  -H 'content-type: application/json' \
  -d '{"name":"Grace","email":"grace@nofault.dev","age":45}'
