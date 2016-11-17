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

```bash
curl -s "http://127.0.0.1:3000/faulty/break?mode=down"   # 人为打挂下游
for i in 1 2 3 4; do curl -s -o /dev/null -w "%{http_code} " http://127.0.0.1:3000/faulty/call; done
curl -s http://127.0.0.1:3000/faulty/state               # -> open，且 dependencyCalls 不再增长

curl -s "http://127.0.0.1:3000/faulty/break?mode=ok"     # 恢复
sleep 3.2
curl -s http://127.0.0.1:3000/faulty/call                # 半开探针成功 -> 200
curl -s http://127.0.0.1:3000/faulty/state               # -> closed
```

## 跑基准测试

```bash
pnpm bench v0.7.0 --iterations=50000 --report
```

## 目录导航

```
packages/resilience/src/rate-limiter.ts      令牌桶 + 按 key 限流
packages/resilience/src/circuit-breaker.ts  三态熔断
packages/resilience/src/bulkhead.ts          并发隔离 + 指数退避
packages/resilience/src/middleware.ts        接进 HTTP 链（含顺序约定）
examples/v0.7.0-resilient-api/               可切换故障的示例
tests/integration/v0.7.0/                    端到端
```
