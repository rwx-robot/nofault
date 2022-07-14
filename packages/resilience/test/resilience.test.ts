import { describe, expect, it, vi } from 'vitest';
import {
  TokenBucket,
  KeyedRateLimiter,
  CircuitBreaker,
  CircuitOpenError,
  Bulkhead,
  BulkheadRejectedError,
  backoffDelay,
  retryWithBackoff,
} from '../src/index';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('TokenBucket', () => {
  it('allows a burst up to capacity then refills over time', async () => {
    const bucket = new TokenBucket({ capacity: 3, refillPerSecond: 10 });
    expect(bucket.tryRemove().allowed).toBe(true);
    expect(bucket.tryRemove().allowed).toBe(true);
    expect(bucket.tryRemove().allowed).toBe(true);
    // 桶空了
    expect(bucket.tryRemove().allowed).toBe(false);
    // 10/s => 100ms 补 1 个
    await sleep(120);
    expect(bucket.tryRemove().allowed).toBe(true);
  });

  it('never refills above capacity', async () => {
    const bucket = new TokenBucket({ capacity: 2, refillPerSecond: 100 });
    await sleep(150);
    expect(bucket.tryRemove().allowed).toBe(true);
    expect(bucket.tryRemove().allowed).toBe(true);
    expect(bucket.tryRemove().allowed).toBe(false);
  });

  it('reports how long to wait', () => {
    const bucket = new TokenBucket({ capacity: 1, refillPerSecond: 10 });
    bucket.tryRemove();
    const result = bucket.tryRemove();
    expect(result.allowed).toBe(false);
    // 10/s：等约 100ms 才有下一个令牌
    expect(result.retryAfterMs).toBeGreaterThan(50);
    expect(result.retryAfterMs).toBeLessThanOrEqual(150);
  });
});

describe('KeyedRateLimiter', () => {
  it('limits each key independently', () => {
    const limiter = new KeyedRateLimiter({ capacity: 1, refillPerSecond: 1 });
    expect(limiter.check('a').allowed).toBe(true);
    expect(limiter.check('a').allowed).toBe(false);
    // 另一个 key 有自己的桶
    expect(limiter.check('b').allowed).toBe(true);
  });

  it('reset frees the key', () => {
    const limiter = new KeyedRateLimiter({ capacity: 1, refillPerSecond: 1 });
    limiter.check('a');
    limiter.reset('a');
    expect(limiter.check('a').allowed).toBe(true);
  });
});

describe('CircuitBreaker', () => {
  it('opens after the failure threshold and fails fast while open', async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 1000 });
    const failing = vi.fn(async () => {
      throw new Error('down');
    });

    await expect(breaker.run(failing)).rejects.toThrow('down');
    await expect(breaker.run(failing)).rejects.toThrow('down');
    expect(breaker.currentState).toBe('open');

    // OPEN 期间**不能**再打下游：这是熔断的全部意义
    const before = failing.mock.calls.length;
    await expect(breaker.run(failing)).rejects.toBeInstanceOf(CircuitOpenError);
    expect(failing.mock.calls.length).toBe(before);
  });

  it('goes half-open after the reset timeout, then closes on success', async () => {
    let now = 0;
    const breaker = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 500, now: () => now });

    await expect(
      breaker.run(async () => {
        throw new Error('down');
      }),
    ).rejects.toThrow('down');
    expect(breaker.currentState).toBe('open');

    now = 500;
    expect(breaker.currentState).toBe('half-open');

    await expect(breaker.run(async () => 'ok')).resolves.toBe('ok');
    expect(breaker.currentState).toBe('closed');
  });

  it('re-opens immediately when a half-open probe fails', async () => {
    let now = 0;
    const breaker = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 200, now: () => now });
    await expect(
      breaker.run(async () => {
        throw new Error('down');
      }),
    ).rejects.toThrow();

    now = 200;
    expect(breaker.currentState).toBe('half-open');
    await expect(
      breaker.run(async () => {
        throw new Error('still down');
      }),
    ).rejects.toThrow('still down');
    // 半开阶段再失败 = 下游还没恢复，立刻回到熔断
    expect(breaker.currentState).toBe('open');
  });

  it('lets a custom predicate ignore expected failures', async () => {
    // 业务校验失败不算"依赖故障"，不该触发熔断
    const breaker = new CircuitBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 1000,
      isFailure: (err) => !(err instanceof Error && err.message === 'bad request'),
    });
    await expect(
      breaker.run(async () => {
        throw new Error('bad request');
      }),
    ).rejects.toThrow('bad request');
    expect(breaker.currentState).toBe('closed');
  });
});

describe('Bulkhead', () => {
  it('caps concurrent executions', async () => {
    const guard = new Bulkhead({ concurrency: 2, queueLimit: 0 });
    let running = 0;
    let peak = 0;

    const task = () =>
      guard.run(async () => {
        running++;
        peak = Math.max(peak, running);
        await sleep(20);
        running--;
        return 'done';
      });

    await Promise.all([task(), task(), task(), task()].map((p) => p.catch(() => 'rejected')));
    expect(peak).toBeLessThanOrEqual(2);
  });

  it('rejects instead of queueing forever when the queue is full', async () => {
    const guard = new Bulkhead({ concurrency: 1, queueLimit: 0 });
    const first = guard.run(async () => {
      await sleep(50);
      return 1;
    });
    await expect(guard.run(async () => 2)).rejects.toBeInstanceOf(BulkheadRejectedError);
    await first;
  });
});

describe('backoff', () => {
  it('grows exponentially and respects the ceiling', () => {
    expect(backoffDelay(0, { baseMs: 10, factor: 2, jitter: 0 })).toBe(10);
    expect(backoffDelay(1, { baseMs: 10, factor: 2, jitter: 0 })).toBe(20);
    expect(backoffDelay(10, { baseMs: 10, factor: 2, maxMs: 100, jitter: 0 })).toBe(100);
  });

  it('jitters so that retries do not synchronise', () => {
    // 没有抖动 = 所有调用方同时重试 = 重试风暴
    const samples = Array.from({ length: 50 }, () => backoffDelay(3, { baseMs: 10, factor: 2, jitter: 0.5 }));
    const unique = new Set(samples);
    expect(unique.size).toBeGreaterThan(1);