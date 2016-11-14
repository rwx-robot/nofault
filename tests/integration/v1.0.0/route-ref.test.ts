/**
 * `ctx.route` 与认证的端到端。
 *
 * 之前鉴权中间件拿不到"当前调的是哪个 handler"，只能靠调用方维护
 * path -> handler 的映射——必然漂移。现在 `ctx.route` 由框架填充，
 * `authMiddleware` 直接读它，公开路由（@Public）不再被一起 401。
 */
import { afterAll, describe, expect, it } from 'vitest';
import 'reflect-metadata';
import { Injectable, Module } from '@nofault/core';
import { Body, Controller, Get, HttpException, Post, RestApplication, bodyParser } from '@nofault/rest';
import { Jwt, Public, Roles, authMiddleware, hashPassword, verifyPassword } from '@nofault/security';

const jwt = new Jwt('route-ref-secret-value-1234', { issuer: 'it', audience: 'api' });

interface Account {
  id: string;
  roles: string[];
  passwordHash: string;
}
const accounts = new Map<string, Account>();

@Injectable()
class AuthService {
  constructor() {
    void (async () => {
      accounts.set('alice', {
        id: 'u1',
        roles: ['admin'],
        passwordHash: await hashPassword('right-passphrase'),
      });
      accounts.set('bob', {
        id: 'u2',
        roles: ['viewer'],
        passwordHash: await hashPassword('bob-passphrase'),
      });
    })();
  }

  async login(name: string, password: string): Promise<{ token: string }> {
    const account = accounts.get(name);
    if (!account || !(await verifyPassword(password, account.passwordHash))) {
      throw new HttpException(401, 'invalid credentials', 401);
    }
    return { token: jwt.sign({ sub: account.id, roles: account.roles }, 3600) };
  }
}

@Controller('/admin')
class AdminController {
  constructor(private readonly service: AuthService) {}

  @Public()
  @Get('/health')
  health(): { ok: true } {
    return { ok: true };
  }

  // 登录接口**必须**公开：它就是用来换第一张 token 的。
  // 漏标 @Public 的表现不是编译错，而是登录永远 401——轮询超时才暴露
  @Public()
  @Post('/login')
  async login(@Body() body: { name: string; password: string }): Promise<{ token: string }> {
    return this.service.login(body.name, body.password);
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

@Module({ controllers: [AdminController], providers: [AuthService] })
class AppModule {}

let app: RestApplication;
let base = '';

/**
 * scrypt 哈希一次 ~45ms，构造器里的预置是异步的：
 * 固定 sleep 要么等不够、要么白等。轮询到成功为止才是确定性写法。
 */
async function waitForAccount(name: string, password: string): Promise<{ token: string }> {
  for (let i = 0; i < 40; i++) {
    const res = await fetch(`${base}/admin/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, password }),
    });
    if (res.ok) {
      const body = (await res.json()) as { data: { token: string } };
      return body.data;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`account "${name}" was not seeded in time`);
}

afterAll(async () => {
  await app?.close();
});

describe('ctx.route drives the auth middleware', () => {
  it('reads the handler decorators straight from ctx.route', async () => {
    app = await RestApplication.create(AppModule, {
      quiet: true,
      middleware: [
        bodyParser(),
        (ctx: { route?: { controller: object; propertyKey: string | symbol } }, next: () => Promise<void>) =>
          authMiddleware({
            jwt,
            // 不再需要调用方维护 path 映射：直接读框架填好的 route
            handlerOf: () => {
              const route = (ctx as { route?: { controller: object; propertyKey: string | symbol } }).route;
              return route ? { target: route.controller, propertyKey: route.propertyKey } : undefined;
            },
          })(ctx as never, next),
      ] as never[],
    });
    const { port } = await app.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${port}`;

    // @Public 不被拦
    expect((await fetch(`${base}/admin/health`)).status).toBe(200);
    // 未登录 401
    expect((await fetch(`${base}/admin/me`)).status).toBe(401);
  });

  it('issues a token from a scrypt-verified login and authorises by role', async () => {
    const login = await waitForAccount('alice', 'right-passphrase');
    const { token } = login;
    expect(token).toBeTruthy();

    expect(
      (await fetch(`${base}/admin/wipe`, { headers: { authorization: `Bearer ${token}` } })).status,
    ).toBe(200);
  });

  it('answers 401 for a wrong password without distinguishing user vs password', async () => {
    const res = await fetch(`${base}/admin/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'alice', password: 'wrong' }),
    });
    expect(res.status).toBe(401);
    // 区分"用户不存在"和"密码错误"等于告诉攻击者哪些用户名有效
    expect(await res.text()).not.toMatch(/user|password|not found/i);
  });

  it('answers 403 with the missing roles when the role does not match', async () => {
    const { token } = await waitForAccount('bob', 'bob-passphrase');

    const res = await fetch(`${base}/admin/wipe`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(403);
    // 403 要说明缺什么角色：否则调用方分不清"权限不够"和"接口不存在"
    expect(await res.text()).toContain('admin');
  });
});
