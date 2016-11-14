#!/usr/bin/env node
/**
 * v0.6.0 Benchmark —— RPC 调用开销
 *
 * 测三件事：
 *  A. 单次调用的往返延迟（本机 socket，排除网络）
 *  B. 池化带来的收益（首连 vs 复用）
 *  C. 并发下的吞吐：一条连接上多个在途调用是否能线性叠加
 *
 * 用法：
 *   node bench.mjs [--iterations=2000] [--concurrency=50] [--report]
 */
import { writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');

const args = { iterations: 2000, concurrency: 50, report: false };
for (const a of process.argv.slice(2)) {
  const [k, v] = a.replace(/^--/, '').split('=');
  if (k === 'report') args.report = true;
  else if (k === 'iterations') args.iterations = Number(v);
  else if (k === 'concurrency') args.concurrency = Number(v);
}

const { RpcServer, RpcClient, InMemoryRegistry } = await import(join(repoRoot, 'packages/rpc/dist/index.js'));

const server = new RpcServer();
server.register('bench', 'echo', (payload) => payload);
server.register('bench', 'add', (payload) => {
  const { a, b } = payload;
  return a + b;
});
const { port } = await server.listen(0, '127.0.0.1');

const registry = new InMemoryRegistry();
await registry.register({ id: 'b1', name: 'bench', host: '127.0.0.1', port });

function round(n) {
  return Math.round(n * 100) / 100;
}

async function bench(name, fn, iterations = args.iterations) {
  for (let i = 0; i < Math.min(200, iterations); i++) await fn(i);
  const samples = [];
  for (let i = 0; i < iterations; i++) {
    const t = process.hrtime.bigint();
    await fn(i);
    samples.push(Number(process.hrtime.bigint() - t) / 1e6);
  }
  samples.sort((a, b) => a - b);
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  return { name, meanMs: round(mean), p95Ms: round(samples[Math.floor(samples.length * 0.95)]), opsPerSec: round(1000 / mean) };
}

// A. 串行调用（连接已建立）