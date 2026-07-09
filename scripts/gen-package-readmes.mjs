#!/usr/bin/env node
/**
 * 生成各子包的 README。
 *
 * 每个包的 package.json 都写了 `files: ["dist", "README.md"]`，
 * 缺了 README 发包就是空文档。这里集中维护各包的定位与最快上手。
 *
 * 内容刻意保持"能改得动"的规模：一句话定位 + 为什么这么设计 + 最小示例 + 注意事项。
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const packagesDir = join(here, '..', 'packages');

const PACKAGES = [
  {
    dir: 'core',
    name: '@nofault/core',
    version: 'v0.1.0',
    tagline: 'IoC 容器、模块系统与生命周期。',
    why: [
      '装饰器 + 元数据反射（遵循 NestJS 约定），工厂用 `createXxx()`、导出用 camelCase',
      '容器在**启动阶段**解析依赖图：缺依赖会立刻失败，而不是等到第一次调用才炸',
      '三种 Provider 形态：`useClass` / `useValue` / `useFactory`',
      '三种作用域：SINGLETON（默认）/ REQUEST / TRANSIENT',
    ],
    example: `import 'reflect-metadata';
import { Injectable, Module, Inject } from '@nofault/core';

@Injectable()
class UserRepository {
  find(id: string) { return { id }; }
}

@Injectable()
class UserService {
  constructor(private readonly repo: UserRepository) {}
  get(id: string) { return this.repo.find(id); }
}

@Module({ providers: [UserRepository, UserService] })
class UserModule {}`,
    note: '装饰器元数据依赖 `emitDecoratorMetadata`；关掉它 `@Inject` 会拿不到类型，且报错指不到这里。',
  },
  {
    dir: 'config',
    name: '@nofault/config',
    version: 'v0.1.0',
    tagline: '配置加载与热更新。',
    why: [
      '从文件 + 环境变量加载，环境变量优先（部署时改配置不该改动代码）',
      '**热更新**：文件变更后通知订阅者，不需要重启进程',
      '取值失败要有明确报错——配置拼错是最常见的一类"启动即崩"',
    ],
    example: `import { loadConfig } from '@nofault/config';

const config = await loadConfig({ file: 'app.yaml' });
config.onChange((next) => console.log('reloaded', next));`,
    note: '敏感值走环境变量，不要写进配置文件。',
  },
  {
    dir: 'logger',
    name: '@nofault/logger',
    version: 'v0.1.0',
    tagline: '分级结构化日志。',
    why: [
      '日志是**给人看还是给机器看**决定了格式：这里默认结构化（JSON），便于采集',
      '分级：debug / info / warn / error',
      '子日志器带固定字段（如 `module`），省得每行都写一遍',
    ],
    example: `import { createLogger } from '@nofault/logger';

const log = createLogger({ level: 'info' });
log.info('user created', { id: 'u1' });
const scoped = log.child({ module: 'orders' });
scoped.warn('slow query', { ms: 812 });`,
    note: '把 traceId 写进字段，才能和链路追踪对上（见 @nofault/telemetry）。',
  },
  {
    dir: 'http',
    name: '@nofault/http',
    version: 'v0.1.0',
    tagline: '底层 HTTP 适配（基于 node:http，零依赖）。',
    why: [
      '只做一件事：把 Node 原生请求/响应包成统一形态',
      '不绑 Express / Fastify——Web 框架的抽象不该泄漏到内核',
      '`@nofault/rest` 建立在它之上',
    ],
    example: `import { createHttpApplication } from '@nofault/http';
import { AppModule } from './app.module';

const app = await createHttpApplication(AppModule);
await app.listen(3000);`,
    note: '业务代码通常直接用 `@nofault/rest`，这一层只在需要裸 HTTP 能力时才碰。',
  },
  {
    dir: 'rest',
    name: '@nofault/rest',
    version: 'v0.2.0',
    tagline: 'Web 层：Radix 路由、装饰器、中间件链、DTO 校验、统一错误响应。',
    why: [
      '路由用 Radix 树，路径参数 `/users/:id` 是 O(路径段数) 而非遍历全表',
      '参数**必须带装饰器**（`@Body` / `@Query` / `@Param`）：框架靠它知道值从哪来，',
      '漏了装饰器会静默拿到 undefined——表现为 204 空响应，非常难查',
      'DTO 校验按**实际绑定来源**取值：绑 query 就校验 query，GET 不再绕过校验',
      'query string 的值永远是字符串，整对象绑 DTO 时按 `design:type` 强制转换',
    ],
    example: `import { Controller, Get, Post, Body, Param, Query, Validate } from '@nofault/rest';

class CreateUserReq {
  @IsEmail() email!: string;
  @MinLength(2) name!: string;
}

@Controller('/users')
class UserController {
  @Post('/')
  @Validate(CreateUserReq)
  async create(@Body() body: CreateUserReq) { return { ok: true }; }

  @Get('/:id')
  async get(@Param('id') id: string) { return { id }; }
}`,
    note: '错误语义：422 校验失败、400 参数错误、404 找不到、500 未处理异常。熔断/超时要显式翻译成 503/504。',
  },
  {
    dir: 'context',
    name: '@nofault/context',
    version: 'v0.3.0',
    tagline: '请求上下文：AsyncLocalStorage 传播、REQUEST 作用域、traceId 透传。',
    why: [
      '用 `AsyncLocalStorage` 而不是参数透传：业务代码不该为了"把 traceId 传下去"而多一个参数',
      '生成/继承 W3C `traceparent`——跨服务调用链靠它串起来',
      '给内核提供 REQUEST 作用域需要的 `contextId`',
    ],
    example: `import { requestContextStore, currentContext } from '@nofault/context';

await requestContextStore.run({ traceId: 'abc' }, async () => {
  currentContext()?.traceId;   // 'abc'
});`,
    note: '**"当前上下文"只能存在这里**。用模块级变量在并发下必然串号（v0.6.0 的拦截器、v0.8.0 的活动 Span 都栽过）。',
  },
  {
    dir: 'dsl',
    name: '@nofault/dsl',
    version: 'v0.4.0',
    tagline: '契约中间表示：`ApiSpec` 与契约装饰器。',
    why: [
      '两种输入（`.api` 与 `.api.ts`）**共用一个中间表示**，生成器才不用写两遍',
      '契约装饰器只写元数据、不执行——解析器把契约当文本扫，不 import 用户代码',
      '命名工具（pascal / camel / kebab / snake / singularize）集中一处',
    ],
    example: `import { ApiSpec, FieldSource } from '@nofault/dsl';

const spec: ApiSpec = {
  name: 'demo',
  types: [{ name: 'User', fields: [{ name: 'id', key: 'id', type: 'number', source: FieldSource.BODY, optional: false, rules: [] }] }],
  services: [],
};`,
    note: '字段名（`Name`）与传输键（`name`）是两回事：**传输格式才是契约**。',
  },
  {
    dir: 'parser',
    name: '@nofault/parser',
    version: 'v0.4.0',
    tagline: '契约解析器：手写扫描器 + 递归下降，支持 `.api` 与 `.api.ts`。',
    why: [
      '**不引 ANTLR**：语法很小，自己写才能给出"哪一行哪一列"的报错',
      '两种格式产出同一个 `ApiSpec`',
      '错误带行列号，并指出是哪个服务 / 哪条路由 / 哪个字段',
      '**不执行用户代码**——只当文本扫，避免副作用与安全风险',
    ],
    example: `import { parseContractFile, parseApiSource } from '@nofault/parser';

const spec = await parseContractFile('api/user.api.ts');
// 或
const spec2 = parseApiSource('get /ping returns (Ok)', 'inline.api');`,
    note: '`returns` 是关键字，不是路径片段——漏判会让 `/ping returns (X)` 变成路径 `/pingreturns`。',
  },
  {
    dir: 'codegen',
    name: '@nofault/codegen',
    version: 'v0.10.0',
    tagline: '由契约产出代码与文档：校验、生成、写盘策略、OpenAPI。',
    why: [
      '生成器**不碰 IO**：`generate()` 是纯函数，写盘交给 `writeFiles()`（可测、可 dry-run）',
      '校验一次报完所有问题，而不是遇到第一个就停',
      '**只覆盖自己也认领过的文件**（首行生成标记），删掉标记 = 手工接管',
      'DTO 属性名取**传输键**而非源字段名：照抄源字段名会产出"能编译、能启动、永远绑不上数据"的代码',
    ],
    example: `import { generate, writeFiles, openApiDocument } from '@nofault/codegen';

const { files } = generate(spec, { withOrm: true });
await writeFiles(files, { outDir: 'src', policy: 'generated' });

const doc = openApiDocument(spec, { title: 'User API' });`,
    note: '验收标准是"生成物能编译且能跑"，不是"生成器不抛错"——必须写端到端测试。',
  },
  {
    dir: 'cli',
    name: '@nofault/cli',
    version: 'v0.10.0',
    tagline: '`nofaultctl` 命令行：脚手架、生成、校验、路由、OpenAPI、热重载、环境自检。',
    why: [
      '子命令刻意少而准，**不是一个什么都塞的瑞士军刀**',
      '`doctor` 会解析 tsconfig 的 `extends`：不解析会大面积误报"装饰器元数据没开"',
      '`dev` 重启前等旧进程真的退出——不然抢端口，表现为"改了代码没生效"',
    ],
    example: `nofaultctl new user-service
nofaultctl generate api api/user.api.ts --out src --with-orm
nofaultctl openapi api/user.api.ts --out openapi.json
nofaultctl doctor`,
    note: '进程自己崩溃时**不自动重启**：否则会在坏代码上反复启动，刷屏且看不出原因。',
  },
  {
    dir: 'orm',
    name: '@nofault/orm',
    version: 'v0.5.0',
    tagline: '数据访问：实体映射、Repository、查询构造器、事务、迁移。',
    why: [
      '**方言只生成字符串，数据源是唯一 IO 边界** → 两边的单测完全独立',
      '`MemoryDataSource` 开箱可跑（含迷你 SQL 引擎，供迁移用），`SqlDataSource` 不绑驱动',
      '`save()` 把自增主键上的 0 视为"未设置"：TS 里 `new User().id` 恒为 0',
      '比较前归一化布尔——库里存 1/0，实体上是 true/false，否则"存得进取不出来"',
    ],
    example: `import { Entity, Column, PrimaryGeneratedColumn, Repository, InjectRepository } from '@nofault/orm';

@Entity({ table: 'users' })
class User {
  @PrimaryGeneratedColumn()
  id!: number;
  @Column({ name: 'email' })
  email!: string;
}

class UserService {
  constructor(@InjectRepository(User) private repo: Repository<User>) {}
  find(email: string) { return this.repo.findOne({ email }); }
}`,
    note: '只给"被当作响应类型"的类型建表——请求 DTO 是传输对象，给它建表没意义。',
  },
  {
    dir: 'cache',
    name: '@nofault/cache',
    version: 'v0.5.0',
    tagline: '缓存抽象与内存实现：TTL、LRU、抖动、single-flight。',
    why: [
      '`getOrSet()` 让**缓存击穿在源头消失**：并发同 key 只回源一次',
      'TTL 必须带**抖动**，否则大批 key 同时过期 = 雪崩',
      '不固化 `undefined`——固化"查不到"会让数据写入后永远读不到',
      'LRU 淘汰 + `max` 上限，防止无界增长',
    ],
    example: `import { MemoryCache, NullCache } from '@nofault/cache';

const cache = new MemoryCache({ max: 10_000 });
const user = await cache.getOrSet(\`user:\${id}\`, () => db.find(id), { ttl: 60_000 });`,
    note: '命中与回源差数量级（实测 ~12,000×），所以"能不能命中"几乎是唯一重要的问题。',
  },
  {
    dir: 'rpc',
    name: '@nofault/rpc',
    version: 'v0.6.0',
    tagline: 'RPC 框架：长度前缀分帧、连接池、超时重试、注册发现、拦截器。',
    why: [
      'TCP 是字节流、**没有消息边界** → 自己分帧（`[4 字节长度][JSON]`）',
      '一条连接上可并发多个在途调用 → **请求必须带 id** 才能配对响应',
      '只对"可能成功"的失败重试：网络错误、超时、解析错误；业务错误重试只会放大故障',
      '按目标**去重在建连接**——否则 N 个并发首调各建一条，池化在最需要它时失效',
    ],
    example: `import { RpcServer, RpcClient, InMemoryRegistry } from '@nofault/rpc';

const server = new RpcServer();
server.registerService('user', new UserService());
await server.listen(9000);

const client = new RpcClient({ registry: new InMemoryRegistry() });
const user = await client.call('user', 'get', { id: 1 });`,
    note: '超时映射成 **504**（Gateway Timeout），不是笼统的 500——504 才是"上游超时"的正确语义。',
  },
  {
    dir: 'resilience',
    name: '@nofault/resilience',
    version: 'v0.7.0',
    tagline: '服务治理四件套：令牌桶限流、三态熔断器、舱壁隔离、指数退避。',
    why: [
      '**令牌桶而非固定窗口**：固定窗口在切换瞬间放过 2 倍流量',
      '熔断打开后**绝不再打下游**；半开只放行有限探针（否则冷却结束瞬间会再打挂下游）',
      '队列必须**有界**：无界队列只是把"立即失败"延后，还吃内存',
      '退避必须**抖动**：所有调用方同时重试 = 重试风暴',
      '治理判定全部 <1µs（不到 HTTP 链路的 0.2%）→ 没有理由因为性能而不加保护',
    ],
    example: `import { CircuitBreaker, TokenBucket, Bulkhead, retryWithBackoff } from '@nofault/resilience';

const breaker = new CircuitBreaker({ failureThreshold: 5, resetTimeoutMs: 3000 });
await breaker.run(() => callDownstream());`,
    note: '中间件顺序：**限流 → 舱壁 → 熔断**。反了会让被限流的请求也占着并发配额。',
  },
  {
    dir: 'telemetry',
    name: '@nofault/telemetry',
    version: 'v0.8.0',
    tagline: '可观测性：Span（采样/批量导出）与指标（Prometheus 文本）。',
    why: [
      '**采样在创建时决定**：`startSpan()` 不采样直接返回 `null`，不为丢弃的链路付一分钱（0.27µs vs 5.84µs）',
      '父子 Span 靠**请求上下文里的活动 Span** 建立，结束时自动还原',
      'Histogram 只存桶计数（存全部样本在几千 QPS 下必然 OOM），分位数给桶上界',
      '错误状态码要在 `catch` 里记——`finally` 里框架还没映射状态码，会读到 200',
    ],
    example: `import { Tracer, MetricRegistry, observability } from '@nofault/telemetry';

const tracer = new Tracer(exporter, ratioSampler(0.1));
await tracer.trace('checkout', async (span) => {
  span?.setAttributes({ orderId });
  return doWork();
});`,
    note: '路由标签**必须收敛**（`/users/:id` 而非 `/users/1`），否则基数爆炸会同时打爆内存和抓取耗时。',
  },
  {
    dir: 'micro',
    name: '@nofault/micro',
    version: 'v0.9.0',
    tagline: '微服务全家桶：分布式 ID、分布式锁、cron 调度、事件总线、一键装配。',
    why: [
      'Snowflake 返回**字符串**：63 位超过 `MAX_SAFE_INTEGER`，转 number 会静默丢精度',
      '序列号耗尽要**等到下一毫秒**，回绕会产生重复 ID',
      '释放锁**必须校验 token**：不校验会释放别人的锁，等于没加锁',
      '调度器默认**不补跑、不允许重叠**（补跑会在重启瞬间涌入几十个任务）',
      'cron 的日与周是**或**关系（Unix 语义），做成"与"则 `0 0 1 * 0` 永远不触发',
      '装配顺序即正确性：迁移 → 订阅事件 → 监听 → 定时任务 → **最后**置就绪',
    ],
    example: `import { Snowflake, DistributedLock, Scheduler, EventBus, Microservice } from '@nofault/micro';

const ids = new Snowflake({ workerId: 1 });
const id = ids.nextIdString();

await lock.run(async () => { /* 同一时刻只有一个实例在做 */ });`,
    note: '停机是启动的**逆序**：先停定时任务、再关监听、最后释放数据源。',
  },
  {
    dir: 'security',
    name: '@nofault/security',
    version: 'v1.0.0',
    tagline: '认证与授权：JWT（HS256）、scrypt 密码哈希、RBAC。',
    why: [
      '**`alg` 不从 token 读**：照 header 说的算法去验证，正是 alg:none 与 RS→HS 混淆的根源',
      '签名比较用 `timingSafeEqual`——`===` 在第一个不同字节就返回',
      '容忍 30 秒时钟偏移：不容忍的话机器差几秒就大面积误判',
      'token 无效一律 401 **且不透露原因**（"签名不对"还是"过期了"都是在递信息）',
      '哈希参数写进结果（`scrypt$N$...`）：以后调高成本时老密码仍能验证',
      '**默认拒绝**：漏写装饰器应当是"调不通"，而不是"谁都能调"',
    ],
    example: `import { Jwt, Roles, Public, authMiddleware } from '@nofault/security';

const jwt = new Jwt(process.env.JWT_SECRET!, { issuer: 'my-app' });
const token = jwt.sign({ sub: user.id, roles: user.roles }, 3600);

class AdminController {
  @Public() @Get('/health') health() {}
  @Roles('admin') @Get('/wipe') wipe() {}
}`,
    note: '中间件要**先**判断 `@Public` **再**决定 401——顺序反了会把健康检查一起拦掉（误摘除，生产事故级）。',
  },
  {
    dir: 'mcp',
    name: '@nofault/mcp',
    version: 'v1.0.0',
    tagline: 'MCP 服务器模式：把 nofault 的能力暴露给 AI 客户端（stdio，换行分隔 JSON-RPC）。',
    why: [
      '**零依赖**：MCP 的 stdio 传输就是"一行一个 JSON"，不需要 SDK',
      '**流可注入**：默认 stdin/stdout，测试与嵌入时传入自定义流',
      '实现服务器侧最小面：`initialize` / `tools/list` / `tools/call` / `ping`，其余一律 -32601',
      '**工具错误走 result.isError**：工具自身的失败是"调用成功但结果为错误"，只有协议级错误才用 JSON-RPC error',
    ],
    example: `import { McpServer } from '@nofault/mcp';

const server = new McpServer({
  name: 'nofault-mcp',
  version: '1.0.0',
  tools: [{
    name: 'list-users',
    description: 'list users by page',
    inputSchema: { type: 'object', properties: { page: { type: 'number' } } },
    handler: (input) => users.page(input.page),
  }],
});
server.start(); // 挂在 stdio 上，交给 MCP 客户端`,
    note: '工具的 inputSchema 是 JSON Schema；参数校验由工具自身负责，协议层只做分发。',
  },
];

function render(p) {
  const why = p.why.map((w) => `- ${w}`).join('\n');
  return `# ${p.name}

${p.tagline}

**引入版本**：${p.version}

## 为什么这么设计

${why}

## 最快上手

\`\`\`ts
${p.example}
\`\`\`

## 注意

${p.note}

## 相关文档

- 架构说明 → [\`docs/${p.version}/ARCHITECTURE.md\`](../../docs/${p.version}/ARCHITECTURE.md)
- 变更记录 → [\`docs/${p.version}/CHANGELOG.md\`](../../docs/${p.version}/CHANGELOG.md)
`;
}

for (const p of PACKAGES) {
  const file = join(packagesDir, p.dir, 'README.md');
  writeFileSync(file, render(p));
  console.log(`wrote packages/${p.dir}/README.md`);
}
console.log(`\n共 ${PACKAGES.length} 份`);
