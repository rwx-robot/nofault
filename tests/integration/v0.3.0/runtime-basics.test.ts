import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Module } from '@nofault/core';
import { ConfigModule } from '@nofault/config';
import { RestApplication, bodyParser, requestContext } from '@nofault/rest';
import { RuntimeController } from '../../../examples/v0.3.0-runtime-basics/src/runtime.controller';
import { RequestScopeService } from '../../../examples/v0.3.0-runtime-basics/src/request-scope.service';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 配置文件必须在**模块加载期**就定好：
// `@Module({ imports: [ConfigModule.forRootAsync(...)] })` 的装饰器在 import 时就求值了，
// 放到 beforeAll 里再创建文件已经来不及。
const configDir = mkdtempSync(join(tmpdir(), 'nofault-v030-'));
const configFile = join(configDir, 'app.yaml');
writeFileSync(
  configFile,
  'app:\n  name: runtime-basics\n  tenant: acme\nfeature:\n  betaEnabled: false\n  greeting: Hello from v0.3.0\n',
  'utf8',
);

@Module({
  imports: [ConfigModule.forRootAsync({ path: configFile, watch: true })],
  controllers: [RuntimeController],
  providers: [RequestScopeService],
})
class TestAppModule {}

/** 统一解包：框架默认把返回值包成 `{ code, data, message }` */
async function get<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  const body = (await res.json()) as { code: number; data: T; message: string };
  return body.data;
}

interface ContextPayload {
  requestId: string;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  scopeInstanceNo: number;
  scopeRequestId: string;
  configReloadable: boolean;
}

/**
 * v0.3.0 集成测试：请求上下文 / REQUEST 作用域 / 配置热更新 / traceparent / 探针。
 *
 * 覆盖的是"只有跑起来才知道"的行为，
 * 尤其是 REQUEST 作用域实例**每请求一份、请求内共享**这个语义。
 */
describe('v0.3.0 runtime-basics (integration)', () => {
  let app: RestApplication;
  let base: string;

  beforeAll(async () => {
    app = await RestApplication.create(TestAppModule, {
      name: 'runtime-basics-test',
      quiet: true,
      middleware: [requestContext(), bodyParser()],
    });
    const { port } = await app.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${port}`;
    app.markReady();
  });

  afterAll(async () => {
    await app.close();
  });

  it('gives each request its own request id', async () => {
    const a = await get<ContextPayload>(`${base}/api/runtime/context`);
    const b = await get<ContextPayload>(`${base}/api/runtime/context`);
    expect(a.requestId).toMatch(/^req_[0-9a-f]{8}$/);
    expect(a.requestId).not.toBe(b.requestId);
  });

  it('creates one REQUEST-scoped instance per request', async () => {
    const a = await get<ContextPayload>(`${base}/api/runtime/context`);
    const b = await get<ContextPayload>(`${base}/api/runtime/context`);
    expect(b.scopeInstanceNo).toBeGreaterThan(a.scopeInstanceNo);
  });

  it('binds the current request context into the REQUEST-scoped provider', async () => {
    const c = await get<ContextPayload>(`${base}/api/runtime/context`);
    // v0.3.0 最容易出错的地方：请求级 Provider 与 handler 必须是同一个上下文
    expect(c.scopeRequestId).toBe(c.requestId);
  });

  it('shares the REQUEST-scoped instance within one request and not across requests', async () => {
    const first = await get<{ instanceNo: number; notes: string[] }>(`${base}/api/runtime/notes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ note: 'first' }),
    });
    expect(first.notes).toEqual(['first']);

    const second = await get<{ instanceNo: number; notes: string[] }>(`${base}/api/runtime/notes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ note: 'second' }),
    });
    expect(second.notes).toEqual(['second']);
    expect(second.instanceNo).toBeGreaterThan(first.instanceNo);
  });

  it('generates a fresh trace when no traceparent is sent', async () => {
    const t = await get<{ traceId: string; parentSpanId: string | null }>(`${base}/api/runtime/trace`);
    expect(t.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(t.parentSpanId).toBeNull();
  });

  it('inherits traceId from an upstream traceparent header', async () => {
    const res = await fetch(`${base}/api/runtime/trace`, {
      headers: { traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01' },
    });
    const body = (await res.json()) as {
      data: { traceId: string; parentSpanId: string | null; sampled: boolean };
    };
    expect(body.data.traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
    expect(body.data.parentSpanId).toBe('00f067aa0ba902b7');
    expect(body.data.sampled).toBe(true);
  });

  it('exposes x-request-id on the response', async () => {
    const res = await fetch(`${base}/api/runtime/context`);
    expect(res.headers.get('x-request-id')).toMatch(/^req_/);
  });

  it('serves liveness and readiness probes', async () => {
    const live = await fetch(`${base}/healthz`);
    expect(live.status).toBe(200);
    const liveBody = (await live.json()) as { status: string; checks: Array<{ name: string }> };
    expect(liveBody.status).toBe('ok');

    const ready = await fetch(`${base}/readyz`);
    expect(ready.status).toBe(200);
    const readyBody = (await ready.json()) as { status: string; uptimeSec: number };
    expect(readyBody.status).toBe('ok');
    expect(readyBody.uptimeSec).toBeGreaterThanOrEqual(0);
  });

  it('returns 503 from readiness when the app is not ready', async () => {
    app.markNotReady();
    const ready = await fetch(`${base}/readyz`);
    expect(ready.status).toBe(503);
    app.markReady();
    expect((await fetch(`${base}/readyz`)).status).toBe(200);
  });

  it('hot-reloads configuration when the file changes', async () => {
    const before = await get<{ betaEnabled: boolean; greeting: string }>(`${base}/api/runtime/config`);
    expect(before.betaEnabled).toBe(false);

    writeFileSync(
      configFile,
      'app:\n  name: runtime-basics\n  tenant: acme\nfeature:\n  betaEnabled: true\n  greeting: Hot reloaded!\n',
      'utf8',
    );

    const deadline = Date.now() + 3000;
    let after = before;
    while (Date.now() < deadline) {
      after = await get<{ betaEnabled: boolean; greeting: string }>(`${base}/api/runtime/config`);
      if (after.betaEnabled) break;
      await sleep(50);
    }
    expect(after.betaEnabled).toBe(true);
    expect(after.greeting).toBe('Hot reloaded!');
  });
});
