#!/usr/bin/env node
/**
 * v0.8.0 Benchmark —— 可观测性的成本
 *
 * 可观测性有个自相矛盾的要求：**它必须便宜到可以全量开启**。
 * 一旦因为"太贵"只开 1% 采样，出问题时你永远差那一份 trace。
 * 所以这里量的是"埋一次点要花多久"。
 *
 * 用法：node bench.mjs [--iterations=20000] [--report]
 */
import { writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');

const args = { iterations: 20000, report: false };
for (const a of process.argv.slice(2)) {
  const [k, v] = a.replace(/^--/, '').split('=');
  if (k === 'report') args.report = true;
  else if (k === 'iterations') args.iterations = Number(v);
}

const { Tracer, InMemoryExporter, MetricRegistry } = await import(
  join(repoRoot, 'packages/telemetry/dist/index.js')
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

// --- A. 起一个 Span 并结束 ---
const tracer = new Tracer(new InMemoryExporter(), () => true, 1_000_000);
const spanOverhead = bench('span start + end', () => {
  const span = tracer.startSpan('bench');
  span.end();
});

// --- B. 不采样时（应当接近零开销） ---
const offTracer = new Tracer(new InMemoryExporter(), () => false, 1_000_000);
const notSampled = bench('span when not sampled', () => {
  offTracer.startSpan('bench');
});

// --- C. 带属性的 Span（属性是排查时的全部线索） ---
const withAttrs = bench('span + 4 attributes', (i) => {
  const span = tracer.startSpan('bench');
  span?.setAttributes({ route: '/api/x', status: 200, durationMs: i, cached: false });
  span?.end();
});

// --- D. 计数器（每条请求都会 inc 好几次） ---
const registry = new MetricRegistry();
const counter = registry.counter('bench_total', 'bench');
const counterInc = bench('counter inc', () => counter.inc({ route: '/api/x' }));

// --- E. 直方图（比计数器贵，因为要找桶） ---
const histogram = registry.histogram('bench_ms', 'bench');
const histogramObserve = bench('histogram observe', (i) => histogram.observe(i % 500, { route: '/api/x' }));

// --- F. Prometheus 序列化（抓取时才做，但要快） ---
for (let i = 0; i < 500; i++) {
  counter.inc({ route: `/r/${i % 20}`, status: '200' });
  histogram.observe(i % 300, { route: `/r/${i % 20}`, status: '200' });
}
const samples = [];
for (let i = 0; i < 200; i++) {
  const t = process.hrtime.bigint();
  registry.toPrometheus();
  samples.push(Number(process.hrtime.bigint() - t) / 1e6);
}
samples.sort((a, b) => a - b);
const serialize = {
  name: 'prometheus serialize (500 series)',
  meanUs: round((samples.reduce((a, b) => a + b, 0) / samples.length) * 1000),
  opsPerSec: round(1000 / (samples.reduce((a, b) => a + b, 0) / samples.length)),
  p95Us: round(samples[Math.floor(samples.length * 0.95)] * 1000),
};

const results = [spanOverhead, notSampled, withAttrs, counterInc, histogramObserve, serialize];

console.log(`\n[v0.8.0] telemetry benchmark — ${args.iterations} iterations\n`);
for (const r of results) {
  console.log(`   ${r.name.padEnd(32)} ${r.meanUs} µs  (${r.opsPerSec} ops/sec, p95 ${r.p95Us} µs)`);
}
console.log('');
console.log(`   导出待处理：${tracer.pendingCount} 条（批量导出未触发）`);

if (args.report) {
  writeFileSync(
    join(here, 'results.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), primitives: results }, null, 2),
  );
  console.log('结果已写入 benchmarks/v0.8.0/results.json');
}
