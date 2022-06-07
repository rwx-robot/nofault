/**
 * @nofault/resilience —— 服务治理（v0.7.0）。
 *
 * 四件套各管一件事，互不替代：
 *   限流（RateLimiter）：别让进来的人太多
 *   熔断（CircuitBreaker）：下游已经坏了，别再打了
 *   舱壁（Bulkhead）：别让一个依赖吃光所有并发
 *   退避（backoffDelay）：重试要打散，否则重试风暴会二次伤害
 */
export { TokenBucket, KeyedRateLimiter } from './rate-limiter';
export type { RateLimiterOptions, RateLimitResult } from './rate-limiter';

export { CircuitBreaker, CircuitOpenError } from './circuit-breaker';
export type { CircuitState, CircuitBreakerOptions, CircuitStats } from './circuit-breaker';

export { Bulkhead, BulkheadRejectedError, backoffDelay, retryWithBackoff } from './bulkhead';
export type { BulkheadOptions, BackoffOptions } from './bulkhead';
