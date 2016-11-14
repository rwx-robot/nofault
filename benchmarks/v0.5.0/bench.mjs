#!/usr/bin/env node
/**
 * v0.5.0 Benchmark —— 数据访问与缓存
 *
 * 关注两件事：
 *  A. ORM 自身的开销：一次 CRUD 要多久（内存数据源，排除网络）
 *  B. 缓存的收益：命中 vs 回源，以及**并发击穿**时能省多少次回源
 *
 * 用法：
 *   node bench.mjs [--iterations=2000] [--report]
 */
import { writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');

function parseArgs() {
  const out = { iterations: 2000, report: false };
  for (const a of process.argv.slice(2)) {
    const [k, v] = a.replace(/^--/, '').split('=');
    if (k === 'report') out.report = true;
    else if (k === 'iterations') out.iterations = Number(v);
  }
  return out;
}
const opts = parseArgs();

const { MemoryDataSource, Repository, Entity, Column, PrimaryGeneratedColumn, Migrator } = await import(
  join(repoRoot, 'packages/orm/dist/index.js')
);
const { MemoryCache, NullCache } = await import(join(repoRoot, 'packages/cache/dist/index.js'));

class Row {
  constructor() {
    this.id = 0;
    this.name = '';
    this.score = 0;
  }
}
Entity({ table: 'bench_rows' })(Row);
PrimaryGeneratedColumn()(Row.prototype, 'id');
Column({ name: 'name', type: 'string' })(Row.prototype, 'name');
Column({ name: 'score', type: 'int' })(Row.prototype, 'score');

const source = new MemoryDataSource();
const repo = new Repository(Row, source);
await repo.sync();

async function bench(name, fn, iterations = opts.iterations) {
  for (let i = 0; i < Math.min(100, iterations); i++) await fn(i);
  const samples = [];
  for (let i = 0; i < iterations; i++) {
    const t = process.hrtime.bigint();
    await fn(i);
    samples.push(Number(process.hrtime.bigint() - t) / 1e6);
  }
  samples.sort((a, b) => a - b);
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  const p95 = samples[Math.floor(samples.length * 0.95)];
  return { name, meanMs: round(mean), p95Ms: round(p95), opsPerSec: round(1000 / mean) };
}

function round(n) {
  return Math.round(n * 100) / 100;
}

const insert = await bench('insert', async (i) => {
  const row = new Row();
  row.name = `user-${i}`;
  row.score = i % 100;
  await repo.save(row);
});

const findById = await bench('findById', async (i) => {
  await repo.findById((i % 500) + 1);
});

const findWithQuery = await bench('query (where + order + limit)', async () => {
  await repo.createQueryBuilder().andWhere('score', '>=', 50).orderBy('score', 'DESC').limit(10).getMany();
});

const paginate = await bench('paginate', async (i) => {
  await repo.paginate((i % 5) + 1, 20);
});

const transaction = await bench('transaction (commit)', async () => {
  await source.transaction(async () => {
    const row = new Row();
    row.name = 'tx';
    row.score = 1;
    await repo.save(row);
  });
});

// ------------------------------------------------------------------ 缓存
const cache = new MemoryCache({ ttl: 60_000, max: 10_000 });
const nullCache = new NullCache();

// 回源统一带 1ms 模拟延迟。
// 不加延迟的话两边都是 0ms，"加速比"算出来是 0x —— 测了个寂寞。
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const load = async (i) => {
  await sleep(1);
  return { v: i };
};

// 先预热：不预热的话每次都是 miss，量到的其实是"回源延迟"
for (let i = 0; i < 100; i++) await cache.getOrSet(`k:${i}`, () => load(i));

const cacheHit = await bench('cache get (hit)', async (i) => {
  await cache.getOrSet(`k:${i % 100}`, () => load(i));
});

const cacheMiss = await bench('loader only (no cache)', async (i) => {
  await nullCache.getOrSet(`k:${i % 100}`, () => load(i));
});

// 并发击穿：同一 key 打 50 次
const stampedeKey = 'stampede';
let stampedeLoads = 0;
const t0 = process.hrtime.bigint();
await Promise.all(
  Array.from({ length: 50 }, () =>
    cache.getOrSet(stampedeKey, async () => {
      stampedeLoads++;
      return { v: 1 };
    }),
  ),
);
const stampedeMs = Number(process.hrtime.bigint() - t0) / 1e6;

const migrationSource = new MemoryDataSource();
const migrator = new Migrator(
  migrationSource,
  Array.from({ length: 20 }, (_, i) => ({
    version: `v${String(i).padStart(3, '0')}`,
    up: async (ctx) => {
      await ctx.execute(`CREATE TABLE IF NOT EXISTS t_${i} (id INTEGER)`);
    },
    down: async (ctx) => {
      await ctx.execute(`DROP TABLE IF EXISTS t_${i}`);
    },
  })),
);
const t1 = process.hrtime.bigint();
await migrator.up();
const migrationMs = Number(process.hrtime.bigint() - t1) / 1e6;

const orm = { insert, findById, findWithQuery, paginate, transaction };
const cacheBench = {
  cacheHit,
  cacheMiss,
  speedup: round(cacheMiss.meanMs / Math.max(cacheHit.meanMs, 0.0001)),
  stampede: { concurrent: 50, loads: stampedeLoads, totalMs: round(stampedeMs) },
};
const migrations = { count: 20, totalMs: round(migrationMs), perMigrationMs: round(migrationMs / 20) };

console.log(`\n[v0.5.0] data access benchmark — ${opts.iterations} iterations\n`);
console.log('A. ORM（内存数据源）');
for (const r of Object.values(orm)) {
  console.log(`   ${r.name.padEnd(30)} ${r.meanMs} ms  (${r.opsPerSec} ops/sec, p95 ${r.p95Ms} ms)`);
}
console.log('B. 缓存');
console.log(`   命中                           ${cacheHit.meanMs} ms  (${cacheHit.opsPerSec} ops/sec)`);
console.log(`   纯回源（NullCache）            ${cacheMiss.meanMs} ms`);
console.log(`   加速比                         ${cacheBench.speedup}x`);
console.log(`   并发 ${cacheBench.stampede.concurrent} 次同 key：回源 ${cacheBench.stampede.loads} 次，总耗时 ${cacheBench.stampede.totalMs} ms`);
console.log(`C. 迁移：${migrations.count} 条共 ${migrations.totalMs} ms（单条 ${migrations.perMigrationMs} ms）\n`);

if (opts.report) {
  writeFileSync(join(here, 'results.json'), JSON.stringify({ generatedAt: new Date().toISOString(), orm, cache: cacheBench, migrations }, null, 2));
  console.log('结果已写入 benchmarks/v0.5.0/results.json');
}
