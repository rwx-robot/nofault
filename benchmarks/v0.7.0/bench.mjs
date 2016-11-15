#!/usr/bin/env node
/**
 * v0.7.0 Benchmark —— 治理原语的成本
 *
 * 治理必须是**便宜**的：限流/熔断每天要跑几十亿次，
 * 如果一次判定要几十微秒，它自己就成了瓶颈。
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

const { TokenBucket, KeyedRateLimiter, CircuitBreaker, Bulkhead, backoffDelay } = await import(
  join(repoRoot, 'packages/resilience/dist/index.js')
);

function round(n) {
  return Math.round(n * 100) / 100;
}

function bench(name, fn, iterations = args.iterations) {
  for (let i = 0; i < Math.min(2000, iterations); i++) fn(i);
  const samples = [];
  for (let i = 0; i < iterations; i++) {
    const t = process.hrtime.bigint();
    fn(i);
    samples.push(Number(process.hrtime.bigint() - t) / 1e6);
  }
  samples.sort((a, b) => a - b);
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  return { name, meanMs: round(mean * 1000), opsPerSec: round(1000 / mean), p95Us: round(samples[Math.floor(samples.length * 0.95)] * 1000) };
}

const bucket = new TokenBucket({ capacity: 1_000_000, refillPerSecond: 1_000_000 });
const tokenCheck = bench('token bucket check', () => bucket.tryRemove());

const limiter = new KeyedRateLimiter({ capacity: 1_000_000, refillPerSecond: 1_000_000 });
const keyedCheck = bench('keyed rate limit check', (i) => limiter.check(`key-${i % 1000}`));

const breaker = new CircuitBreaker({ failureThreshold: 1e9, resetTimeoutMs: 1000 });
const closedRun = bench('circuit breaker (closed, sync)', () => breaker.currentState);

const guard = new Bulkhead({ concurrency: 1000, queueLimit: 0 });
const bulkheadStats = bench('bulkhead stats', () => guard.stats);

const backoff = bench('backoff delay', (i) => backoffDelay(i % 8));

console.log(`\n[v0.7.0] resilience benchmark — ${args.iterations} iterations\n`);
console.log('每次判定的开销（微秒级才是合格的）：');
for (const r of [tokenCheck, keyedCheck, closedRun, bulkheadStats, backoff]) {
  console.log(`   ${r.name.padEnd(30)} ${r.meanMs} µs  (${r.opsPerSec} ops/sec, p95 ${r.p95Us} µs)`);
}
console.log('');

if (args.report) {
  writeFileSync(
    join(here, 'results.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), primitives: [tokenCheck, keyedCheck, closedRun, bulkheadStats, backoff] }, null, 2),
  );
  console.log('结果已写入 benchmarks/v0.7.0/results.json');
}
