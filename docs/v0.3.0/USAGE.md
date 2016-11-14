# nofault v0.3.0 使用说明

## 1. 在业务代码里拿请求上下文

```ts
import { currentContext } from '@nofault/context';

@Injectable()
class OrderService {
  create() {
    const ctx = currentContext();
    log.info('order created', { traceId: ctx?.traceId });
  }
}
```

不在请求内时 `currentContext()` 返回 `undefined`。确信用得到时用 `requireContext()`（会抛错）。

## 2. 让每一行日志自动带 traceId

```ts
import { createLogger } from '@nofault/logger';
import { currentContext } from '@nofault/context';

const logger = createLogger({
  contextProvider: () => currentContext()?.toJSON(),
});
```

`contextProvider` 每条日志调用一次，返回值合并进 fields。业务代码零改动。

## 3. 声明请求级服务

```ts
import { Injectable, Scope } from '@nofault/core';

@Injectable({ scope: Scope.REQUEST })
export class RequestScopeService {
  private readonly notes: string[] = [];
  addNote(n: string) { this.notes.push(n); }
  getNotes() { return [...this.notes]; }
}
```

- **每请求一份实例**，请求内共享，请求结束自动释放
- 典型用途：UnitOfWork（一次请求一个事务）、租户上下文、请求级缓存、审计追踪

> 单例依赖它不会出错——内核会自动把该单例标记为"上下文相关"，
> 按请求缓存，避免跨请求串数据。

## 4. 配置热更新

```ts
@Module({
  imports: [ConfigModule.forRootAsync({ path: 'config.yaml', watch: true })],
})
export class AppModule {}
```

`forRootAsync` 返回 Promise，内核的模块扫描器会 `await`，直接放进 `imports` 即可。

```ts
const config = await app.get(ConfigService);
config.subscribe((next, prev) => log.info('config changed', { next }));
await config.reload();          // 也可以手动触发
config.isReloadable;            // true
```

远程配置中心（etcd / consul / nacos）用轮询源接入，不想引入客户端依赖：

```ts
ConfigModule.forRootAsync({
  sources: [
    createPollingSource({
      name: 'nacos',
      intervalMs: 30_000,
      fetch: async () => JSON.parse(await (await fetch('http://nacos/...')).text()),
    }),
  ],
})
```

拉取失败会保留上一次的值，不会打挂应用。

## 5. 日志落文件 + 轮转 + 采样

```ts
import { createLogger, FileTransport, LogLevel } from '@nofault/logger';

const logger = createLogger({
  level: LogLevel.INFO,
  transports: [
    new FileTransport({ filePath: 'logs/app.log', maxSize: 512 * 1024, maxFiles: 3, daily: true }),
  ],
  // 只采样 debug/trace；warn 以上永不打折扣
  sampling: { rate: 0.1, sampleBelow: LogLevel.INFO },
});
```

传输目标写失败会退到 stderr 并限流，**绝不会把业务请求打挂**。

## 6. 健康探针

框架默认注册 `/healthz` 与 `/readyz`：

```ts
app.health.registerLiveness('event-loop', () => true);
app.health.registerReadiness('db', async () => {
  await pool.query('select 1');
  return true;
}, /* degradeOnFailure */ false);

await app.listen(3000);
app.markReady();        // 预热完成，正式接流量
```

语义严格区分：

| 端点 | 语义 | 失败后果 |
| --- | --- | --- |
| `/healthz` | 进程活着吗 | 重启容器 |
| `/readyz` | 能接流量吗 | 从负载均衡摘掉 |

`degradeOnFailure: true` 时该项失败只降级（`degraded`，仍返回 200）不判死。

自定义路径或关闭：

```ts
RestApplication.create(AppModule, {
  health: { livenessPath: '/live', readinessPath: '/ready' },
  // health: false,   // 完全关闭
});
```

## 7. 优雅退出

```ts
app.enableShutdownHooks();     // SIGTERM / SIGINT
```

编排顺序：

```
markNotReady() → 停止监听 → 排在途请求
  → beforeApplicationShutdown → onModuleDestroy → onApplicationShutdown
```

默认 5s 超时，超时后强制退出（避免被 SIGKILL）。可在 `NofaultApplication` 层用
`shutdownTimeout` 调整；传 `0` 表示不设超时。

## 8. 关闭上下文（不推荐）

```ts
RestApplication.create(AppModule, { contextStore: null });
```

关闭后 `Scope.REQUEST` 不可用（会抛 `MissingContextIdError`），
也不会有 `x-request-id` 响应头。仅在极简脚本场景使用。

## 9. 常见报错

| 报错 | 原因 | 处理 |
| --- | --- | --- |
| `is REQUEST-scoped but was resolved without a context id` | 在请求外解析了请求级 Provider | 确认请求经过 `requestContext()` 中间件，且未设 `contextStore: null` |
| `No request context available` | 用了 `requireContext()` 但不在请求内 | 改用 `currentContext()` 并判空 |
| `/readyz` 一直 503 | 注册过 readiness 检查但没调 `markReady()` | 预热完成后调用 `app.markReady()` |
| 配置改了没生效 | 用的是 `forRoot`（同步版，不含 watch） | 改用 `forRootAsync({ watch: true })` |
| 日志里没有 traceId | 没配 `contextProvider` | 见第 2 节 |
