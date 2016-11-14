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
const client = new RpcClient({ registry, service: 'bench', timeoutMs: 5000, poolSize: 4 });
const serial = await bench('serial call (warm connection)', async (i) => {
  await client.call('bench', 'add', { a: i, b: 1 });
});

// B. 池化收益：每次新建客户端（含建连）vs 复用
const cold = await bench(
  'call with fresh client (incl. connect)',
  async () => {
    const fresh = new RpcClient({ registry, service: 'bench', timeoutMs: 5000 });
    await fresh.call('bench', 'echo', { v: 1 });
    await fresh.close();
  },
  Math.min(300, args.iterations),
);

// C. 并发
const concurrencyStart = process.hrtime.bigint();
const batches = args.concurrency;
await Promise.all(
  Array.from({ length: batches }, async () => {
    const perBatch = Math.max(1, Math.floor(args.iterations / batches));
    for (let i = 0; i < perBatch; i++) await client.call('bench', 'add', { a: i, b: i });
  }),
);
const concurrentMs = Number(process.hrtime.bigint() - concurrencyStart) / 1e6;
const concurrentTotal = Math.floor(args.iterations / batches) * batches;
const concurrent = {
  concurrency: batches,
  calls: concurrentTotal,
  totalMs: round(concurrentMs),
  opsPerSec: round((concurrentTotal / concurrentMs) * 1000),
};

const pooled = { size: client.poolStats.size };

console.log(`\n[v0.6.0] rpc benchmark — ${args.iterations} iterations\n`);
console.log('A. 串行调用（连接已就绪）');
console.log(`   ${serial.meanMs} ms  (${serial.opsPerSec} ops/sec, p95 ${serial.p95Ms} ms)`);
console.log('B. 建连成本');
console.log(`   每次新建客户端 ${cold.meanMs} ms  vs  复用连接 ${serial.meanMs} ms`);
console.log(`   池化省下 ${round(cold.meanMs - serial.meanMs)} ms/次（${round(cold.meanMs / Math.max(serial.meanMs, 0.001))}x）`);
console.log('C. 并发');
console.log(`   ${concurrent.concurrency} 并发 / ${concurrent.calls} 次调用：${concurrent.totalMs} ms，${concurrent.opsPerSec} ops/sec`);
console.log(`   连接池实际大小：${pooled.size}\n`);

if (args.report) {
  writeFileSync(
    join(here, 'results.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), serial, cold, concurrent, pooled }, null, 2),
  );
  console.log('结果已写入 benchmarks/v0.6.0/results.json');
}

await client.close();
await server.close();
