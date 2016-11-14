# nofault v0.6.0 运行说明

其余与 v0.1.0 相同，见 [`docs/v0.1.0/RUNNING.md`](../v0.1.0/RUNNING.md)。

## 跑测试

```bash
pnpm test                                    # 全部
pnpm vitest run packages/rpc                 # 分帧 / 往返 / 超时 / 重试 / 注册发现 / 负载均衡
pnpm vitest run tests/integration/v0.6.0     # HTTP 网关 → RPC（traceId 透传、超时 504）
```

## 跑示例

```bash
pnpm example v0.6.0-rpc-gateway
pnpm example v0.6.0-rpc-gateway PORT=3360
```

一个进程里同时起 **RPC 后端** 与 **HTTP 网关**，curl 打网关：

```bash
curl -s http://127.0.0.1:3000/api/ping                  # 经 RPC 返回 {pong:true}
curl -s -X POST http://127.0.0.1:3000/api/users \
  -H 'content-type: application/json' -d '{"name":"alice"}'
curl -s http://127.0.0.1:3000/api/users/1
curl -s http://127.0.0.1:3000/api/users/999             # 404（业务码）
curl -s http://127.0.0.1:3000/api/slow/900              # 504（上游超时）
```

## 跑基准测试

```bash
pnpm bench v0.6.0 --iterations=2000 --concurrency=50 --report
```

## 目录导航

```
packages/rpc/src/protocol.ts      帧格式、请求/响应、错误码
packages/rpc/src/server.ts        TCP 服务端 + 分发
packages/rpc/src/client.ts        连接池 / 超时 / 重试
packages/rpc/src/registry.ts      注册发现 + 加权轮询
packages/rpc/src/interceptor.ts   拦截器链
packages/rpc/src/http-bridge.ts   RPC 错误 → HTTP 状态
examples/v0.6.0-rpc-gateway/      HTTP 网关调 RPC 的示例
tests/integration/v0.6.0/         端到端
```
