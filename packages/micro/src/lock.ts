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
  }

  async release(key: string, token: string): Promise<void> {
    const current = this.held.get(key);
    // 不匹配就不动：这把锁已经不属于我了
    if (!current || current.token !== token) return;
    this.held.delete(key);
  }

  async extend(key: string, token: string, ttlMs: number): Promise<boolean> {
    const current = this.held.get(key);
    if (!current || current.token !== token) return false;
    current.expiresAt = Date.now() + ttlMs;
    return true;
  }

  /** 测试用：清掉所有锁 */
  reset(): void {
    this.held.clear();
  }
}

export interface LockHandle {
  readonly token: string;
  /** 主动释放；重复调用无害 */
  release(): Promise<void>;
  /** 是否已经停止自动续期 */
  readonly released: boolean;
}

export interface LockOptions {
  /** 锁的过期时间。必须大于单次业务的最坏耗时 */
  ttlMs?: number;
  /** 拿不到锁时的等待时间；0 表示立即失败 */
  waitMs?: number;
  /** 等待期间的重试间隔 */
  retryMs?: number;
  /** 是否自动续期（watchdog）。执行时间不可控时应该开 */
  autoRenew?: boolean;
  /** 续期间隔，默认 ttl 的三分之一 */
  renewEveryMs?: number;
}

export class LockAcquisitionError extends Error {
  constructor(readonly nameOverride: string, waitedMs: number) {
    super(`could not acquire lock "${nameOverride}" within ${waitedMs}ms`);
    this.name = 'LockAcquisitionError';
  }
}

export class DistributedLock {
  constructor(
    readonly name: string,
    private readonly backend: LockBackend,
    private readonly options: LockOptions = {},
  ) {}

  /** 尝试拿锁，拿到返回句柄，拿不到返回 null */
  async tryAcquire(): Promise<LockHandle | null> {
    const ttl = this.options.ttlMs ?? 30_000;
    const token = newToken();
    const ok = await this.backend.acquire(this.name, token, ttl);
    if (!ok) return null;
    return this.watch(token, ttl);
  }

  /** 一直等到拿到锁为止（受 waitMs 限制） */
  async acquire(): Promise<LockHandle> {
    const waitMs = this.options.waitMs ?? 0;
    const retryMs = this.options.retryMs ?? 50;
    const deadline = Date.now() + waitMs;

    for (;;) {
      const handle = await this.tryAcquire();
      if (handle) return handle;
      if (Date.now() >= deadline) throw new LockAcquisitionError(this.name, waitMs);
      await sleep(Math.min(retryMs, Math.max(1, deadline - Date.now())));
    }
  }

  /**
   * 持锁执行。无论成功还是抛错都会释放——
   * 忘了释放的锁会一直挂到 TTL 到期，这段时间整个功能都是停的。
   */
  async run<T>(fn: (handle: LockHandle) => Promise<T> | T): Promise<T> {
    const handle = await this.acquire();
    try {
      return await fn(handle);
    } finally {
      await handle.release();
    }
  }

  /** 包一张写着 token 的句柄，并按需要起 watchdog */
  private watch(token: string, ttl: number): LockHandle {
    const renewEvery = this.options.renewEveryMs ?? Math.max(100, Math.floor(ttl / 3));
    let timer: NodeJS.Timeout | undefined;
    let released = false;

    const stop = (): void => {
      if (timer) clearInterval(timer);
      timer = undefined;
    };

    if (this.options.autoRenew !== false) {
      timer = setInterval(() => {
        // 续期失败（锁已被别人拿走）就停掉 watchdog，
        // 否则它会一直对着一把不属于自己的锁做无用续期
        void this.backend.extend(this.name, token, ttl).then((ok) => {
          if (!ok) stop();
        });
      }, renewEvery);
      timer.unref?.();
    }

    return {
      token,
      released,
      release: async () => {
        if (released) return;
        released = true;
        stop();
        await this.backend.release(this.name, token);
      },
    };