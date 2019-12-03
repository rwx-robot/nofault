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
