import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RestApplication, cors, bodyParser } from '@nofault/rest';
import { AppModule } from '../../../examples/v0.2.0-rest-user-api/src/app.module';
import { UserService } from '../../../examples/v0.2.0-rest-user-api/src/users/user.service';
import { reset } from '../../../examples/v0.2.0-rest-user-api/src/users/user.model';

/**
 * v0.2.0 集成测试：真实起服务 + 真实发请求。
 *
 * 覆盖：路由匹配、路径参数、query、body 校验、异常过滤、
 * 统一响应包装、中间件（CORS）、404/405。
 */
describe('v0.2.0 rest-user-api (integration)', () => {
  let app: RestApplication;
  let base: string;

  beforeAll(async () => {
    reset();
    app = await RestApplication.create(AppModule, {
      name: 'rest-user-api-test',
      globalPrefix: '/api',
      middleware: [cors({ origin: true }), bodyParser()],
    });
    const { port } = await app.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${port}/api`;
    const users = await app.get(UserService);
    users.create({ name: 'Ada Lovelace', email: 'ada@nofault.dev', age: 36 });
  });

  afterAll(async () => {
    await app.close();
    reset();
  });

  it('registers decorator-declared routes with the global prefix', () => {
    const routes = app.getRoutes().map((r) => `${r.method} ${r.path}`).sort();
    expect(routes).toEqual([
      'DELETE /api/users/:id',
      'GET /api/users',
      'GET /api/users/:id',
      'GET /api/users/count',
      'GET /api/users/probe/missing',
      // v0.3.0 起框架内建的探针
      'GET /healthz',
      'GET /readyz',
      'PATCH /api/users/:id',
      'POST /api/users',
      'POST /api/users/echo',
      'PUT /api/users/:id',
    ]);
  });

  it('GET /users returns a wrapped list', async () => {
    const res = await fetch(`${base}/users`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { code: number; data: Array<{ name: string }>; message: string };
    expect(body.code).toBe(0);
    expect(body.message).toBe('ok');
    expect(body.data[0]!.name).toBe('Ada Lovelace');
  });

  it('GET /users?keyword= filters the list', async () => {
    const hit = await fetch(`${base}/users?keyword=Ada`);
    const miss = await fetch(`${base}/users?keyword=zzz`);
    expect(((await hit.json()) as { data: unknown[] }).data).toHaveLength(1);
    expect(((await miss.json()) as { data: unknown[] }).data).toHaveLength(0);
  });

  it('GET /users/:id extracts a numeric path param', async () => {
    const res = await fetch(`${base}/users/1`);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: { id: number } }).data.id).toBe(1);
  });

  it('POST /users validates the body and returns 422 on bad input', async () => {
    const ok = await fetch(`${base}/users`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Alan Turing', email: 'alan@nofault.dev', age: 41 }),
    });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { data: { id: number } }).data.id).toBe(2);

    const bad = await fetch(`${base}/users`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'X', email: 'not-an-email', age: 999 }),
    });
    expect(bad.status).toBe(422);
    const err = (await bad.json()) as { code: number; data: Array<{ property: string }>; message: string };
    expect(err.message).toBe('Validation failed');
    expect(err.data.map((e) => e.property).sort()).toEqual(['age', 'email', 'name']);
  });

  it('POST /users rejects duplicate emails with 409', async () => {
    const res = await fetch(`${base}/users`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Ada Two', email: 'ada@nofault.dev', age: 20 }),
    });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { message: string }).message).toContain('already registered');
  });

  it('PUT /users/:id updates and PATCH /users/:id partially updates', async () => {
    const put = await fetch(`${base}/users/2`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Alan M. Turing', age: 42 }),
    });
    expect(put.status).toBe(200);
    expect(((await put.json()) as { data: { name: string } }).data.name).toBe('Alan M. Turing');

    const patch = await fetch(`${base}/users/2`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Alan' }),
    });
    expect(((await patch.json()) as { data: { name: string } }).data.name).toBe('Alan');
  });

  it('DELETE /users/:id returns 204 and removes the user', async () => {
    const del = await fetch(`${base}/users/2`, { method: 'DELETE' });
    expect(del.status).toBe(204);
    const after = await fetch(`${base}/users/2`);
    expect(after.status).toBe(404);
  });

  it('returns 404 for unknown users with the unified error body', async () => {
    const res = await fetch(`${base}/users/999`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ code: 404, data: null, message: 'User 999 not found' });
  });

  it('returns 405 with an Allow header when the method is not registered', async () => {
    // /api/users/count 用 POST 打：路径形状存在（GET 注册过），但 POST 没有 → 405
    // 注意 Allow 里会包含 /users/:id 形状能匹配到的其它方法（DELETE/PUT/PATCH），
    // 这符合 HTTP 语义：Allow 描述的是"目标资源"支持的方法集合。
    const res = await fetch(`${base}/users/count`, { method: 'POST' });
    expect(res.status).toBe(405);
    const allow = res.headers.get('allow') ?? '';
    expect(allow).toContain('GET');
    expect(allow).toContain('HEAD');
    expect(allow).not.toContain('POST');
    expect(((await res.json()) as { message: string }).message).toContain('Allowed methods');
  });

  it('coerces path params to their declared type and rejects bad input', async () => {
    // DELETE /users/:id 存在，但 'abc' 转不成 number
    const res = await fetch(`${base}/users/abc`, { method: 'DELETE' });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { message: string }).message).toContain('Cannot convert');
  });

  it('returns 404 for unknown paths', async () => {
    const res = await fetch(`${base}/nope`);
    expect(res.status).toBe(404);
    expect(((await res.json()) as { message: string }).message).toContain('Cannot GET');
  });

  it('applies CORS middleware headers', async () => {
    const res = await fetch(`${base}/users`, { headers: { origin: 'https://example.com' } });
    expect(res.headers.get('access-control-allow-origin')).toBe('https://example.com');
  });

  it('applies route-level middleware (x-response-time)', async () => {
    const res = await fetch(`${base}/users`);
    expect(res.headers.get('x-response-time')).toMatch(/ms$/);
  });
});
