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
CREATE=$(curl -s -X POST http://127.0.0.1:3000/orders \
  -H 'content-type: application/json' -d '{"amount":120}')
ID=$(echo "$CREATE" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['id'])")

# 读（第二次走缓存）
curl -s http://127.0.0.1:3000/orders/$ID

# 结算：同一个订单并发三次，只有一次成功
for i in 1 2 3; do curl -s -o /dev/null -w "%{http_code} " \
  -X POST http://127.0.0.1:3000/orders/$ID/settle; done
# → 200 409 409

# 参数错误在最外层就挡住（400，不是 500）
curl -s -X POST http://127.0.0.1:3000/orders \
  -H 'content-type: application/json' -d '{"amount":-1}'
```

启动日志能看出装配顺序：

```
[order-service] migrations applied: 001-create-orders
[order-service] http listening on 3390
[order-service] warmed up, generating ids like 887740540580401152
[order-service] ready in 38ms
```

## 跑基准测试

```bash
pnpm bench v0.9.0 --iterations=20000 --report
```

## 目录导航

```
packages/micro/src/id.ts          Snowflake（时钟回拨 / 序列号耗尽）
packages/micro/src/lock.ts        分布式锁（token 校验 / watchdog）
packages/micro/src/scheduler.ts   cron 解析 + 三种周期
packages/micro/src/event-bus.ts   发布订阅（错误隔离 / 退订）
packages/micro/src/microservice.ts 一键装配与生命周期顺序
examples/v0.9.0-microservice-kit/ 九个版本能力装在一起的示例
tests/integration/v0.9.0/         端到端
```
