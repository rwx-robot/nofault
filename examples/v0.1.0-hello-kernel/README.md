# 示例：v0.1.0 hello-kernel

最小可运行示例，演示 v0.1.0 的四个能力：**IoC 容器 / 模块系统 / 配置 / 最小 HTTP 服务**。

## 跑起来

```bash
# 在 nofault/ 根目录
pnpm install
pnpm example v0.1.0-hello-kernel

# 或指定端口
pnpm example v0.1.0-hello-kernel PORT=3111
```

## 试一试

```bash
curl http://127.0.0.1:3000/
# nofault v0.1.0 hello-kernel. Try GET /hello?name=world or GET /health

curl "http://127.0.0.1:3000/hello?name=world"
# {"message":"Hello from nofault, world!","app":"hello-kernel"}

curl http://127.0.0.1:3000/health
# {"status":"ok","app":"hello-kernel","uptime":12}

curl -i http://127.0.0.1:3000/nope
# HTTP/1.1 404 Not Found
```

环境变量覆盖配置（12-factor）：