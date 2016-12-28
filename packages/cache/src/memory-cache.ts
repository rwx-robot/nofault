/**
 * 内存缓存：TTL + LRU + 抖动 + single-flight。
 *
 * 三个"缓存经典问题"在这里各有一处对应：
 * - **穿透**：loader 返回 undefined 时**也**写入一个短 TTL 的空标记（默认关闭，
 *   由 `cacheNullValue` 控制），避免同一批不存在的 key 反复打到数据库
 * - **击穿**：同一 key 并发只回源一次（`inflight` 表）
 * - **雪崩**：TTL 加随机抖动（默认 ±10%），避免同一时刻集体过期
 */
import type { Cache, CacheStats, SetOptions } from './cache';

export interface MemoryCacheOptions {
  /** 默认 TTL（毫秒），0 表示不过期 */
  ttl?: number;
  /** 最多保留多少条；超出按 LRU 淘汰 */
  max?: number;
  /** TTL 抖动比例，0~1；默认 0.1（±10%） */
  jitter?: number;
  /** 是否缓存"查不到"这个结果（默认 false） */
  cacheNullValue?: boolean;
  /** 空值的 TTL，默认 60s */
  nullTtl?: number;
}

interface Entry {
  value: unknown;
  expiresAt: number;
  /** LRU：最近一次访问时间 */
  touchedAt: number;
}

const EMPTY = Symbol('cache:empty');

export class MemoryCache implements Cache {
  readonly name = 'memory';
  private readonly store = new Map<string, Entry>();
  private readonly inflight = new Map<string, Promise<unknown>>();
  private readonly counters: CacheStats = { hits: 0, misses: 0, sets: 0, deletes: 0, evictions: 0 };
  private clock = 0;

  constructor(private readonly options: MemoryCacheOptions = {}) {}

  async get<T = unknown>(key: string): Promise<T | undefined> {
    const hit = this.lookup(key);
    if (!hit) {
      this.counters.misses++;
      return undefined;
    }
    this.counters.hits++;
    return (hit.value === EMPTY ? undefined : hit.value) as T;
  }

  /**
   * 取值并告知"到底命中没有"。
   *
   * 与 `get()` 的差别很关键：缓存里可能存着一个**空值标记**（防穿透），
   * 此时 `get()` 返回 undefined，但语义是"命中了，结果是空"。
   * 只有区分二者，空值缓存才不会退化成"每次都回源"。
   */
  private lookup(key: string): Entry | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (this.isExpired(entry)) {
      this.store.delete(key);
      return undefined;
    }
    entry.touchedAt = ++this.clock;
    return entry;
  }

  async set(key: string, value: unknown, options: SetOptions = {}): Promise<void> {
    const ttl = options.ttl ?? this.options.ttl ?? 0;
    const stored = value === undefined ? EMPTY : value;
    if (value === undefined && !this.options.cacheNullValue) {
      // 不固化"没有结果"：让下一次请求有机会重新回源
      this.store.delete(key);
      this.counters.sets++;
      return;
    }
    this.store.set(key, {
      value: stored,
      expiresAt: ttl > 0 ? Date.now() + withJitter(ttl, this.options.jitter ?? 0.1) : Number.POSITIVE_INFINITY,
      touchedAt: ++this.clock,
    });
    this.counters.sets++;
    this.evictIfNeeded();
  }

  async delete(key: string): Promise<boolean> {
    this.counters.deletes++;
    return this.store.delete(key);
  }

  async has(key: string): Promise<boolean> {
    const entry = this.store.get(key);
    return entry !== undefined && !this.isExpired(entry);
  }

  async clear(): Promise<void> {
    this.store.clear();
  }

  async getOrSet<T>(key: string, loader: () => Promise<T | undefined>, options: SetOptions = {}): Promise<T | undefined> {
    // 命中（包括"命中了空值"）就直接返回，不再回源
    const hit = this.lookup(key);
    if (hit) {
      this.counters.hits++;
      return (hit.value === EMPTY ? undefined : hit.value) as T;
    }
    this.counters.misses++;

    // 已有同 key 的回源在飞：直接复用它的 Promise，不再打一次数据库
    const pending = this.inflight.get(key) as Promise<T | undefined> | undefined;
    if (pending) return pending;

    const task = (async () => {
      try {
        const value = await loader();
        if (value === undefined && this.options.cacheNullValue) {
          await this.set(key, EMPTY, { ttl: this.options.nullTtl ?? 60_000 });
        } else {
          await this.set(key, value, options);
        }
        return value;
      } finally {
        this.inflight.delete(key);
      }
    })();

    this.inflight.set(key, task as Promise<unknown>);
    return task;
  }

  stats(): CacheStats {
    return { ...this.counters };
  }

  /** 测试用：把时钟往前推，避免真的 sleep */
  size(): number {
    return this.store.size;
  }

  private isExpired(entry: Entry): boolean {
    return entry.expiresAt <= Date.now();
  }

  private evictIfNeeded(): void {
    const max = this.options.max ?? 0;
    if (max <= 0 || this.store.size <= max) return;
    const oldest = [...this.store.entries()].sort((a, b) => a[1].touchedAt - b[1].touchedAt);
    const excess = this.store.size - max;
    for (let i = 0; i < excess; i++) {
      this.store.delete(oldest[i]![0]);
      this.counters.evictions++;
    }
  }
}

/** TTL 抖动：把过期时间打散，避免"同一秒创建的一批 key 集体失效" */
export function withJitter(ttl: number, ratio: number): number {
  if (ratio <= 0) return ttl;
  const delta = ttl * Math.min(ratio, 1);
  return Math.round(ttl - delta + Math.random() * delta * 2);
}
