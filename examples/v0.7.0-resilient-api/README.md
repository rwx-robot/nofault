# 示例：v0.7.0 resilient-api

演示**限流 / 熔断 / 舱壁 / 退避重试**接在真实 HTTP 链路上，
并且提供了一个能**人为制造故障**的下游，让熔断可以被主动验证。

## 跑起来

```bash
pnpm example v0.7.0-resilient-api
pnpm example v0.7.0-resilient-api PORT=3370
```

## 试一试

```bash
# 限流：20 桶 / 5 每秒
for i in $(seq 1 30); do curl -s -o /dev/null -w "%{http_code} " http://127.0.0.1:3000/faulty/state; done
#  → 200×20 然后 429
curl -s -D - -o /dev/null http://127.0.0.1:3000/faulty/state | grep -i retry-after

# 熔断：打挂下游 → 连续失败 3 次 → 熔断
curl -s "http://127.0.0.1:3000/faulty/break?mode=down"
for i in 1 2 3 4; do curl -s -o /dev/null -w "%{http_code} " http://127.0.0.1:3000/faulty/call; done
curl -s http://127.0.0.1:3000/faulty/state      # open，dependencyCalls 停止增长

# 恢复 → 冷却 3s → 半开探针
curl -s "http://127.0.0.1:3000/faulty/break?mode=ok"
sleep 3.2 && curl -s http://127.0.0.1:3000/faulty/call
curl -s http://127.0.0.1:3000/faulty/state      # closed
```

## 文件说明

| 文件 | 说明 |
| --- | --- |
| `src/dependency.ts` | 会"按指令生病"的下游（可切换 down/ok） |
| `src/faulty.controller.ts` | 熔断 + 退避重试；把 `CircuitOpenError` 翻译成 503 |
| `src/main.ts` | 中间件顺序：限流 → 舱壁 |

## 这个示例证明了什么