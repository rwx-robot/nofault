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
          jwt,
          handlerOf: handlerFor(ctx.request.path ?? '') as () => { target: object; propertyKey: string } | undefined,
        })(ctx as never, next),
    ] as never[],
  });
}

describe('auth over http', () => {
  it('lets a public route through without a token', async () => {
    app = await makeApp();
    const { port } = await app.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${port}`;

    const res = await fetch(`${base}/admin/health`);
    expect(res.status).toBe(200);
  });

  it('answers 401 when no token is present', async () => {
    const res = await fetch(`${base}/admin/me`);
    expect(res.status).toBe(401);
  });

  it('answers 401 for a token signed by someone else', async () => {
    const foreign = new Jwt('someone-elses-secret-value-9999', { issuer: 'it', audience: 'api' });
    const token = foreign.sign({ sub: 'attacker', roles: ['admin'] }, 3600);
    const res = await fetch(`${base}/admin/wipe`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(401);
  });

  it('answers 401 for a malformed token without leaking the reason', async () => {
    const res = await fetch(`${base}/admin/wipe`, {
      headers: { authorization: 'Bearer not.a.jwt' },
    });
    expect(res.status).toBe(401);
    const body = await res.text();
    // 不能回"签名不对"还是"过期了"：那是在给攻击者递信息
    expect(body).not.toMatch(/signature|expired/i);
  });

  it('answers 403 when the role does not match', async () => {
    const token = jwt.sign({ sub: 'u1', roles: ['user'] }, 3600);
    const res = await fetch(`${base}/admin/wipe`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(403);
  });

  it('answers 200 for the right role', async () => {
    const token = jwt.sign({ sub: 'u1', roles: ['admin'] }, 3600);
    const res = await fetch(`${base}/admin/wipe`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
  });
});
