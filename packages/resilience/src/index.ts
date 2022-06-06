/**
 * @nofault/resilience —— 服务治理（v0.7.0）。
 *
 * 四件套各管一件事，互不替代：
 *   限流（RateLimiter）：别让进来的人太多
 *   熔断（CircuitBreaker）：下游已经坏了，别再打了