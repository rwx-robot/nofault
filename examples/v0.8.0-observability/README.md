# 示例：v0.8.0 observability

每个请求一个服务端 Span（含子调用）+ Prometheus 指标导出，
并提供 `/ops/spans` 与 `/ops/metrics` 两个端点直接看结果。

## 跑起来

```bash
pnpm example v0.8.0-observability
pnpm example v0.8.0-observability PORT=3380
```

## 试一试

```bash
curl -s -o /dev/null http://127.0.0.1:3000/api/work/30
curl -s -o /dev/null http://127.0.0.1:3000/api/boom

# traceId 回给客户端
curl -s -D - -o /dev/null http://127.0.0.1:3000/api/work/10 | grep -i x-trace-id

# Span（注意 simulated-work 与 GET /api/work/:id 的 traceId 相同）
curl -s http://127.0.0.1:3000/ops/spans
# → {"name":"simulated-work",...,"traceId":"d8df1de7..."}
#   {"name":"GET /api/work/:id",...,"traceId":"d8df1de7..."}

# 指标（route 已收敛成 /api/work/:id）
curl -s http://127.0.0.1:3000/ops/metrics | grep http_requests_total
# → http_requests_total{route="/api/work/:id",status="200"} 2
#   http_requests_total{route="/api/boom",status="500"} 1
```

## 文件说明

| 文件 | 说明 |
| --- | --- |
| `src/telemetry.setup.ts` | Tracer（内存导出器）与 MetricRegistry |
| `src/ops.controller.ts` | `/ops/spans`（先 flush 再看）与 `/ops/metrics` |
| `src/main.ts` | 挂 `observability()` 中间件，**路由标签收敛** |