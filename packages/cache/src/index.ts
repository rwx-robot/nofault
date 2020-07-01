/**
 * @nofault/cache —— 缓存抽象与内存实现（v0.5.0）。
 */
export { MemoryCache, withJitter } from './memory-cache';
export type { MemoryCacheOptions } from './memory-cache';
export { NullCache } from './cache';
export type { Cache, CacheStats, SetOptions } from './cache';