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

  // 与 nofault 的 /api/runtime/context 对齐：也生成 id 与 traceId
  if (p === '/api/runtime/context') {
    const hex = (n) => Buffer.from(cryptoRandom(n)).toString('hex');
    return send(res, 200, {
      code: 0,
      data: {
        requestId: `req_${hex(4)}`,
        traceId: hex(16),
        spanId: hex(8),
        scopeInstanceNo: ++counter,
        scopeRequestId: `req_${hex(4)}`,
        configReloadable: false,
      },
      message: 'ok',
    });
  }

  send(res, 404, { code: 404, data: null, message: `Cannot GET ${p}` });
});

let counter = 0;
function cryptoRandom(n) {
  const b = new Uint8Array(n);
  globalThis.crypto.getRandomValues(b);
  return b;
}

server.listen(0, '127.0.0.1', () => {
  process.stdout.write(JSON.stringify({ port: server.address().port }) + '\n');
});
