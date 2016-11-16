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