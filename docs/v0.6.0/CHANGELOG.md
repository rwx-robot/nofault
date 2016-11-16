# Changelog — v0.6.0（2021 · RPC 框架）

> TCP 没有消息边界 → 自己分帧；一条连接上多个在途调用 → 每个请求要有 id。

## 新增包 `@nofault/rpc`

- **协议**：`[4 字节大端长度][JSON]`；`FrameReader` 处理半包/粘包，超长帧直接拒绝
- **服务端** `RpcServer`：`register()` / `registerService()`（读原型方法名，业务类零框架依赖）
- **客户端** `RpcClient`：连接池（按目标去重在建连接）、超时、重试（只重试可重试的）
- **注册发现** `InMemoryRegistry`：TTL 过期自动剔除 + `RoundRobinBalancer` 加权轮询
- **拦截器**：`composeInterceptors` / `loggingInterceptor` / `traceInterceptor`
- **HTTP 桥接** `rpcErrorToStatus()`：超时→504（不是笼统的 500）、业务码原样透出
- **DI** `RpcModule.forClient()` + `@InjectRpcClient()`

## 关键设计决策

| 决策 | 理由 |
| --- | --- |
| 长度前缀分帧 | 不分帧就是偶发的 JSON 解析失败，且只在负载大时复现 |
| 请求带 id | 一条连接上并发多调用，响应顺序不保证按请求 |
| 按目标去重在建连接 | 否则 N 个并发首调各建一条，池化在最需要时失效 |
| 只重试可重试的错误 | 业务错误重试只会放大故障 |
| 超时 → 504 | 504 才是"上游超时"，502 是"收到无效响应" |
| 拦截器 ctx 在组合时传入 | 模块级"当前上下文"在并发下必然串号 |