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