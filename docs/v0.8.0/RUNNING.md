# nofault v0.8.0 运行说明

其余与 v0.1.0 相同，见 [`docs/v0.1.0/RUNNING.md`](../v0.1.0/RUNNING.md)。

## 跑测试

```bash
pnpm test                                    # 全部（324 项）
pnpm vitest run packages/telemetry           # Span / 采样 / 三种指标 / Prometheus 导出
pnpm vitest run tests/integration/v0.8.0     # 父子 Span 同 trace、错误记 500、桶累积
```

## 跑示例

```bash
pnpm example v0.8.0-observability
pnpm example v0.8.0-observability PORT=3380
```

### 试一试

```bash
# 打几个请求
curl -s -o /dev/null http://127.0.0.1:3000/api/work/30
curl -s -o /dev/null http://127.0.0.1:3000/api/boom

# traceId 回给客户端（用户报错时可据此对齐日志）
curl -s -D - -o /dev/null http://127.0.0.1:3000/api/work/10 | grep -i x-trace-id

# 看上报上来的 Span（子 Span 与父 Span 共享 traceId）
curl -s http://127.0.0.1:3000/ops/spans

# Prometheus 指标
curl -s http://127.0.0.1:3000/ops/metrics | grep http_requests_total
# → http_requests_total{route="/api/work/:id",status="200"} 2
#   http_requests_total{route="/api/boom",status="500"} 1
```

注意 `route` 已经是**收敛后**的（`/api/work/:id` 而不是 `/api/work/10`）——
不收敛的话每个 id 都是一个独立序列，上线后必然基数爆炸。

## 跑基准测试

```bash
pnpm bench v0.8.0 --iterations=20000 --report
```

## 目录导航

```
packages/telemetry/src/tracer.ts      Span / 采样 / 导出 / 活动 Span 传递
packages/telemetry/src/metrics.ts     Counter / Gauge / Histogram + Prometheus 文本
packages/telemetry/src/middleware.ts  每请求一个服务端 Span + 三个指标
examples/v0.8.0-observability/        可运行示例（含 /ops/spans 与 /ops/metrics）
tests/integration/v0.8.0/             端到端
```
