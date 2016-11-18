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