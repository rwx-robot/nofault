# nofault v0.10.0 运行说明

其余与 v0.1.0 相同，见 [`docs/v0.1.0/RUNNING.md`](../v0.1.0/RUNNING.md)。

## 新增命令

```bash
# 由契约生成 OpenAPI 3.0 文档
nofaultctl openapi api/user.api.ts --out openapi.json --title "User API" --version 1.2.0
nofaultctl openapi api/user.api.ts --dry-run        # 打到 stdout，不写盘

# 监听源码变化并自动重启（默认 node dist/main.js）
nofaultctl dev
nofaultctl dev --cmd "node dist/main.js" --watch src,api

# 环境自检：Node 版本 / tsconfig / 依赖
nofaultctl doctor
```

`doctor` 的输出示例：

```
warn  package.json           type=commonjs
ok    emitDecoratorMetadata  已开启
ok    experimentalDecorators 已开启
ok    reflect-metadata       已安装
ok    source directory       src, api
