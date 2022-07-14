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