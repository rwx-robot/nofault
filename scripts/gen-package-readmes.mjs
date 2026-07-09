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