# @nofault/telemetry

可观测性：Span（采样/批量导出）与指标（Prometheus 文本）。

**引入版本**：v0.8.0

## 为什么这么设计

- **采样在创建时决定**：`startSpan()` 不采样直接返回 `null`，不为丢弃的链路付一分钱（0.27µs vs 5.84µs）
- 父子 Span 靠**请求上下文里的活动 Span** 建立，结束时自动还原
- Histogram 只存桶计数（存全部样本在几千 QPS 下必然 OOM），分位数给桶上界
- 错误状态码要在 `catch` 里记——`finally` 里框架还没映射状态码，会读到 200

## 最快上手

```ts
import { Tracer, MetricRegistry, observability } from '@nofault/telemetry';

const tracer = new Tracer(exporter, ratioSampler(0.1));
await tracer.trace('checkout', async (span) => {
  span?.setAttributes({ orderId });
  return doWork();
});