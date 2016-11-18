/**
 * v0.4.0 端到端：契约 → 生成 → 编译 → 真的跑起来。
 *
 * 前三步各自都能单测覆盖，但只有把它们串起来才回答了真问题：
 * **生成出来的代码能不能编译、能不能被框架加载、路由有没有真的注册上。**
 * 这三件事中任何一件挂了，整个代码生成能力就是零。
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import 'reflect-metadata';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { generateApi } from '@nofault/cli';
import { bodyParser } from '@nofault/rest';
import { RestApplication } from '@nofault/rest';

const ROOT = resolve(__dirname, '../../..');

// 生成的工程必须落在仓库内，vitest/vite 才会顺便帮它转译（后面要真的 import 起来）
const PROJECT = resolve(ROOT, '.tmp', `v0.4.0-it-${Date.now()}`);

const API_CONTRACT = `
syntax = "v1"

type GreetReq {
  Name  string \`json:"name"\`
  Count int    \`json:"count,optional"\`
}

type GreetResp {
  Text string \`json:"text"\`
}

type GetUserReq {
  Id int \`path:"id"\`
}

type UserResp {
  Id   int    \`json:"id"\`
  Name string \`json:"name"\`
}

@server (
  group:  user
  prefix: /api
)
service user-api {
  @handler ping
  get /ping returns (GreetResp)

  @handler greet
  post /greet (GreetReq) returns (GreetResp)

  @handler getUser
  get /users/:id (GetUserReq) returns (UserResp)
}
`;

const TS_CONTRACT = `
import { Api, Prefix, Get, Post, Body, Query, IsString, IsInt, MinLength } from '@nofault/dsl';

export class ItemReq {
  @Query('id') @IsInt()
  id!: number;
}

export class ListReq {
  @Query('page') @IsInt()
  page!: number;
}

export class ItemResp {
  @Body('title') @IsString() @MinLength(1)
  title!: string;
}

@Api('item')
@Prefix('/v2')
export class ItemService {
  @Get('/:id')
  get(req: ItemReq): ItemResp { throw new Error('x'); }

  @Get('/search')
  search(req: ListReq): ItemResp { throw new Error('x'); }
}
`;

type ModuleCtor = new (...args: never[]) => object;

const generatedFiles: string[] = [];

beforeAll(() => {
  mkdirSync(join(PROJECT, 'api'), { recursive: true });
  writeFileSync(join(PROJECT, 'api', 'user.api'), API_CONTRACT, 'utf8');
  writeFileSync(join(PROJECT, 'api', 'item.api.ts'), TS_CONTRACT, 'utf8');

  for (const [contract, out] of [
    ['user.api', 'src'],
    ['item.api.ts', 'src'],
  ] as const) {
    const result = generateApi({
      contract: join(PROJECT, 'api', contract),
      out: join(PROJECT, out),
      rootModule: false,
    });
    generatedFiles.push(...result.files.map((f) => f.path));
  }

  writeFileSync(join(PROJECT, 'tsconfig.json'), JSON.stringify(TSCONFIG_FOR_GENERATED, null, 2), 'utf8');
});

afterAll(() => {
  // 生成物是临时产物，必须清理干净，否则下次跑会把上一次的文件也算进来
  rmSync(resolve(ROOT, '.tmp'), { recursive: true, force: true });
});

const TSCONFIG_FOR_GENERATED = {
  compilerOptions: {
    target: 'ES2022',
    module: 'commonjs',
    moduleResolution: 'node',
    lib: ['ES2022'],
    experimentalDecorators: true,
    emitDecoratorMetadata: true,
    strict: true,
    skipLibCheck: true,
    esModuleInterop: true,
    noEmit: true,
    baseUrl: '.',
    paths: {
      '@nofault/core': ['../../packages/core/src/index.ts'],
      '@nofault/rest': ['../../packages/rest/src/index.ts'],
      '@nofault/logger': ['../../packages/logger/src/index.ts'],
      '@nofault/config': ['../../packages/config/src/index.ts'],
      '@nofault/context': ['../../packages/context/src/index.ts'],
      '@nofault/dsl': ['../../packages/dsl/src/index.ts'],
      'reflect-metadata': ['../../node_modules/reflect-metadata/index.d.ts'],
    },
  },
  include: ['src/**/*.ts'],
};

describe('v0.4.0 pipeline: contract -> code', () => {
  it('generates the expected file set', () => {
    expect(generatedFiles).toContain('dto/greet-req.dto.ts');
    expect(generatedFiles).toContain('user/user.controller.ts');
    expect(generatedFiles).toContain('user/user.service.ts');
    expect(generatedFiles).toContain('user/user.module.ts');
    expect(generatedFiles).toContain('dto/get-user-req.dto.ts');
    // 第二种输入格式走同一条流水线，产出同样形态的文件
    expect(generatedFiles).toContain('item/item.controller.ts');
  });

  it('produces TypeScript that actually compiles', () => {
    // 这是整条流水线的验收标准：生成的东西必须能被 tsc 编译通过
    const tsc = resolve(ROOT, 'node_modules/typescript/bin/tsc');
    expect(existsSync(tsc)).toBe(true);
    try {
      execFileSync(process.execPath, [tsc, '-p', join(PROJECT, 'tsconfig.json')], {
        cwd: PROJECT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string };
      throw new Error(`generated code does not compile:\n${e.stdout ?? ''}${e.stderr ?? ''}`);
    }
  });

  it('maps go scalar types onto TS types, keyed by the wire name', () => {
    const dto = readFileSync(join(PROJECT, 'src/dto/greet-req.dto.ts'), 'utf8');
    // 属性名取 json tag（`count` / `name`）而不是 Go 字段名（`Count` / `Name`），
    // 否则 DTO 能编译但永远绑定不上 —— 见 generate.ts propName 的注释
    expect(dto).toContain('count!: number');
    expect(dto).toContain('name!: string');
    // go int -> number
    expect(dto).not.toContain('int');
    // `,optional` 的 json tag 要变成 @IsOptional()
    expect(dto).toContain('@IsOptional()');
  });

  it('loads the generated modules into a real running server', async () => {
    const modulePath = resolve(PROJECT, 'src/user/user.module.ts');
    const mod = (await import(pathToFileURL(modulePath).href)) as Record<string, ModuleCtor>;
    const UserModule = mod.UserModule;
    expect(UserModule).toBeTruthy();

    const app = await RestApplication.create(UserModule, {
      quiet: true,
      middleware: [bodyParser()],
    });
    const { port } = await app.listen(0, '127.0.0.1');

    try {
      const routes = app.getRoutes().map((r) => `${r.method} ${r.path}`);
      // 控制器前缀 + 方法路径真的拼上了，说明装饰器元数据被正确读取
      expect(routes).toContain('GET /api/user/ping');
      expect(routes).toContain('POST /api/user/greet');

      // 路径变量的路由必须整体注册为 `/users/:id`
      expect(routes).toContain('GET /api/user/users/:id');
      const notFound = await fetch(`http://127.0.0.1:${port}/api/user/users`);
      expect(notFound.status).toBe(404);
      const byId = await fetch(`http://127.0.0.1:${port}/api/user/users/7`);
      expect(byId.status).toBe(500);

      const health = await fetch(`http://127.0.0.1:${port}/healthz`);
      expect(health.status).toBe(200);

      // 骨架方法抛 "not implemented"，所以路由命中就该是 500 而不是 404
      const res = await fetch(`http://127.0.0.1:${port}/api/user/ping`);
      expect(res.status).toBe(500);
      const body = (await res.json()) as Record<string, unknown>;
      expect(JSON.stringify(body)).toContain('not implemented');
    } finally {
      await app.close();
    }
  });

  it('validates query parameters too, not just the body', async () => {
    // v0.4.0 之前 query DTO 完全不校验；现在框架按"DTO 绑在哪儿"取数据源
    const mod = (await import(pathToFileURL(resolve(PROJECT, 'src/item/item.module.ts')).href)) as Record<string, ModuleCtor>;
    const app = await RestApplication.create(mod.ItemModule!, { quiet: true, middleware: [bodyParser()] });
    const { port } = await app.listen(0, '127.0.0.1');
    try {
      const bad = await fetch(`http://127.0.0.1:${port}/v2/item/search?page=abc`);
      expect(bad.status).toBe(422);
      // 合法数字要能通过（query 里的 "3" 会按声明类型强制成 3）
      const okShape = await fetch(`http://127.0.0.1:${port}/v2/item/search?page=3`);
      expect([200, 500]).toContain(okShape.status);
    } finally {
      await app.close();
    }
  });

  it('validates the request body through the generated dto', async () => {
    const mod = (await import(pathToFileURL(resolve(PROJECT, 'src/user/user.module.ts')).href)) as Record<string, ModuleCtor>;
    const app = await RestApplication.create(mod.UserModule!, { quiet: true, middleware: [bodyParser()] });
    const { port } = await app.listen(0, '127.0.0.1');
    try {
      // Count 带 @IsInt()（且 optional）：传非数字应当被 DTO 校验拦在框架层（422），
      // 而不是流进尚不存在的业务实现
      const bad = await fetch(`http://127.0.0.1:${port}/api/user/greet`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'bob', count: 'not-a-number' }),
      });
      expect(bad.status).toBe(422);

      // 合法入参不在 dto 里必填字段冲突时应走到业务实现（骨架抛 not-implemented）
      const ok = await fetch(`http://127.0.0.1:${port}/api/user/greet`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'bob' }),
      });
      expect(ok.status).toBe(500);
    } finally {
      await app.close();
    }
  });
});
