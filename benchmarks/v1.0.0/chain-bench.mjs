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
