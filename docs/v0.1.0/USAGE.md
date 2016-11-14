# nofault v0.1.0 使用说明

## 1. 声明可注入的服务

```ts
import { Injectable, type OnApplicationBootstrap } from '@nofault/core';
import { ConfigService } from '@nofault/config';

@Injectable()
export class GreeterService implements OnApplicationBootstrap {
  private readonly greeting: string;

  // 按类型注入：依赖 TS 发射的 design:paramtypes 元数据
  constructor(private readonly config: ConfigService) {
    this.greeting = this.config.get<string>('app.greeting', 'Hello');
  }

  onApplicationBootstrap(): void {
    console.log('ready');
  }

  greet(name?: string): string {
    return name ? `${this.greeting}, ${name}!` : `${this.greeting}!`;
  }
}
```

## 2. 声明模块

```ts
import { Module } from '@nofault/core';
import { ConfigModule } from '@nofault/config';

@Module({
  imports: [ConfigModule.forRoot({ path: './config/app.yaml' })],
  providers: [GreeterService],
  exports: [GreeterService],
})
export class AppModule {}
```

`ConfigModule.forRoot()` 默认注册为**全局模块**，所以任何模块的服务都能直接注入 `ConfigService`。

## 3. 启动应用

```ts
import 'reflect-metadata';                       // 必须最先 import
import { createHttpApplication } from '@nofault/http';
import { AppModule } from './app.module';
import { GreeterService } from './greeter.service';

const app = await createHttpApplication(AppModule, { name: 'demo' });
const greeter = await app.get(GreeterService);

app.use((req, res) => {
  res.statusCode = 200;
  res.end(greeter.greet('world'));
  return true;      // 返回 true = 请求已处理，终止 handler 链
});

app.enableShutdownHooks();     // SIGTERM / SIGINT 优雅退出
await app.listen(3000);
```

## 4. Provider 的五种写法

```ts
@Module({
  providers: [
    UserService,                                        // ① 类简写
    { provide: 'API_URL', useValue: 'https://x.dev' },   // ② 值
    { provide: 'CACHE', useClass: RedisCache },          // ③ 类替换
    {
      provide: 'POOL',
      useFactory: (cfg: ConfigService) => createPool(cfg.get<number>('db.pool', 10)),
      inject: [ConfigService],
    },                                                   // ④ 工厂
    { provide: 'LEGACY_CACHE', useExisting: 'CACHE' },   // ⑤ 别名
  ],
})
export class SomeModule {}
```

## 5. 注入方式

```ts
@Injectable()
export class Demo {
  constructor(
    private readonly repo: UserRepo,              // 按类型
    @Inject('API_URL') private readonly url: string,  // 按令牌
    @Optional() private readonly tracer?: Tracer,     // 可选，缺失注入 undefined
  ) {}

  @Inject(Logger) private readonly logger!: Logger;   // 属性注入
}
```

## 6. 作用域

```ts
@Injectable({ scope: Scope.SINGLETON })  // 默认：全局一个实例
@Injectable({ scope: Scope.TRANSIENT })  // 每次解析都新建
@Injectable({ scope: Scope.REQUEST })    // v0.3.0 启用
```

## 7. 全局模块

```ts
@Global()
@Module({ providers: [MetricsService], exports: [MetricsService] })
export class MetricsModule {}
```

注册一次后，任何模块都能注入 `MetricsService`，无需重复 import。

## 8. 配置读取

```ts
const port = config.get<number>('server.port');           // number | undefined
const host = config.get<string>('server.host', '0.0.0.0'); // string（有默认值）
const dsn  = config.getOrThrow<string>('db.dsn');          // 缺失即抛 ConfigError
```

环境变量覆盖规则：`NOFAULT_SERVER__PORT=8080` → `server.port = 8080`
（双下划线表示层级，单下划线表示键内下划线）。

## 9. 日志

```ts
import { createLogger, LogLevel, MemoryTransport } from '@nofault/logger';

const log = createLogger({ level: LogLevel.INFO, context: 'order' });
log.info('created', { orderId: 1 });      // 结构化字段
log.error('failed', { orderId: 1 }, err); // 自动序列化错误堆栈
const child = log.child('payment');       // context 变成 order:payment
```

测试里用 `MemoryTransport` 收集记录做断言：

```ts
const t = new MemoryTransport();
const log = createLogger({ transports: [t] });
log.info('hi');
expect(t.records).toHaveLength(1);
```

## 10. HTTP 响应工具

```ts
import { sendJson, sendText, redirect, readJsonBody } from '@nofault/http';

sendJson(res, 200, { ok: true });
sendText(res, 404, 'not found');
redirect(res, 302, '/login');
const body = await readJsonBody(req);      // 带 1MB 大小上限
```

## 11. 生命周期钩子

| 钩子 | 触发时机 |
| --- | --- |
| `onModuleInit` | 所有 Provider 实例化完成后 |
| `onApplicationBootstrap` | 应用就绪、监听之前 |
| `beforeApplicationShutdown(signal?)` | 收到退出信号后立即 |
| `onModuleDestroy` | 资源释放 |
| `onApplicationShutdown(signal?)` | 进程退出前最后一步 |

## 12. 常见报错

| 报错 | 原因 | 处理 |
| --- | --- | --- |
| `can't resolve dependencies of the provider X` | X 未在任何模块声明，或声明它的模块没被 import | 在 `providers` 里补上，或在导出它的模块里 `exports` |
| `Circular dependency detected: A -> B -> A` | 构造注入成环 | 用工厂 Provider 或 `@Inject(forwardRef)` 思路拆环 |
| `No HTTP adapter configured` | 直接用了 `NofaultFactory.create()` 却没传适配器 | 改用 `createHttpApplication()` 或显式传 `httpAdapter` |
| `No provider found for token X in the whole container` | `app.get()` 全局查找也没找到 | 确认模块已 import |
