# Changelog — v0.3.0（2018 · 运行时基座）

把"请求之内"该有的能力补齐：上下文、请求级作用域、热配置、可观测日志、探针。

## 新增

### @nofault/context（新包）
- `RequestContext`：请求 ID + W3C traceId/spanId + 数据袋，同时充当内核的 `contextId`
- `RequestContextStore`：`AsyncLocalStorage` 传播，支持 `run` / `current` / `require` / `contextId`
- W3C Trace Context：`parseTraceparent` / `formatTraceparent`（非法头返回 undefined 而非抛错）
- 顶层便捷 API：`currentContext` / `requireContext` / `currentContextId` / `runWithContext`

### @nofault/core
- **启用 `Scope.REQUEST`**：`contextId` 在依赖链上全程透传，请求级实例按上下文缓存
- **Captive dependency 检测**：启动期沿依赖图传播 `contextDependent`，
  避免单例缓存请求级对象导致跨请求数据串号
- 请求结束 `clearRequestContext(contextId)` 释放实例
- 启动期跳过四类 Provider 的急切实例化：TRANSIENT / REQUEST / 被污染 / 控制器
- 新增 `MissingContextIdError`
- 优雅退出加**超时保护**（默认 5s）

### @nofault/config
- 可插拔 `ConfigSource`：`createFileSource`（watch + 防抖）/ `createPollingSource`（etcd/consul/nacos）/ `createInlineSource` / `createEnvSource`
- `ConfigRegistry`：多源合并、环境变量最高优先、变更通知、远程失败保留旧值
- `ConfigModule.forRootAsync()`：完成首次加载后再返回模块，支持热更新
- `ConfigService` 支持 `reload()` / `subscribe()` / `isReloadable`

### @nofault/logger
- `FileTransport`：按大小 / 按天轮转，保留 N 份历史
- `contextProvider`：每条日志注入请求上下文（traceId）
- `sampling`：`sampleBelow` 以下级别按比例采样，warn 以上永不打折扣
- 传输失败退到 stderr 并限流，**不会打挂业务**

### @nofault/rest
- `requestContext()` 中间件（复用框架已建立的上下文）
- 内建 `/healthz`（存活）与 `/readyz`（就绪），语义严格分离
- `markReady()` / `markNotReady()`；注册 readiness 后默认未就绪
- `addRoute()`：不走装饰器直接注册路由
- `contextStore: null` 可关闭上下文（REQUEST 作用域随之不可用）

## 关键设计变更

1. **上下文在请求入口建立，中间件只复用不重建**——否则会出现两层嵌套上下文，
   handler 与请求级 Provider 拿到的 requestId 不一致。
2. **作用域沿依赖图传播**——单例持有请求级对象是逻辑错误，框架自动纠正而不是静默错下去。
3. **`ConfigRegistry.values()` 不再克隆**——它是热路径，每次全量 `structuredClone`
   会让"读一个配置"变成 O(配置大小)。安全由"整体替换 + `snapshot()` 显式拷贝"保证。

## 测试

- 单元测试 +33：上下文 15、REQUEST 作用域与 captive dependency 7、日志升级 11
- 集成测试 +11：上下文、REQUEST 作用域、traceparent、探针、配置热更新
- 合计 **124 项全通过**

## 性能

| 指标 | 数值 |
| --- | --- |
| 上下文创建 | 153,130 ops/sec（优化前 62,303） |
| ALS run + current | 142,643 ops/sec（7.01 µs/次） |
| GET config | 7,768.5 rps，开销 35.1%（优化前 50.2%） |
| GET context | 8,221.3 rps，开销 30.3%（优化前 35.1%） |

基准测试挖出并修复：① 每次 `config.get()` 全量克隆（−15pp）② 每请求 3 次 crypto 随机（上下文快 2.5×）。

## 已知限制

- 中间件链未做编译期折叠，是当前主要开销
- 只有 traceId 传播，没有 span 上报 → v0.8.0
- 无指标采集 → v0.8.0
- 无 ORM / 缓存 → v0.5.0；无 RPC → v0.6.0；无熔断限流 → v0.7.0
