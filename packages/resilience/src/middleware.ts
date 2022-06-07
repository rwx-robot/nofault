/**
 * 把治理能力接进 HTTP 请求链。
 *
 * 三者的**顺序**有讲究：限流在最外层（挡住多余流量），
 * 舱壁其次（限制并发），熔断在内层（保护具体依赖）。
 * 顺序反了就会"被限流的请求也占着舱壁配额"，白白浪费。
 */
import { KeyedRateLimiter, type RateLimiterOptions } from './rate-limiter';
import { CircuitBreaker, CircuitOpenError, type CircuitBreakerOptions } from './circuit-breaker';
import { Bulkhead, BulkheadRejectedError, type BulkheadOptions } from './bulkhead';
import { HttpException } from '@nofault/rest';

/** 取限流 key 的默认策略：优先用真实 IP，退回 'anonymous' */