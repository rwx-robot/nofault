/**
 * 熔断器。
 *
 * 状态机：`CLOSED →（连续失败达到阈值）→ OPEN →（冷却结束）→ HALF_OPEN →（探针成功）→ CLOSED`
 *
 * 两个容易被写错的地方：
 * 1. **OPEN 期间必须快速失败**，绝不能再打下游。
 *    一边"熔断"一边继续发请求，等于没熔断，还会让下游更难恢复
 * 2. **HALF_OPEN 只允许有限个探针**。
 *    不限流的话，冷却结束的瞬间会有全部流量一起涌向刚恢复的下游，直接把它再打挂
 */
export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerOptions {
  /** 连续失败多少次后熔断 */
  failureThreshold: number;
  /** 熔断后多久进入半开（毫秒） */
  resetTimeoutMs: number;
  /** 半开状态允许同时放行的探针数 */
  halfOpenMaxCalls?: number;
  /** 判定"失败"的标准；默认任何抛错都算 */
  isFailure?: (err: unknown) => boolean;
  now?: () => number;
}

export class CircuitOpenError extends Error {
  constructor(
    public readonly retryAfterMs: number,
    message = 'circuit is open',
  ) {
    super(message);
    this.name = 'CircuitOpenError';
  }
}

export interface CircuitStats {
  state: CircuitState;
  failures: number;
  successes: number;
  rejected: number;
}

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failures = 0;
  private successes = 0;
  private rejected = 0;
  private openedAt = 0;
  private halfOpenInFlight = 0;
  private readonly halfOpenMaxCalls: number;
  private readonly now: () => number;

  constructor(private readonly options: CircuitBreakerOptions) {
    this.halfOpenMaxCalls = options.halfOpenMaxCalls ?? 1;
    this.now = options.now ?? Date.now;
  }

  get currentState(): CircuitState {
    // 冷却已过就从 open 转 half-open（惰性判断，不需要定时器）
    if (this.state === 'open' && this.now() - this.openedAt >= this.options.resetTimeoutMs) {
      this.state = 'half-open';
      this.halfOpenInFlight = 0;
    }
    return this.state;
  }

  stats(): CircuitStats {
    return {
      state: this.currentState,
      failures: this.failures,
      successes: this.successes,
      rejected: this.rejected,
    };
  }

  /** 执行；熔断时抛 CircuitOpenError，不打下游 */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    const state = this.currentState;

    if (state === 'open') {
      this.rejected++;
      throw new CircuitOpenError(this.options.resetTimeoutMs - (this.now() - this.openedAt));
    }

    if (state === 'half-open') {
      if (this.halfOpenInFlight >= this.halfOpenMaxCalls) {
        this.rejected++;
        throw new CircuitOpenError(0);
      }
      this.halfOpenInFlight++;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      if (this.options.isFailure?.(err) === false) {
        this.onSuccess();
        throw err;
      }
      this.onFailure();
      throw err;
    } finally {
      if (state === 'half-open') this.halfOpenInFlight = Math.max(0, this.halfOpenInFlight - 1);
    }
  }

  private onSuccess(): void {
    this.successes++;
    this.failures = 0;
    // 半开时只要有一个探针成功就闭合——说明下游确实恢复了
    if (this.state === 'half-open' || this.state === 'open') {
      this.state = 'closed';
      this.halfOpenInFlight = 0;