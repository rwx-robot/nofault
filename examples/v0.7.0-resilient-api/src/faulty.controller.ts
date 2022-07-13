/**
 * 演示用的三个端点：
 * - `/faulty/call`：走熔断 + 退避重试
 * - `/faulty/break?mode=down|ok`：切换下游健康状态
 * - `/faulty/state`：看熔断器当前状态
 *
 * 关键点：**熔断包在重试外层**。
 * 如果反过来（重试包熔断），一次用户请求会在熔断打开时还重试 3 次，
 * 既浪费配额又拖长响应时间。
 */
import { Controller, Get, Query } from '@nofault/rest';
import { HttpException } from '@nofault/rest';
import { CircuitBreaker, CircuitOpenError, retryWithBackoff } from '@nofault/resilience';
import { dependency } from './dependency';

const breaker = new CircuitBreaker({
  failureThreshold: 3,
  resetTimeoutMs: 3000,
  halfOpenMaxCalls: 1,
});

@Controller('/faulty')
export class FaultyController {
  @Get('/call')
  async call(): Promise<{ ok: boolean; calls: number; attempts: number }> {
    let attempts = 0;
    try {
      // 外层熔断（下游坏了就不再打），内层退避重试（偶发抖动才重试）
      const result = await breaker.run(() =>
        retryWithBackoff(
          async () => {
            attempts++;
            return dependency.call();
          },
          { attempts: 2, backoff: { baseMs: 10, maxMs: 50 } },
        ),
      );
      return { ...result, attempts };
    } catch (err) {
      // 熔断打开是一种**特定**的失败：必须翻译成 503，
      // 否则框架会把不认识的错误一律按 500 处理，客户端分不清"我错了"和"下游坏了"
      if (err instanceof CircuitOpenError) {
        throw new HttpException(503, 'dependency circuit is open', 503);
      }
      if (err instanceof Error && err.message.includes('down')) {