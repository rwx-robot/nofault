# nofault v0.7.0 运行说明

其余与 v0.1.0 相同，见 [`docs/v0.1.0/RUNNING.md`](../v0.1.0/RUNNING.md)。

## 跑测试

```bash
pnpm test                                        # 全部
pnpm vitest run packages/resilience              # 令牌桶 / 熔断 / 舱壁 / 退避
pnpm vitest run tests/integration/v0.7.0         # 治理能力接在 HTTP 链路上
```

## 跑示例

```bash
pnpm example v0.7.0-resilient-api
pnpm example v0.7.0-resilient-api PORT=3370
```

### 限流（20 桶 / 5 每秒）

```bash
for i in $(seq 1 30); do curl -s -o /dev/null -w "%{http_code} " http://127.0.0.1:3000/faulty/state; done
# 前 20 个 200，之后 429
curl -s -D - -o /dev/null http://127.0.0.1:3000/faulty/state | grep -i retry-after
```

### 熔断（阈值 3，冷却 3s）
