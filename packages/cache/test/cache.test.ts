import { describe, expect, it, vi } from 'vitest';
import { MemoryCache, NullCache, withJitter, cacheKey, cached } from '../src/index';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('MemoryCache', () => {
  it('stores and returns values', async () => {
    const cache = new MemoryCache();
    await cache.set('a', 1);
    expect(await cache.get('a')).toBe(1);
    expect(await cache.has('a')).toBe(true);
  });

  it('expires after ttl', async () => {
    const cache = new MemoryCache();
    await cache.set('a', 1, { ttl: 20 });
    expect(await cache.get('a')).toBe(1);
    await sleep(40);
    expect(await cache.get('a')).toBeUndefined();