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
