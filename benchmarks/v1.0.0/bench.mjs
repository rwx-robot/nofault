#!/usr/bin/env node
/**
 * v1.0.0 Benchmark —— 安全原语的成本
 *
 * 与治理/可观测不同，安全原语有两个"反常"的指标：
 * - **密码哈希必须慢**。快 = 能被暴力破解。这里量的是"慢到什么程度"
 * - **JWT 验签必须快**。它是每条请求的固定成本
 *
 * 用法：node bench.mjs [--iterations=2000] [--report]
 */
import { writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');

const args = { iterations: 2000, report: false };
for (const a of process.argv.slice(2)) {
  const [k, v] = a.replace(/^--/, '').split('=');
  if (k === 'report') args.report = true;
  else if (k === 'iterations') args.iterations = Number(v);
}

const { Jwt, hashPassword, verifyPassword } = await import(
  join(repoRoot, 'packages/security/dist/index.js')
);

function round(n) {
  return Math.round(n * 100) / 100;
}

function bench(name, fn, iterations = args.iterations) {
  for (let i = 0; i < Math.min(200, iterations); i++) fn(i);
  const samples = [];
  for (let i = 0; i < iterations; i++) {
    const t = process.hrtime.bigint();
    fn(i);
    samples.push(Number(process.hrtime.bigint() - t) / 1e6);
  }
  samples.sort((a, b) => a - b);
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  return { name, meanMs: round(mean), opsPerSec: round(1000 / mean), p95Ms: round(samples[Math.floor(samples.length * 0.95)]) };
}

const jwt = new Jwt('benchmark-secret-value-1234', { issuer: 'bench', audience: 'api' });
const token = jwt.sign({ sub: 'u1', roles: ['admin'] }, 3600);

const sign = bench('jwt sign', () => jwt.sign({ sub: 'u1', roles: ['admin'] }, 3600));
const verify = bench('jwt verify', () => jwt.verify(token));

// 密码哈希很慢，只跑少量
const hashIterations = Math.min(args.iterations, 30);
const hashSamples = [];
for (let i = 0; i < hashIterations; i++) {
  const t = process.hrtime.bigint();
  await hashPassword('correct horse battery staple');
  hashSamples.push(Number(process.hrtime.bigint() - t) / 1e6);
}
hashSamples.sort((a, b) => a - b);
const hashMean = hashSamples.reduce((a, b) => a + b, 0) / hashSamples.length;
const stored = await hashPassword('correct horse battery staple');
const verifySamples = [];
for (let i = 0; i < hashIterations; i++) {
  const t = process.hrtime.bigint();
  await verifyPassword('correct horse battery staple', stored);
  verifySamples.push(Number(process.hrtime.bigint() - t) / 1e6);
}
verifySamples.sort((a, b) => a - b);
const verifyMean = verifySamples.reduce((a, b) => a + b, 0) / verifySamples.length;

const hashing = { name: 'scrypt hash (N=2048)', meanMs: round(hashMean), opsPerSec: round(1000 / hashMean), p95Ms: round(hashSamples[Math.floor(hashSamples.length * 0.95)]) };
const verifying = { name: 'scrypt verify', meanMs: round(verifyMean), opsPerSec: round(1000 / verifyMean), p95Ms: round(verifySamples[Math.floor(verifySamples.length * 0.95)]) };

const results = [sign, verify, hashing, verifying];

console.log(`\n[v1.0.0] security benchmark — ${args.iterations} iterations\n`);
for (const r of results) {
  console.log(`   ${r.name.padEnd(24)} ${r.meanMs} ms  (${r.opsPerSec} ops/sec, p95 ${r.p95Ms} ms)`);
}
console.log('');

if (args.report) {
  writeFileSync(join(here, 'results.json'), JSON.stringify({ generatedAt: new Date().toISOString(), primitives: results }, null, 2));
  console.log('结果已写入 benchmarks/v1.0.0/results.json');
}
