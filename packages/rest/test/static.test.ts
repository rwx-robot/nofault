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