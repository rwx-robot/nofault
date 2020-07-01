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