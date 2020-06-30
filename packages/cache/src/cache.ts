/**
 * 缓存抽象。
 *
 * 接口刻意只有 6 个方法，且 `getOrSet` 是**唯一推荐**的用法：
 * 手写 `get → 未命中 → 查库 → set` 这三步，在并发下必然踩坑，
 * 把它收进实现里，业务代码就写不出错的写法。
 */
export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  evictions: number;
}

export interface SetOptions {
  /** 生存时间（毫秒） */
  ttl?: number;