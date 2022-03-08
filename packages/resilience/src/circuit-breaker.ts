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