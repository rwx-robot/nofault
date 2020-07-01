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