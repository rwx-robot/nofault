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