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