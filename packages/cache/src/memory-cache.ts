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

/** 空值（防穿透标记）的兜底 TTL：空值缓存**永远**要有界，否则"查不到"会被永久固化 */
const DEFAULT_NULL_TTL_MS = 60_000;

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
    // 空值有两种形态：调用方传入的 undefined，以及内部用的 EMPTY 哨兵
    const isNullValue = value === undefined || value === EMPTY;

    if (isNullValue && !this.options.cacheNullValue) {
      // 不固化"没有结果"：让下一次请求有机会重新回源
      this.store.delete(key);
      this.counters.sets++;
      return;
    }

    /**
     * 空值的 TTL 必须**永远有界**。
     *
     * 若沿用普通默认值：当 ttl 配置为 0（"永不过期"，很常见）时，
     * "查不到"这个结果会被写成 expiresAt = Infinity ——
     * 之后数据库里真的插入了这条记录，业务也会永远读到"没有"，
     * 只能靠重启进程恢复。所以空值走 nullTtl，且兜底 60s。
     */
    const effectiveTtl = isNullValue
      ? (options.ttl ?? this.options.nullTtl ?? DEFAULT_NULL_TTL_MS) || DEFAULT_NULL_TTL_MS
      : (options.ttl ?? this.options.ttl ?? 0);

    this.store.set(key, {
      value: isNullValue ? EMPTY : value,
      expiresAt:
        effectiveTtl > 0 ? Date.now() + withJitter(effectiveTtl, this.options.jitter ?? 0.1) : Number.POSITIVE_INFINITY,
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
          await this.set(key, EMPTY, { ttl: this.options.nullTtl ?? DEFAULT_NULL_TTL_MS });
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
    const excess = this.store.size - max;
    if (excess <= 0) return;

    /**
     * 只淘汰 touchedAt 最小的 excess 个，不做全量排序。
     *
     * set() 是热路径：原先每次写入都把全部条目物化成数组再 sort，
     * 是 O(n log n)；max 配得越大越明显。
     * 实际场景下 excess 通常就是 1（写入后立刻淘汰），
     * 这里用一次线性扫描维护"待淘汰的 excess 个"，退化为 O(n)。
     */
    const victims: Array<{ key: string; touchedAt: number }> = [];
    for (const [key, entry] of this.store) {
      if (victims.length < excess) {
        victims.push({ key, touchedAt: entry.touchedAt });
        continue;
      }
      // victims 里 touchedAt 最大的那个是"最不该被淘汰的"，用更旧的替换它
      let worstIdx = 0;
      for (let i = 1; i < victims.length; i++) {
        if (victims[i]!.touchedAt > victims[worstIdx]!.touchedAt) worstIdx = i;
      }
      if (entry.touchedAt < victims[worstIdx]!.touchedAt) {