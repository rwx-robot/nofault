/**
 * SSE（Server-Sent Events）端到端测试。
 *
 * 验证三件事：线格式正确（event + data + 空行）、content-type 正确、
 * `close()` 之后响应真正结束（fetch 的 text() 能拿到完整 body）。
 */
import { describe, expect, it } from 'vitest';
import { Module } from '@nofault/core';
import { RestApplication, openSse } from '../src/index';

@Module({ controllers: [] })
class SseModule {}

describe('sse', () => {
  it('streams server-sent events and ends the response on close', async () => {
    const app = await RestApplication.create(SseModule, { quiet: true });
    app.addRoute('GET', '/sse', (ctx) => {
      const sse = openSse(ctx);
      let n = 0;
      const timer = setInterval(() => {
        n += 1;
        sse.send('tick', { n });
        if (n === 3) {
          clearInterval(timer);
          sse.comment('bye');
          sse.close();
        }
      }, 10);
      return undefined;
    });
    const { port } = await app.listen(0, '127.0.0.1');
    try {
      const res = await fetch(`http://127.0.0.1:${port}/sse`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('text/event-stream');
      const body = await res.text();
      expect(body).toContain('event: tick');
      expect(body).toContain('data: {"n":1}');
      expect(body).toContain(': bye');
      expect(body.match(/data: /g)).toHaveLength(3);
    } finally {
      await app.close();
    }
  });
});
