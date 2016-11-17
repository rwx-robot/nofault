# Changelog — v0.8.0（2023 · 可观测性）

> Metrics 说"出问题了"，Trace 说"是哪一步"，日志说"当时发生了什么"。

## 新增包 `@nofault/telemetry`

- **Trace**：`Tracer` / `Span`（属性、状态、时长）、`InMemoryExporter`、
  采样器 `alwaysSample` / `neverSample` / `ratioSampler`
  - 父子关系靠**请求上下文里的活动 Span** 建立，结束时自动还原
  - **不采样时 `startSpan()` 返回 `null`**，不为丢弃的链路付一分钱
  - 批量缓冲 + `flush()`；只有结束的 Span 才导出
- **Metrics**：`MetricRegistry` + `Counter` / `Gauge` / `Histogram`
  - Prometheus 文本导出（桶为累积计数，与官方语义一致）
  - `Histogram.percentile()` 返回**所在桶的上界**（与 `histogram_quantile` 同思路）
- **HTTP 接入** `observability()`：每请求一个服务端 Span + `x-trace-id` 响应头 +
  `http_requests_total` / `http_request_duration_ms` / `http_request_errors_total`

## 关键设计决策

| 决策 | 理由 |
| --- | --- |
| 采样在创建时决定 | 先建再丢 = 为丢弃的链路全额付费（5.84µs/条） |
| 不采样返回 `null` | 保证不采样时**真的**零开销（0.27µs） |
| 活动 Span 放请求上下文 | 模块级变量在并发下必然串号 |
| Span 结束时还原上一个 | Span 是嵌套的，不还原就挂错父 |
| Histogram 只存桶计数 | 存全部样本在几千 QPS 下必然 OOM |
| 错误状态码在 `catch` 里记 | `finally` 里框架还没映射状态码，会读到 200 |
| 路由标签必须收敛 | `/users/1` 与 `/users/2` 是两个序列 → 基数爆炸 |
| 默认导出器是内存的 | 可观测性不该要求先装后端才跑得起来 |

## 性能：中途发现并修掉的一个问题

初版 Span 开销 **13.93µs**，比指标贵一个数量级。定位到瓶颈全在 ID 生成：

| 步骤 | 开销 |
| --- | --- |
| `crypto.getRandomValues(16)` | 2.93 µs |
| `new Uint8Array(16)` + 填充 | 4.18 µs |
| `toString(16).padStart(2,'0')` × 32 | 5.84 µs |

改法：十六进制**查表**（256 项）+ **一次随机填充同时产出 traceId 与 spanId**（24 字节）。
结果 **5.84µs（2.4×）**。

| 操作 | 开销 | 吞吐 |
| --- | --- | --- |
| 起一个 Span 并结束 | 5.84 µs | 171,362 ops/sec |
| 不采样 | 0.27 µs | 3,688,153 ops/sec |
| Counter 自增 | 1.06 µs | 940,453 ops/sec |
| Histogram 观测 | 0.85 µs | 1,173,072 ops/sec |
| Prometheus 序列化（500 序列） | 880 µs | 1,136 ops/sec |

一个请求 3 个 Span + 10 次指标 ≈ 28µs，占 v0.2.0 测得的 HTTP 全链路（500µs）的 **5.6%**。

## 测试

- 单元测试 +14：父子 Span、采样、属性与错误、批量导出、三种指标、桶累积、分位数
- 集成测试 +3：父子 Span 共享 traceId、失败记 500（不是 200）、Prometheus 文本可解析
- 合计 **324 项全通过**；`tsc --noEmit` 与 `eslint` 全清

## 已知限制

- 只有内存导出器（无 OTLP / Jaeger）
- 日志与 Trace 未自动关联（traceId 要自己写进日志）
- 指标无持久化，进程重启清零
- 无告警规则
