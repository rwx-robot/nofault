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