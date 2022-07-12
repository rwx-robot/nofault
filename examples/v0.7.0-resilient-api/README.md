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
