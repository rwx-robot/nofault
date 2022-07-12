# 示例：v0.7.0 resilient-api

演示**限流 / 熔断 / 舱壁 / 退避重试**接在真实 HTTP 链路上，
并且提供了一个能**人为制造故障**的下游，让熔断可以被主动验证。

## 跑起来

```bash
pnpm example v0.7.0-resilient-api
pnpm example v0.7.0-resilient-api PORT=3370
```

## 试一试
