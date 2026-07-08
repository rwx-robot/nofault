# @nofault/resilience

服务治理四件套：令牌桶限流、三态熔断器、舱壁隔离、指数退避。

**引入版本**：v0.7.0

## 为什么这么设计

- **令牌桶而非固定窗口**：固定窗口在切换瞬间放过 2 倍流量
- 熔断打开后**绝不再打下游**；半开只放行有限探针（否则冷却结束瞬间会再打挂下游）
- 队列必须**有界**：无界队列只是把"立即失败"延后，还吃内存
- 退避必须**抖动**：所有调用方同时重试 = 重试风暴
- 治理判定全部 <1µs（不到 HTTP 链路的 0.2%）→ 没有理由因为性能而不加保护

## 最快上手

```ts
import { CircuitBreaker, TokenBucket, Bulkhead, retryWithBackoff } from '@nofault/resilience';

const breaker = new CircuitBreaker({ failureThreshold: 5, resetTimeoutMs: 3000 });
await breaker.run(() => callDownstream());
```