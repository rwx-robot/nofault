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
}

export interface Cache {
  readonly name: string;
  get<T = unknown>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown, options?: SetOptions): Promise<void>;
  delete(key: string): Promise<boolean>;
  has(key: string): Promise<boolean>;
  clear(): Promise<void>;
  /**
   * 取值；未命中时调用 loader 回源并写入。
   *
   * 语义保证：
   * - **并发下同一 key 只回源一次**（single-flight），避免缓存击穿
   * - loader 返回 undefined 时**不写缓存**（否则会把"没有结果"固化成"永远查不到"）
   * - loader 抛错会向所有等待者传播，不会留下半截状态
   */
  getOrSet<T>(key: string, loader: () => Promise<T | undefined>, options?: SetOptions): Promise<T | undefined>;