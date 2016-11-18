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