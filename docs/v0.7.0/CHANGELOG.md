# Changelog — v0.7.0（2022 · 服务治理）

> 限流挡流量、熔断别再打坏掉的下游、舱壁限制并发、退避把重试打散。

## 新增包 `@nofault/resilience`

- **限流**：`TokenBucket`（匀速补充，无窗口尖峰）+ `KeyedRateLimiter`（按 IP/用户/租户）
- **熔断**：`CircuitBreaker` 三态机，`halfOpenMaxCalls` 限制探针数，`isFailure` 可排除业务错误
- **舱壁**：`Bulkhead` 并发隔离 + **有界队列**（排满即快速失败）
- **退避**：`backoffDelay()` 指数退避 + 抖动（默认 ±50%）、`retryWithBackoff()`
- **中间件**：`rateLimit()` / `circuitBreaker()` / `bulkhead()`，含 429 的 `Retry-After`

## 关键设计决策

| 决策 | 理由 |
| --- | --- |
| 令牌桶而非固定窗口 | 固定窗口在切换瞬间放过 2 倍流量 |
| OPEN 期不再打下游 | 一边熔断一边发请求等于没熔断 |
| 半开只放行有限探针 | 否则冷却结束的瞬间会再打挂下游 |
| 队列必须有界 | 无界队列只是把"立即失败"延后，还吃内存 |
| 退避必须抖动 | 同时重试 = 重试风暴 |
| 中间件顺序 限流→舱壁→熔断 | 反了会让被限流的请求也占着并发配额 |
| `CircuitOpenError` 要显式翻译成 503 | 否则框架一律按 500 处理 |

## 测试