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