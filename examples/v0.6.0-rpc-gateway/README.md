# 示例：v0.6.0 rpc-gateway

**一个进程里同时起 RPC 后端与 HTTP 网关**：curl 打网关，网关通过 RPC 调后端。

## 跑起来

```bash
pnpm example v0.6.0-rpc-gateway
pnpm example v0.6.0-rpc-gateway PORT=3360
```

## 试一试

```bash
curl -s http://127.0.0.1:3000/api/ping                    # 经 RPC：{pong:true}
curl -s -X POST http://127.0.0.1:3000/api/users \
  -H 'content-type: application/json' -d '{"name":"alice"}'
curl -s http://127.0.0.1:3000/api/users/1                 # {id:1,name:"alice"}
curl -s http://127.0.0.1:3000/api/users/999               # 404（业务码 404）
curl -s http://127.0.0.1:3000/api/slow/900                # 504（上游超时）
```

## 文件说明

| 文件 | 说明 |
| --- | --- |
| `src/user-rpc.service.ts` | 后端服务：普通类，方法即 RPC 方法，**零框架依赖** |
| `src/gateway.controller.ts` | HTTP 网关：透传 traceId、按错误码翻译状态 |
| `src/main.ts` | 起后端 → 注册到注册中心 → 起网关 → 优雅退出 |

## 这个示例证明了什么

1. **traceId 穿过 RPC 边界** —— 后端日志能串到同一次用户请求
2. **超时在网关侧生效** —— 后端要 900ms，网关 500ms 就返回 504
3. **业务码 → HTTP 状态** —— `RpcError(404)` 变成 HTTP 404
4. **注册发现可用** —— 网关不知道后端端口，只认服务名 `user`
5. **拦截器生效** —— 每次 RPC 调用都打日志（含 traceId 与耗时）

## 测试