/**
 * 令牌桶限流。
 *
 * 为什么是令牌桶而不是固定窗口：固定窗口会在**窗口切换的瞬间**放过 2 倍流量
 * （窗口末尾打满 + 窗口开头打满），而令牌桶按速率匀速补充，没有这个尖峰。
 *
 * 桶容量 `capacity` 决定**允许的突发量**——它是"能攒多少"，不是"每秒多少"。
 * 这两者的区别，是限流配置里最常被搞混的地方。
 */
export interface RateLimiterOptions {
  /** 桶容量（允许的突发上限） */
  capacity: number;
  /** 每秒补充的令牌数 */
  refillPerSecond: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** 还剩下多少令牌（被拒时为 0） */
  remaining: number;
  /** 需要多久才能再拿到一个令牌（毫秒） */
  retryAfterMs: number;
}

export class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private readonly capacity: number;
  private readonly refillPerMs: number;

  constructor(options: RateLimiterOptions) {
    this.capacity = options.capacity;
    this.tokens = options.capacity;
    this.refillPerMs = options.refillPerSecond / 1000;
    this.lastRefill = Date.now();
  }

  tryRemove(count = 1): RateLimitResult {
    this.refill();
    if (this.tokens >= count) {
      this.tokens -= count;
      return { allowed: true, remaining: Math.floor(this.tokens), retryAfterMs: 0 };
    }
    const missing = count - this.tokens;
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.ceil(missing / this.refillPerMs),
    };
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    if (elapsed <= 0) return;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerMs);
    this.lastRefill = now;
  }
}

/**
 * 按 key 限流（例如按 IP、按用户、按租户）。
 *
 * 每个 key 一个桶。key 数量可能无界（IP 就是），
 * 所以这里做了**惰性清理**：扫描时顺手丢掉"已经满且很久没用"的桶，
 * 避免内存被无限增长。
 */
export class KeyedRateLimiter {
  private readonly buckets = new Map<string, TokenBucket>();
  private lastSweep = Date.now();

  constructor(
    private readonly options: RateLimiterOptions,
    /** 多久没被访问的桶会被清理（毫秒） */
    private readonly idleTtlMs = 10 * 60 * 1000,
  ) {}

  check(key: string, count = 1): RateLimitResult {
    let bucket = this.buckets.get(key);
    if (!bucket) {