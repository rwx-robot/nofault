import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHttpApplication } from '@nofault/http';
import type { NofaultApplication } from '@nofault/core';
import { AppModule } from '../../../examples/v0.1.0-hello-kernel/src/app.module';
import { GreeterService } from '../../../examples/v0.1.0-hello-kernel/src/greeter.service';
import { createRouter } from '../../../examples/v0.1.0-hello-kernel/src/router';

/**
 * 集成测试：真实起服务 + 真实发请求。
 *
 * 这是 v0.1.0 DoD 的硬性要求——示例必须"跑得起来"，而不是只有编译通过。
 */
describe('v0.1.0 hello-kernel (integration)', () => {
  let app: NofaultApplication;
  let baseUrl: string;

  beforeAll(async () => {
    app = await createHttpApplication(AppModule, { name: 'hello-kernel-test', quiet: true });
    const greeter = await app.get(GreeterService);
    app.use(createRouter(greeter));
    const { port } = await app.listen(0, '127.0.0.1');
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET / returns the welcome text', async () => {
    const res = await fetch(`${baseUrl}/`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nofault v0.1.0');
  });