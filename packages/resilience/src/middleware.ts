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
function clientKey(ctx: { request: { header(name: string): string | undefined; ip?: string } }): string {
  return ctx.request.header('x-forwarded-for') ?? ctx.request.ip ?? 'anonymous';
}

export interface HttpContext {
  request: { header(name: string): string | undefined; ip?: string };
  response: {
    status(code: number): { header(name: string, value: string): { json(body: unknown): unknown; header(name: string, value: string): unknown } };
    header(name: string, value: string): unknown;
    json(body: unknown): unknown;
  };
}

export interface RateLimitMiddlewareOptions extends RateLimiterOptions {
  keyOf?: (ctx: HttpContext) => string;
}

/** 每 IP 限流：超限返回 429，并带上 Retry-After */
export function rateLimit(options: RateLimitMiddlewareOptions) {
  const limiter = new KeyedRateLimiter({ capacity: options.capacity, refillPerSecond: options.refillPerSecond });
  const keyOf = options.keyOf ?? clientKey;

  return async (ctx: HttpContext, next: () => Promise<void>): Promise<void> => {
    const result = limiter.check(keyOf(ctx));
    if (!result.allowed) {
      // 429 必须带 Retry-After：否则客户端只能瞎重试
      ctx.response.status(429).header('retry-after', String(Math.ceil(result.retryAfterMs / 1000)));
      ctx.response.json({ code: 429, data: null, message: 'Too Many Requests' });
      return;
    }
    ctx.response.header('x-ratelimit-remaining', String(result.remaining));
    return next();
  };
}

/** 熔断：下游持续失败时快速失败（503），不再打它 */
export function circuitBreaker(options: CircuitBreakerOptions) {
  const breaker = new CircuitBreaker(options);
  return {
    breaker,
    use: async (_ctx: unknown, next: () => Promise<void>): Promise<void> => {
      try {
        await breaker.run(async () => {
          await next();
        });
      } catch (err) {
        if (err instanceof CircuitOpenError) {
          throw new HttpException(503, 'Service Unavailable (circuit open)', 503);
        }
        throw err;
      }
    },
  };
}

/** 舱壁：限制同时处理的请求数，超出返回 503 */
export function bulkhead(options: BulkheadOptions) {
  const guard = new Bulkhead(options);
  return {
    guard,
    use: async (_ctx: unknown, next: () => Promise<void>): Promise<void> => {
      try {
        await guard.run(async () => {
          await next();
        });
      } catch (err) {
        if (err instanceof BulkheadRejectedError) {
          throw new HttpException(503, 'Service Unavailable (overloaded)', 503);
        }