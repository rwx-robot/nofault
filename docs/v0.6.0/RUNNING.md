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