import { request as httpRequest } from 'node:http';
import { describe, expect, it } from 'vitest';
import { NodeHttpAdapter, createNodeAdapter } from '../src/node-http-adapter';

/** 发起一次 GET（每请求一条独立连接并显式关闭，保证 finish 与 close 都会触发） */
function get(port: number, path = '/'): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ port, host: '127.0.0.1', path, agent: false, headers: { connection: 'close' } }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => {
        body += c;
      });
      res.on('end', () => resolve(body));
    });
    req.on('error', reject);
    req.end();
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function until(predicate: () => boolean, message: string, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`timeout waiting: ${message}`);
    await delay(10);
  }
}

describe('NodeHttpAdapter 在途请求计数', () => {
  /**
   * 回归锁定：finish（响应写完）与 close（连接关闭）在正常请求里**都会**触发。
   * 若两个事件各减一次，并发场景下计数会偏低，
   * 导致 close() 在请求尚未真正排空时就 resolve。
   * 正确行为：一次请求只减一次，取先到者。
   */
  it('一次请求只把 inflight 减一次：并发 3 个、完成 2 个后应仍剩 1 个在途', async () => {