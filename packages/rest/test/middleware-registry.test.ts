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