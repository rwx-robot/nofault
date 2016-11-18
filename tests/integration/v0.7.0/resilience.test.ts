/**
 * v0.7.0 端到端：治理能力真的接在 HTTP 链路上。
 *
 * 单测能证明算法对，但证明不了"位置对不对"：
 * 限流是不是在最外层、熔断打开时是不是真的没打下游——
 * 这些只有跑起来才知道。
 */
import { afterAll, describe, expect, it } from 'vitest';
import 'reflect-metadata';
import { Module } from '@nofault/core';
import { Controller, Get, RestApplication, type Middleware } from '@nofault/rest';
import { KeyedRateLimiter, CircuitBreaker, CircuitOpenError, rateLimit } from '@nofault/resilience';

let calls = 0;
let mode: 'ok' | 'down' = 'ok';

const breaker = new CircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 300, halfOpenMaxCalls: 1 });

@Controller('/api')
class ApiController {
  @Get('/ping')
  async ping(): Promise<{ ok: true }> {
    return { ok: true };
  }

  @Get('/flaky')
  async flaky(): Promise<{ ok: true }> {
    return breaker.run(async () => {
      calls++;
      if (mode === 'down') throw new Error('down');
      return { ok: true };
    });
  }
}

@Module({ controllers: [ApiController] })
class AppModule {}

let app: RestApplication;
let base: string;

afterAll(async () => {
  await app?.close();
});

describe('resilience over http', () => {
  it('rate limits per client and returns 429 with retry-after', async () => {
    app = await RestApplication.create(AppModule, {
      quiet: true,
      middleware: [rateLimit({ capacity: 3, refillPerSecond: 1 }) as unknown as Middleware],
    });
    const { port } = await app.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${port}`;

    const codes: number[] = [];
    for (let i = 0; i < 5; i++) {
      // 每个用例用自己的 IP，避免共享同一个限流桶（否则后面的用例一上来就被 429）
      const res = await fetch(`${base}/api/ping`, { headers: { 'x-forwarded-for': '10.0.0.1' } });
      codes.push(res.status);
    }
    expect(codes.slice(0, 3)).toEqual([200, 200, 200]);
    expect(codes.slice(3)).toEqual([429, 429]);

    const limited = await fetch(`${base}/api/ping`, { headers: { 'x-forwarded-for': '10.0.0.1' } });
    expect(limited.headers.get('retry-after')).toBeTruthy();
  });

  it('opens the circuit and stops calling the dependency', async () => {
    mode = 'down';
    const before = calls;
    for (let i = 0; i < 2; i++) {
      await fetch(`${base}/api/flaky`, { headers: { 'x-forwarded-for': '10.0.0.2' } });
    }
    expect(calls - before).toBeGreaterThanOrEqual(2);

    // 熔断打开后：请求还是能进来，但**不会再打下游**
    const openBefore = calls;
    await expect(breaker.run(async () => 'x')).rejects.toBeInstanceOf(CircuitOpenError);
    expect(calls).toBe(openBefore);
  });

  it('recovers through half-open', async () => {
    mode = 'ok';
    await new Promise((r) => setTimeout(r, 320));
    expect(breaker.currentState).toBe('half-open');
    await expect(breaker.run(async () => 'ok')).resolves.toBe('ok');
    expect(breaker.currentState).toBe('closed');
  });

  it('keeps separate buckets per key', () => {
    const limiter = new KeyedRateLimiter({ capacity: 1, refillPerSecond: 1 });
    expect(limiter.check('ip-a').allowed).toBe(true);
    expect(limiter.check('ip-a').allowed).toBe(false);
    expect(limiter.check('ip-b').allowed).toBe(true);
  });
});
