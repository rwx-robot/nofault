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
    const second = cache.getOrSet('k', loader);
    const third = cache.getOrSet('k', loader);

    release('done');
    expect(await Promise.all([first, second, third])).toEqual(['done', 'done', 'done']);
    // 三个并发调用只回源一次——这正是缓存击穿的防线
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('does not cache undefined results by default', async () => {
    const cache = new MemoryCache();
    const loader = vi.fn(async () => undefined);
    await cache.getOrSet('k', loader);
    await cache.getOrSet('k', loader);
    // 固化"查不到"会让数据一旦写入就永远读不到，默认必须关闭
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('can cache null results when explicitly asked (penetration protection)', async () => {
    const cache = new MemoryCache({ cacheNullValue: true, nullTtl: 1000 });
    const loader = vi.fn(async () => undefined);
    await cache.getOrSet('k', loader);
    await cache.getOrSet('k', loader);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('propagates loader errors to every waiter', async () => {
    const cache = new MemoryCache();
    const loader = async () => {
      throw new Error('db down');
    };
    await expect(cache.getOrSet('k', loader)).rejects.toThrow('db down');
    // 失败后不能留下"锁"，否则后续请求永远拿不到数据
    expect(await cache.getOrSet('k', async () => 'ok')).toBe('ok');
  });
});

describe('ttl jitter', () => {
  it('spreads expiry around the base ttl', () => {
    for (let i = 0; i < 50; i++) {
      const value = withJitter(1000, 0.1);
      expect(value).toBeGreaterThanOrEqual(900);
      expect(value).toBeLessThanOrEqual(1100);
    }
  });

  it('returns the exact ttl when jitter is disabled', () => {
    expect(withJitter(1000, 0)).toBe(1000);
  });
});

describe('NullCache', () => {
  it('never stores anything but still calls the loader', async () => {
    const cache = new NullCache();
    await cache.set('a', 1);
    expect(await cache.get('a')).toBeUndefined();
    expect(await cache.getOrSet('a', async () => 'fresh')).toBe('fresh');
  });
});

describe('helpers', () => {
  it('builds stable cache keys from mixed parts', () => {
    expect(cacheKey(['user', 1, { page: 2 }])).toBe('user:1:{"page":2}');
  });

  it('wraps a function with caching', async () => {
    const cache = new MemoryCache();
    const calls = vi.fn(async (id: number) => `user-${id}`);
    const getUser = cached(cache, 'user', calls);
    expect(await getUser(1)).toBe('user-1');
    expect(await getUser(1)).toBe('user-1');
    expect(await getUser(2)).toBe('user-2');
    expect(calls).toHaveBeenCalledTimes(2);
  });
});
