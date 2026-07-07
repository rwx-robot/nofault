# @nofault/cli

`nofaultctl` 命令行：脚手架、生成、校验、路由、OpenAPI、热重载、环境自检。

**引入版本**：v0.10.0

## 为什么这么设计

- 子命令刻意少而准，**不是一个什么都塞的瑞士军刀**
- `doctor` 会解析 tsconfig 的 `extends`：不解析会大面积误报"装饰器元数据没开"
- `dev` 重启前等旧进程真的退出——不然抢端口，表现为"改了代码没生效"

## 最快上手

```ts
nofaultctl new user-service
nofaultctl generate api api/user.api.ts --out src --with-orm
nofaultctl openapi api/user.api.ts --out openapi.json
nofaultctl doctor
```