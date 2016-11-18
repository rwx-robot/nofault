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