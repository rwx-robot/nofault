/**
 * 分布式锁。
 *
 * 关键点是**释放时必须校验 token**：
 * 一个服务持锁超时（比如 GC 停顿），锁被别人拿走，然后它恢复过来把锁释放了——
 * 释放的其实是别人的锁。不加校验，两个实例会同时进入临界区，
 * 而这恰恰是"加锁本来要防止的事"。
 *
 * 后端是可插拔的：内存实现用于单进程与测试，
 * 换成 Redis 只要实现 `LockBackend` 三个方法（对应 SET NX PX / Lua 释放 / Lua 续期）。
 */
export interface LockBackend {
  /** 拿不到就返回 false，不要阻塞 */
  acquire(key: string, token: string, ttlMs: number): Promise<boolean>;
  /** 只有 token 匹配才删除 */
  release(key: string, token: string): Promise<void>;
  /** 续期到新的 TTL，token 不匹配返回 false */
  extend(key: string, token: string, ttlMs: number): Promise<boolean>;
}

/** 内存后端：单进程内的互斥，也方便测试锁本身的语义 */
export class MemoryLockBackend implements LockBackend {
  private readonly held = new Map<string, { token: string; expiresAt: number }>();

  async acquire(key: string, token: string, ttlMs: number): Promise<boolean> {
    const current = this.held.get(key);
    const now = Date.now();
    if (current && current.expiresAt > now) return false;
    this.held.set(key, { token, expiresAt: now + ttlMs });
    return true;