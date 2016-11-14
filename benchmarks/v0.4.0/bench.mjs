#!/usr/bin/env node
/**
 * v0.4.0 Benchmark —— 代码生成的成本
 *
 * 这一版的性能问题不在 HTTP 请求路径上，而在**开发期的等待**上：
 * 契约改一行，生成要多久？如果答案是"几百毫秒"，还能边改边跑；
 * 如果答案是"几秒"，开发者就不会频繁 regenerate，契约也就慢慢和代码脱节。
 *
 * 测三项：
 *  A. 解析：`.api` 与 TS 契约的解析吞吐（纯 CPU）
 *  B. 生成：Spec → 文件内容的吞吐
 *  C. 落盘：解析 + 生成 + 写盘 的端到端耗时（真实体感）
 *  另附一个杠杆率：1 行契约换来多少行生成代码
 *
 * 用法：
 *   node bench.mjs [--iterations=200] [--report]
 */
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');

function parseArgs() {
  const out = { iterations: 200, report: false };
  for (const a of process.argv.slice(2)) {
    const [k, v] = a.replace(/^--/, '').split('=');
    if (k === 'report') out.report = true;
    else if (k === 'iterations') out.iterations = Number(v);
  }
  return out;
}

const opts = parseArgs();

// ---------------------------------------------------------------- 契约样本

const API_CONTRACT = Array.from({ length: 12 }, (_, i) => `
type Req${i} {
  Name  string \`json:"name"\`
  Count int    \`json:"count,optional"\`
}
type Resp${i} {
  Ok   int    \`json:"ok"\`
  Text string \`json:"text"\`
}

type Get${i}Req {
  Id int \`path:"id"\`
}

@server ( group: svc${i} prefix: /api )
service svc${i}-api {
  @handler ping${i}
  get /ping${i} returns (Resp${i})

  @handler greet${i}
  post /greet${i} (Req${i}) returns (Resp${i})

  @handler get${i}
  get /item${i}/:id (Get${i}Req) returns (Resp${i})
}
`).join('\n');

const TS_CONTRACT = Array.from({ length: 12 }, (_, i) => `
export class Req${i} {
  @Body('name') @IsString() @MinLength(2)
  name!: string;

  @Body('count') @IsInt() @Optional()
  count?: number;
}
export class Resp${i} {
  @Body('ok') @IsInt()
  ok!: number;
}
export class Get${i}Req {
  @Path('id') @IsInt()
  id!: number;
}

@Api('svc${i}')
@Prefix('/api')
export class Svc${i}Service {
  @Get('/ping${i}')
  ping${i}(): Resp${i} { throw new Error('x'); }

  @Post('/greet${i}')
  greet${i}(_r: Req${i}): Resp${i} { throw new Error('x'); }
