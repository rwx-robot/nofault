import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { Injectable, Module, Scope, NofaultFactory, MissingContextIdError } from '../src/index';

describe('REQUEST scope', () => {
  it('throws MissingContextIdError when resolved without a context', async () => {
    @Injectable({ scope: Scope.REQUEST })
    class PerRequest {}

    @Module({ providers: [PerRequest] })
    class AppModule {}

    const app = await NofaultFactory.createApplicationContext(AppModule, { quiet: true });
    await expect(app.get(PerRequest)).rejects.toThrow(MissingContextIdError);
  });

  it('returns the same instance within one context and a new one per context', async () => {
    @Injectable({ scope: Scope.REQUEST })
    class PerRequest {}

    @Module({ providers: [PerRequest] })
    class AppModule {}

    const app = await NofaultFactory.createApplicationContext(AppModule, { quiet: true });
    const ctxA = {};
    const ctxB = {};

    const a1 = await app.get(PerRequest, ctxA);
    const a2 = await app.get(PerRequest, ctxA);
    const b1 = await app.get(PerRequest, ctxB);

    expect(a1).toBe(a2);
    expect(a1).not.toBe(b1);
  });

  it('releases per-context instances on clearRequestContext', async () => {
    @Injectable({ scope: Scope.REQUEST })
    class PerRequest {}

    @Module({ providers: [PerRequest] })
    class AppModule {}

    const app = await NofaultFactory.createApplicationContext(AppModule, { quiet: true });
    const ctx = {};
    await app.get(PerRequest, ctx);
    expect(app.clearRequestContext(ctx)).toBe(1);
    // 清理后再取会得到全新实例
    expect(app.clearRequestContext(ctx)).toBe(0);
  });
});

describe('captive dependency propagation', () => {
  it('does not let a singleton capture a request-scoped instance', async () => {
    @Injectable({ scope: Scope.REQUEST })
    class PerRequest {
      readonly tag = Math.random();
    }

    @Injectable()
    class SingletonConsumer {
      constructor(readonly dep: PerRequest) {}
    }

    @Module({ providers: [PerRequest, SingletonConsumer] })
    class AppModule {}

    const app = await NofaultFactory.createApplicationContext(AppModule, { quiet: true });

    const ctxA = {};
    const ctxB = {};
    const a = await app.get(SingletonConsumer, ctxA);