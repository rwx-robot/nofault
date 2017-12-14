/**
 * 命名中间件：契约/装饰器里以字符串声明的中间件，要在 `middlewareRegistry` 里兑现。
 *
 * 为什么必须有这个：生成器产出的 controller 只能写中间件**名字**
 * （契约里没有实现，只有名字），没有注册表就无从解析。
 */
import { describe, expect, it } from 'vitest';
import 'reflect-metadata';
import { Module } from '@nofault/core';
import { Controller, Get, UseMiddleware, RestApplication } from '../src/index';

class Svc {
  ok(): { ok: string } {
    return { ok: 'yes' };
  }
}

@Controller('/named')
@UseMiddleware('Audit')
class NamedController {
  constructor(readonly svc: Svc) {}

  @Get('/x')
  x(): { ok: string; audit?: string } {
    return { ok: 'yes', audit: (globalThis as Record<string, unknown>).__audit as string };
  }
}

@Module({ controllers: [NamedController], providers: [Svc] })
class NamedModule {}

describe('named middleware registry', () => {
  const audit = async (ctx: { request: { header(name: string): string | undefined } }, next: () => Promise<void>): Promise<void> => {
    (globalThis as Record<string, unknown>).__audit = ctx.request.header('x-user') ?? 'anonymous';
    await next();
  };

  it('runs middleware looked up by name', async () => {
    const app = await RestApplication.create(NamedModule, {
      quiet: true,
      middlewareRegistry: { Audit: audit as never },
    });
    const { port } = await app.listen(0, '127.0.0.1');
    try {
      const res = await fetch(`http://127.0.0.1:${port}/named/x`, { headers: { 'x-user': 'bob' } });
      expect(res.status).toBe(200);
      expect((globalThis as Record<string, unknown>).__audit).toBe('bob');
    } finally {
      await app.close();
    }
  });

  it('fails loudly at startup when a declared middleware is not registered', async () => {
    // 静默跳过比启动失败危险得多：会让人以为鉴权/审计生效了
    await expect(
      RestApplication.create(NamedModule, { quiet: true }),
    ).rejects.toThrow(/not registered/);
  });
});
