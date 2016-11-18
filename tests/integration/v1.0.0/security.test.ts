/**
 * v1.0.0 端到端：JWT 认证 + 角色授权接在真实 HTTP 链路上。
 *
 * 验证的是"端到端能不能真挡住"：
 * 没 token → 401；token 无效 → 401；角色不对 → 403；对的人 → 200。
 * 中间件里返回的状态码必须真的到达客户端，而不是被框架降级成 500。
 */
import { describe, expect, it } from 'vitest';
import 'reflect-metadata';
import { Module } from '@nofault/core';
import { Controller, Get, RestApplication, bodyParser } from '@nofault/rest';
import { Jwt, Roles, Public, authMiddleware } from '@nofault/security';

const jwt = new Jwt('integration-secret-value-1234', { issuer: 'it', audience: 'api' });

@Controller('/admin')
class AdminController {
  @Public()
  @Get('/health')
  health(): { ok: true } {
    return { ok: true };
  }

  @Get('/me')
  me(): { ok: true } {
    return { ok: true };
  }

  @Roles('admin')
  @Get('/wipe')
  wipe(): { wiped: true } {
    return { wiped: true };
  }
}

function handlerFor(path: string) {
  const map: Record<string, { target: object; propertyKey: string }> = {
    '/admin/health': { target: AdminController.prototype, propertyKey: 'health' },
    '/admin/me': { target: AdminController.prototype, propertyKey: 'me' },
    '/admin/wipe': { target: AdminController.prototype, propertyKey: 'wipe' },
  };
  return () => map[path];
}

@Module({ controllers: [AdminController] })
class AppModule {}

let app: RestApplication;
let base = '';

function makeApp(): Promise<RestApplication> {
  return RestApplication.create(AppModule, {
    quiet: true,
    middleware: [
      bodyParser(),
      // 真实项目里 handlerOf 由框架提供；这里按路径模拟
      (ctx: { request: { path?: string } }, next: () => Promise<void>) =>
        authMiddleware({