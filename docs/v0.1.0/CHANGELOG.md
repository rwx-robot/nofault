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