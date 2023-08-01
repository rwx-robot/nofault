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