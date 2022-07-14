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