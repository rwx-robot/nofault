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
    expect(await cache.has('a')).toBe(false);
  });

  it('deletes and clears', async () => {
    const cache = new MemoryCache();
    await cache.set('a', 1);
    await cache.set('b', 2);
    expect(await cache.delete('a')).toBe(true);
    expect(await cache.delete('missing')).toBe(false);
    await cache.clear();
    expect(await cache.get('b')).toBeUndefined();
  });

  it('evicts least recently used entries when max is reached', async () => {
    const cache = new MemoryCache({ max: 2 });
    await cache.set('a', 1);
    await cache.set('b', 2);
    // 访问 a，让 b 变成最久未用
    await cache.get('a');
    await cache.set('c', 3);
    expect(await cache.get('b')).toBeUndefined();
    expect(await cache.get('a')).toBe(1);
    expect(cache.stats().evictions).toBe(1);
  });

  it('evicts the truly oldest entry, not an arbitrary one', async () => {
    const cache = new MemoryCache({ max: 3 });
    await cache.set('a', 1);
    await cache.set('b', 2);
    await cache.set('c', 3);
    // 重新访问 a、b，让 c 成为最久未用的那个
    await cache.get('a');
    await cache.get('b');
    await cache.set('d', 4);
    expect(await cache.get('c')).toBeUndefined();
    expect(await cache.get('a')).toBe(1);
    expect(await cache.get('b')).toBe(2);
    expect(await cache.get('d')).toBe(4);
    expect(cache.stats().evictions).toBe(1);
  });

  it('counts hits and misses', async () => {
    const cache = new MemoryCache();
    await cache.get('nope');
    await cache.set('a', 1);
    await cache.get('a');
    expect(cache.stats()).toMatchObject({ hits: 1, misses: 1, sets: 1 });
  });
});

describe('getOrSet', () => {
  it('loads once on a miss', async () => {
    const cache = new MemoryCache();
    const loader = vi.fn(async () => 'value');
    expect(await cache.getOrSet('k', loader)).toBe('value');
    expect(loader).toHaveBeenCalledTimes(1);
    // 第二次走缓存
    expect(await cache.getOrSet('k', loader)).toBe('value');
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('reuses one in-flight load for concurrent callers (stampede protection)', async () => {
    const cache = new MemoryCache();
    // gate 先建好：loader 是异步函数，若等它被调用时才拿到 resolve，
    // 这里会先执行到 resolve('done')，而那时 resolve 还是空实现
    let release!: (v: string) => void;
    const gate = new Promise<string>((r) => {
      release = r;
    });
    const loader = vi.fn(() => gate);

    const first = cache.getOrSet('k', loader);