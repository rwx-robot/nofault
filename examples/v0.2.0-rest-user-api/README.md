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

# 校验失败 → 422，返回字段级明细
curl -i -X POST http://127.0.0.1:3000/api/users \
  -H 'content-type: application/json' \
  -d '{"name":"X","email":"bad","age":999}'

# 参数类型错误 → 400
curl -i -X DELETE http://127.0.0.1:3000/api/users/abc

# 方法不允许 → 405 + Allow 头
curl -i -X POST http://127.0.0.1:3000/api/users/count
```

## 文件说明

| 文件 | 作用 |
| --- | --- |
| `src/main.ts` | 装配：全局前缀 + 4 个全局中间件 + 启动 |
| `src/app.module.ts` | 根模块，登记 `controllers` 与 `providers` |
| `src/users/user.controller.ts` | 装饰器路由，全部 v0.2.0 能力都在这 |
| `src/users/user.service.ts` | 业务服务（`@Injectable()`，注入 Controller） |
| `src/users/dto/create-user.dto.ts` | DTO 校验规则 |
| `src/users/user.model.ts` | 内存存储（v0.5.0 换成 `@nofault/sqlx`） |
| `src/middleware/timing.ts` | 路由级中间件示例（洋葱模型前后夹击） |

## 这个示例证明了什么

1. **声明式路由** —— 路由表由装饰器生成，没有一处手写 `if (path === ...)`
2. **依赖注入进控制器** —— `UserController` 构造注入 `UserService`
3. **参数自动转换** —— `@Param('id') id: number`，传 `abc` 会得到 400 而不是 `NaN`
4. **校验前置** —— DTO 校验在 handler 之前执行，业务代码拿到的必然是合法数据
5. **异常自动转响应** —— `throw new NotFoundException()` 直接变成 `404 { code, data, message }`
6. **中间件后置生效** —— `x-response-time` 响应头证明延迟提交机制работает

## 测试

```bash
pnpm vitest run tests/integration/v0.2.0     # 14 项，真实起服务发请求
pnpm bench v0.2.0                             # 基准测试
```
