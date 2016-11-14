#!/usr/bin/env node
/**
 * 基线服务：纯 `node:http`，手写等效逻辑，无任何框架。
 *
 * 独立进程运行，避免与压测器争抢 CPU。
 */
import { createServer } from 'node:http';

const users = new Map([
  [1, { id: 1, name: 'Ada Lovelace', email: 'ada@nofault.dev', age: 36 }],
  [2, { id: 2, name: 'Alan Turing', email: 'alan@nofault.dev', age: 41 }],
]);

function send(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) });
  res.end(body);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  const p = url.pathname;
  const method = (req.method ?? 'GET').toUpperCase();

  // GET /api/users/:id
  if (method === 'GET' && p.startsWith('/api/users/')) {
    const id = Number(p.slice('/api/users/'.length));
    const user = users.get(id);
    if (!user) return send(res, 404, { code: 404, data: null, message: `User ${id} not found` });
    return send(res, 200, { code: 0, data: user, message: 'ok' });
  }

  // POST /api/users/echo —— 与 nofault 的 echo 端点等价
  if (method === 'POST' && p === '/api/users/echo') {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return send(res, 400, { code: 400, data: null, message: 'Invalid JSON body' });
    }
    if (typeof body?.name !== 'string' || body.name.length < 2) {
      return send(res, 422, { code: 422, data: [{ property: 'name' }], message: 'Validation failed' });
    }
    if (typeof body?.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
      return send(res, 422, { code: 422, data: [{ property: 'email' }], message: 'Validation failed' });
    }
    if (typeof body?.age !== 'number' || body.age < 0 || body.age > 150) {
      return send(res, 422, { code: 422, data: [{ property: 'age' }], message: 'Validation failed' });
    }
    return send(res, 200, { code: 0, data: { received: body }, message: 'ok' });
  }

  // POST /api/users
  if (method === 'POST' && p === '/api/users') {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return send(res, 400, { code: 400, data: null, message: 'Invalid JSON body' });
    }
    if (typeof body?.name !== 'string' || body.name.length < 2) {
      return send(res, 422, { code: 422, data: [{ property: 'name' }], message: 'Validation failed' });
    }
    return send(res, 200, { code: 0, data: { id: 999, ...body }, message: 'ok' });
  }

  send(res, 404, { code: 404, data: null, message: `Cannot ${method} ${p}` });
});

server.listen(0, '127.0.0.1', () => {
  process.stdout.write(JSON.stringify({ port: server.address().port }) + '\n');
});
