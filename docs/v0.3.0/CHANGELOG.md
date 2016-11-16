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