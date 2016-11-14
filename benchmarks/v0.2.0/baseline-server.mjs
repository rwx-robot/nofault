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