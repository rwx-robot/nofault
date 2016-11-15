# Changelog — v0.1.0（2016 · 内核雏形）

首个版本。目标：**让声明式的类被框架托管起来，并能对外提供 HTTP 服务。**

## 新增

### @nofault/core
- **IoC 容器**
  - `NofaultContainer`：模块与 Provider 注册表，bootstrap 后 `lock()` 防止再注册
  - `Injector`：构造函数注入、属性注入、`@Optional()` 可选依赖、循环依赖检测
  - `InstanceWrapper`：作用域（SINGLETON / TRANSIENT / REQUEST）+ 单例缓存 + 并发去重
  - `ModuleRef`：`providers` / `imports` / `exports` 可见性规则
  - 五种 Provider 形态：`useValue` / `useClass` / `useFactory` / `useExisting` / 类简写
- **模块系统**
  - `@Module()`、`@Global()`、动态模块（`forRoot()` 模式）
  - `ModuleScanner`：DFS 遍历模块图，支持同步与异步动态模块
- **生命周期**
  - `onModuleInit` → `onApplicationBootstrap` → `beforeApplicationShutdown` → `onModuleDestroy` → `onApplicationShutdown`
  - `enableShutdownHooks()` 接管 SIGTERM / SIGINT
  - `close()` 幂等，重复调用只执行一次
- **启动器**
  - `NofaultFactory.create()` / `NofaultFactory.createApplicationContext()`
  - `NofaultApplication.listen()` / `close()` / `use()` / `getHttpServer()`

### @nofault/config
- `ConfigModule.forRoot()`（默认全局）+ `ConfigService`
- 支持 YAML / JSON / `.env`，无扩展名时按内容嗅探
- 环境变量覆盖：`NOFAULT_SERVER__PORT=8080` → `server.port`
- `registerAs()` 命名空间配置
- `snapshot()` 返回深拷贝，防止误改

### @nofault/logger
- 六个级别：trace / debug / info / warn / error / fatal
- 结构化字段（message 给人读，fields 给机器读）
- `ConsoleTransport`（error/fatal 自动走 stderr）、`MemoryTransport`（测试）
- JSON / Pretty（带颜色）两种格式
- `child()` 派生子日志器

### @nofault/http
- `NodeHttpAdapter`：基于 `node:http`，零第三方依赖
- 优雅关闭：先停止监听，再等待在途请求排空（上限 5s）
- `createHttpApplication()`：带适配器的应用工厂
- `sendJson` / `sendText` / `redirect` / `readJsonBody`（1MB 上限）

### 工程化
- pnpm workspace monorepo + 拓扑排序构建脚本
- Vitest + **swc** 转译（esbuild 不支持 `emitDecoratorMetadata`）
- ESLint 9 flat config + Prettier
- `scripts/run-example.mjs`、`scripts/run-bench.mjs`

## 测试
- 单元测试 30 项：容器 10、生命周期 3、配置 9、日志 8
- 集成测试 6 项：真实起服务 + 真实发请求

## 性能
- 相比原生 `node:http` **开销约 0.6%**（在噪声范围内），详见 `benchmarks/v0.1.0/REPORT.md`

## 已知限制
- 路由为手写 `switch`（v0.2.0 解决）
- 无参数绑定与校验（v0.2.0）
- 无异常过滤器（v0.2.0）
- REQUEST 作用域预留未启用（v0.3.0）
- 配置不支持热更新（v0.3.0）
