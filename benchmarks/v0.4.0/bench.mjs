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

  @Get('/item${i}/:id')
  get${i}(_r: Get${i}Req): Resp${i} { throw new Error('x'); }
}
`).join('\n');

// ---------------------------------------------------------------- 测量工具

function measure(name, fn, iterations) {
  // 先热身，避免把 JIT 编译时间算进去
  for (let i = 0; i < Math.min(20, iterations); i++) fn();
  const samples = [];
  for (let i = 0; i < iterations; i++) {
    const t = process.hrtime.bigint();
    fn();
    samples.push(Number(process.hrtime.bigint() - t) / 1e6);
  }
  samples.sort((a, b) => a - b);
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  const p95 = samples[Math.floor(samples.length * 0.95)];
  return {
    name,
    iterations,
    meanMs: round(mean),
    p95Ms: round(p95),
    opsPerSec: round(1000 / mean),
  };
}

function round(n) {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------- 主流程

const { parseContract } = await import(join(repoRoot, 'packages/parser/dist/index.js'));
const { generate, writeFiles } = await import(join(repoRoot, 'packages/codegen/dist/index.js'));

console.log(`\n[v0.4.0] codegen benchmark — ${opts.iterations} iterations\n`);

const parseApi = measure('parse .api', () => parseContract(API_CONTRACT, 'bench.api', 'api'), opts.iterations);
const parseTs = measure('parse .api.ts', () => parseContract(TS_CONTRACT, 'bench.api.ts', 'ts'), opts.iterations);

const specFromApi = parseContract(API_CONTRACT, 'bench.api', 'api');
const specFromTs = parseContract(TS_CONTRACT, 'bench.api.ts', 'ts');

const genApi = measure('generate (from .api)', () => generate(specFromApi, { rootModule: true }), opts.iterations);
const genTs = measure('generate (from .api.ts)', () => generate(specFromTs, { rootModule: true }), opts.iterations);

// 端到端：解析 + 生成 + 写盘
const files = generate(specFromApi, { rootModule: true }).files;
const e2e = measure(
  'end-to-end (parse+generate+write)',
  () => {
    const dir = mkdtempSync(join(tmpdir(), 'nf-bench-'));
    const spec = parseContract(API_CONTRACT, 'bench.api', 'api');
    writeFiles(generate(spec, { rootModule: true }).files, { outDir: join(dir, 'src') });
    rmSync(dir, { recursive: true, force: true });
  },
  Math.max(10, Math.round(opts.iterations / 10)),
);

// 杠杆率：契约行数 vs 生成行数
const contractLines = API_CONTRACT.split('\n').length;
const generatedLines = files.reduce((n, f) => n + f.content.split('\n').length, 0);

const micro = { parseApi, parseTs, genApi, genTs, e2e };
const leverage = {
  contractLines,
  generatedFiles: files.length,
  generatedLines,
  ratio: round(generatedLines / contractLines),
};

console.log('A. 解析');
console.log(`   .api        ${parseApi.meanMs} ms  (${parseApi.opsPerSec} ops/sec, p95 ${parseApi.p95Ms} ms)`);
console.log(`   .api.ts     ${parseTs.meanMs} ms  (${parseTs.opsPerSec} ops/sec, p95 ${parseTs.p95Ms} ms)`);
console.log('B. 生成');
console.log(`   from .api   ${genApi.meanMs} ms  (${genApi.opsPerSec} ops/sec)`);
console.log(`   from .api.ts${genTs.meanMs} ms  (${genTs.opsPerSec} ops/sec)`);
console.log('C. 端到端（含写盘）');
console.log(`   ${e2e.meanMs} ms  (p95 ${e2e.p95Ms} ms)`);
console.log(`\n杠杆率：${contractLines} 行契约 -> ${generatedLines} 行代码 / ${files.length} 个文件（${leverage.ratio}x）\n`);

if (opts.report) {
  writeFileSync(
    join(here, 'results.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), micro, leverage }, null, 2),
  );
  console.log('结果已写入 benchmarks/v0.4.0/results.json');
}
