/**
 * 舱壁（并发隔离）与退避重试。
 *
 * 舱壁的思路来自造船：把船舱隔成多个密闭空间，进水也不会整船沉没。
 * 对应到服务：**每个依赖一个并发上限**，某个依赖慢住时，
 * 只耗尽它自己的配额，不会把整个进程的线程/连接吃光。
 */

export interface BulkheadOptions {
  /** 最大并发数 */
  concurrency: number;
  /** 队列里最多排多少人；超出直接拒绝（有界队列，避免内存堆积） */
  queueLimit?: number;
  /** 等待配额的超时（毫秒） */
  waitTimeoutMs?: number;
}

export class BulkheadRejectedError extends Error {
  constructor(message = 'bulkhead is full') {
    super(message);
    this.name = 'BulkheadRejectedError';
  }
}

export class Bulkhead {
  private active = 0;
  private waiting = 0;
  private readonly concurrency: number;
  private readonly queueLimit: number;
  private readonly waitTimeoutMs: number;

  constructor(options: BulkheadOptions) {
    this.concurrency = options.concurrency;
    this.queueLimit = options.queueLimit ?? 0;
    this.waitTimeoutMs = options.waitTimeoutMs ?? 0;
  }

  get stats(): { active: number; waiting: number; limit: number } {
    return { active: this.active, waiting: this.waiting, limit: this.concurrency };
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.active--;
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.concurrency) {
      this.active++;
      return Promise.resolve();
    }
    if (this.waiting >= this.queueLimit) {
      // 有界队列：排满了就快速失败，而不是让请求无限堆积
      throw new BulkheadRejectedError();
    }
    this.waiting++;
    return new Promise<void>((resolve, reject) => {
      const timer =
        this.waitTimeoutMs > 0
          ? setTimeout(() => {
              this.waiting--;
              reject(new BulkheadRejectedError('bulkhead wait timed out'));
            }, this.waitTimeoutMs)
          : undefined;
      timer?.unref?.();

      const poll = setInterval(() => {
        if (this.active < this.concurrency) {
          clearInterval(poll);
          if (timer) clearTimeout(timer);
          this.waiting--;
          this.active++;
          resolve();
        }
      }, 1);
      poll.unref?.();
    });
  }

  private release(): void {
    // 释放动作由 acquire 的轮询感知，这里只保证计数正确
    if (this.active < 0) this.active = 0;
  }
}

/**
 * 指数退避 + 抖动。
 *
 * 为什么要抖动：所有调用方**同时**重试（"重试风暴"）会把刚恢复的服务再打挂。
 * 抖动把重试时间打散，是分布式系统里最便宜也最有效的保护。
 */
export interface BackoffOptions {
  baseMs?: number;
  factor?: number;
  maxMs?: number;
  /** 抖动比例 0~1，默认 0.5（±50%） */
  jitter?: number;
}

export function backoffDelay(attempt: number, options: BackoffOptions = {}): number {
  const base = options.baseMs ?? 50;
  const factor = options.factor ?? 2;
  const max = options.maxMs ?? 10_000;
  const jitter = options.jitter ?? 0.5;

  const exponential = Math.min(max, base * Math.pow(factor, Math.max(0, attempt)));
  if (jitter <= 0) return Math.round(exponential);
  // 在 [1-j, 1+j] 区间内抖动，但不允许小于 base 的一半
  const spread = exponential * jitter;
  return Math.round(Math.max(base * 0.5, exponential - spread + Math.random() * spread * 2));
}

/** 带退避的重试执行器 */
export async function retryWithBackoff<T>(
  fn: (attempt: number) => Promise<T>,
  options: { attempts: number; backoff?: BackoffOptions; shouldRetry?: (err: unknown) => boolean } = { attempts: 3 },
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < options.attempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;
      if (options.shouldRetry && !options.shouldRetry(err)) throw err;
      if (attempt < options.attempts - 1) {
        await sleep(backoffDelay(attempt, options.backoff));
      }
    }