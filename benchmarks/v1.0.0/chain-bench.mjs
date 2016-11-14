#!/usr/bin/env node
/**
 * v1.0.0 全链路压测 —— HTTP 网关 → RPC → 业务 → 缓存/存储
 *
 * 与单层 bench 的差别：量的是**一次用户请求穿过的所有层**：
 *   fetch → rest（路由/中间件/参数绑定/统一响应）→ rpc.call（连接池/编解码）
 *   → rpc 服务端（分帧/拦截）→ 业务 → MemoryCache.getOrSet → 内存存储
 *
 * 三条路径：
 * - 热读：id 固定，缓存命中后不触达存储（生产中最常见）
 * - 冷读：id 每次都换，缓存未命中，走 getOrSet 的加载路径
 * - 写：POST 直达存储并回包
 *
 * 用法：node chain-bench.mjs [--n=2000] [--conc=16]
 */
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');
const pkg = async (name) => await import(join(repoRoot, 'packages', name, 'dist/index.js'));

const { Module } = await pkg('core');
const { RestApplication, bodyParser } = await pkg('rest');
const { RpcServer, RpcClient } = await pkg('rpc');
const { MemoryCache } = await pkg('cache');

const args = { n: 2000, conc: 16 };
for (const a of process.argv.slice(2)) {
  const [k, v] = a.replace(/^--/, '').split('=');
  if (k === 'n' || k === 'conc') args[k] = Number(v);
}

// ---------- 后端：RPC 服务 + 缓存 + 内存存储 ----------
const cache = new MemoryCache();
const store = new Map();
for (let i = 1; i <= 100; i++) store.set(String(i), { id: i, name: `user-${i}` });

const backend = new RpcServer();
backend.register('users', 'get', async (payload) => {
  const { id } = payload;
  return cache.getOrSet(`user:${id}`, async () => store.get(String(id)) ?? undefined);
});
backend.register('users', 'create', async (payload) => {
  const id = String(store.size + 1);
  const user = { id: Number(id), name: payload.name ?? `user-${id}` };
  store.set(id, user);
  return user;
});
const backendInfo = await backend.listen(0, '127.0.0.1');

// ---------- 网关：rest 应用 → RPC 客户端 ----------
const rpc = new RpcClient({ host: '127.0.0.1', port: backendInfo.port, timeoutMs: 5000 });

class GatewayModule {}
Module({ controllers: [], providers: [] })(GatewayModule);

const app = await RestApplication.create(GatewayModule, {
  quiet: true,
  middleware: [bodyParser()],
});
app.addRoute('GET', '/users/:id', (ctx) => rpc.call('users', 'get', { id: ctx.request.params.id }));
app.addRoute('POST', '/users', (ctx) => rpc.call('users', 'create', ctx.request.body));
const gateway = await app.listen(0, '127.0.0.1');

// ---------- 压测 ----------
const base = `http://127.0.0.1:${gateway.port}`;

function pct(sorted, p) {
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length * p) / 100))];
}

async function run(name, fn, n = args.n, conc = args.conc) {
  for (let i = 0; i < Math.min(50, n); i++) await fn(i); // 预热
  const lat = [];
  let failures = 0;
  let next = 0;
  const worker = async () => {
    while (next < n) {
      const i = next++;
      const t = process.hrtime.bigint();
      let ok = false;
      let detail = '';
      try {
        ok = await fn(i);
      } catch (err) {
        detail = ` threw ${err instanceof Error ? err.message : String(err)}`;
      }
      const ms = Number(process.hrtime.bigint() - t) / 1e6;
      if (ok) lat.push(ms);
      else if (failures++ < 3) console.error(`[fail] ${name} #${i}${detail}`);
    }
  };
  const started = process.hrtime.bigint();
  await Promise.all(Array.from({ length: conc }, worker));
  const seconds = Number(process.hrtime.bigint() - started) / 1e9;
  lat.sort((a, b) => a - b);
  const mean = lat.reduce((a, b) => a + b, 0) / lat.length;
  const rps = lat.length / seconds;
  console.log(
    `${name.padEnd(10)} ${Math.round(rps).toLocaleString('en-US').padStart(10)} ops/s | mean ${mean.toFixed(2)}ms | p50 ${pct(lat, 50).toFixed(2)}ms | p95 ${pct(lat, 95).toFixed(2)}ms | p99 ${pct(lat, 99).toFixed(2)}ms | n=${lat.length}`,
  );
  return { name, rps: Math.round(rps), mean: +mean.toFixed(2), p50: +pct(lat, 50).toFixed(2), p95: +pct(lat, 95).toFixed(2), p99: +pct(lat, 99).toFixed(2), n: lat.length, conc };
}

const results = [];
results.push(await run('hot-read', async () => {
  const res = await fetch(`${base}/users/7`);
  return res.status === 200;
}));
results.push(await run('cold-read', async (i) => {
  const res = await fetch(`${base}/users/${1000 + i}`);
  // miss → 业务层返回 undefined → 框架语义是 204 No Content（防穿透：undefined 不进缓存）
  return res.status === 200 || res.status === 204;
}));
results.push(await run('write', async (i) => {
  const res = await fetch(`${base}/users`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: `bench-${i}` }),
  });
  return res.status === 200 || res.status === 201;
}));

console.log('\nJSON:', JSON.stringify(results));
await app.close();
await rpc.close();
await backend.close();
