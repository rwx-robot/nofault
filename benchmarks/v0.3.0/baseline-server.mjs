#!/usr/bin/env node
/**
 * 基线服务：纯 node:http，手写等效逻辑，无框架。
 * 独立进程运行，避免与压测器抢 CPU。
 */
import { createServer } from 'node:http';

const config = {
  tenant: 'acme',
  betaEnabled: false,
  greeting: 'Hello from v0.3.0',
};

function send(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) });
  res.end(body);
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  const p = url.pathname;

  if (p === '/api/runtime/config') {
    return send(res, 200, {
      code: 0,
      data: { ...config, watchedAt: new Date().toISOString() },
      message: 'ok',
    });
  }
