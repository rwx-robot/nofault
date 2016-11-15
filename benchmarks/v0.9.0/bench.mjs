#!/usr/bin/env node
/**
 * v0.9.0 Benchmark —— 分布式原语的成本与开销
 *
 * 这一版测两件事：
 * 1. **ID 生成够不够快**：它是每条写路径都要跑的东西
 * 2. **加锁到底多贵**：知道这个数字，才能判断"要不要加这把锁"
 *
 * 用法：node bench.mjs [--iterations=50000] [--report]
 */
import { writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');

const args = { iterations: 50000, report: false };
for (const a of process.argv.slice(2)) {
  const [k, v] = a.replace(/^--/, '').split('=');
  if (k === 'report') args.report = true;
  else if (k === 'iterations') args.iterations = Number(v);
}

const { Snowflake, MemoryLockBackend, DistributedLock, EventBus } = await import(
  join(repoRoot, 'packages/micro/dist/index.js')
);

function round(n) {
  return Math.round(n * 100) / 100;
}

function bench(name, fn, iterations = args.iterations) {
  for (let i = 0; i < Math.min(1000, iterations); i++) fn(i);
  const samples = [];
  for (let i = 0; i < iterations; i++) {
    const t = process.hrtime.bigint();
    fn(i);
    samples.push(Number(process.hrtime.bigint() - t) / 1e6);
  }
  samples.sort((a, b) => a - b);
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  return {
    name,
    meanUs: round(mean * 1000),
    opsPerSec: round(1000 / mean),
    p95Us: round(samples[Math.floor(samples.length * 0.95)] * 1000),
  };
}

// --- A. Snowflake ---
const gen = new Snowflake({ workerId: 1, datacenterId: 1 });
const bigintId = bench('snowflake -> bigint', () => gen.nextId());
const stringId = bench('snowflake -> string', () => gen.nextIdString());

// --- B. 分布式锁（无竞争） ---