/**
 * 静态文件中间件：流式发送与路径穿越防护。
 *
 * 为什么必须有这个：2026-09 优化把 `readFileSync` 全量缓冲改成了
 * `createReadStream` + `pipeline`（大文件不再占内存，背压由流接管）——
 * 这里用真实文件 + 真实服务验证字节、类型、长度都和缓冲版完全一致。
 */
import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Module } from '@nofault/core';
import { Controller, Get, RestApplication, serveStatic } from '../src/index';

@Controller('/api')
class ApiController {
  @Get('/ping')
  ping(): { ok: string } {
    return { ok: 'yes' };
  }
}

@Module({ controllers: [ApiController] })
class StaticModule {}

describe('static file middleware', () => {
  it('streams a file with the right type, size and bytes', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nofault-static-'));
    const payload = 'x'.repeat(4096);
    writeFileSync(join(dir, 'page.html'), payload);

    const app = await RestApplication.create(StaticModule, {
      quiet: true,
      middleware: [serveStatic({ root: dir, prefix: '/static' })],
    });
    const { port } = await app.listen(0, '127.0.0.1');
    try {
      const res = await fetch(`http://127.0.0.1:${port}/static/page.html`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
      expect(res.headers.get('content-length')).toBe(String(payload.length));
      expect(await res.text()).toBe(payload);
    } finally {
      await app.close();
    }
  });

  it('falls through to the router on a miss and never serves traversal', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nofault-static-'));
    const app = await RestApplication.create(StaticModule, {
      quiet: true,
      middleware: [serveStatic({ root: dir, prefix: '/' })],
    });
    const { port } = await app.listen(0, '127.0.0.1');
    try {
      // 未命中 → 继续走路由，不吞掉业务端点
      const ping = await fetch(`http://127.0.0.1:${port}/api/ping`);
      expect(ping.status).toBe(200);

      // 编码过的穿越段：无论落在"拒绝"还是"未命中"，都绝不能 200
      const evil = await fetch(`http://127.0.0.1:${port}/%2e%2e/%2e%2e/etc/passwd`);
      expect([400, 404]).toContain(evil.status);
    } finally {
      await app.close();
    }
  });
});
