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
curl -s http://127.0.0.1:3000/api/user/ping
# {"code":0,"data":{"ok":"pong"},"message":"ok"}

# 创建用户
curl -s -X POST http://127.0.0.1:3000/api/user/users \
  -H 'content-type: application/json' \
  -d '{"name":"alice","email":"a@example.com"}'
# {"code":0,"data":{"id":1,"name":"alice","email":"a@example.com"},"message":"ok"}

# 邮箱重复 -> 409（业务规则，写在手写的 service 里）
curl -s -X POST http://127.0.0.1:3000/api/user/users \
  -H 'content-type: application/json' -d '{"name":"bob","email":"a@example.com"}'

# 邮箱格式错 -> 422（DTO 校验，契约里一行 @IsEmail 换来的）
curl -s -X POST http://127.0.0.1:3000/api/user/users \
  -H 'content-type: application/json' -d '{"name":"bob","email":"nope"}'
# {"code":422,"data":[{"property":"email","constraints":{"isEmail":"must be an email"}}],...}

# 路径参数（:id 走 @Param 绑定，非数字 400）
curl -s http://127.0.0.1:3000/api/user/users/1
curl -s http://127.0.0.1:3000/api/user/users/abc

# query 校验（page 最小值 1，契约里 @Min(1)）
curl -s "http://127.0.0.1:3000/api/user/users?page=1&pageSize=10"
curl -s "http://127.0.0.1:3000/api/user/users?page=0&pageSize=10"   # 422
```

## 文件说明

| 文件 | 谁维护 | 说明 |
| --- | --- | --- |
| `api/user.api.ts` | **人** | 契约。日常只改这个 |
| `src/dto/*.dto.ts` | 生成器 | 属性名取传输键，带校验装饰器 |
| `src/user/user.controller.ts` | 生成器 | 路由 + 参数绑定 + `@Validate` |
| `src/user/user.module.ts` | 生成器 | `@Module` 装配 |
| `src/user/user.service.ts` | **人** | 业务实现（已删掉生成标记，生成器不再碰） |