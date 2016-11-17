# nofault v0.9.0 运行说明

其余与 v0.1.0 相同，见 [`docs/v0.1.0/RUNNING.md`](../v0.1.0/RUNNING.md)。

## 跑测试

```bash
pnpm test                                    # 全部
pnpm vitest run packages/micro               # Snowflake / 锁 / cron / 事件总线 / 生命周期
pnpm vitest run tests/integration/v0.9.0     # 装配后的服务：并发只结算一次、ID 带机器号
```

## 跑示例

```bash
pnpm example v0.9.0-microservice-kit
pnpm example v0.9.0-microservice-kit PORT=3390
```

### 试一试

```bash
# 建单（ID 是 Snowflake，63 位，能反解出机器号）