# 示例：v0.9.0 microservice-kit

用 `Microservice.bootstrap()` 把前面九个版本的能力**一次装起来**，
并演示 v0.9.0 新增的 Snowflake ID、分布式锁、定时任务、事件总线。

## 跑起来

```bash
pnpm example v0.9.0-microservice-kit
pnpm example v0.9.0-microservice-kit PORT=3390
```

## 试一试

```bash
CREATE=$(curl -s -X POST http://127.0.0.1:3000/orders \
  -H 'content-type: application/json' -d '{"amount":120}')
ID=$(echo "$CREATE" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['id'])")

curl -s http://127.0.0.1:3000/orders/$ID          # 第二次走缓存

# 并发结算同一笔订单三次：只允许一次成功
for i in 1 2 3; do curl -s -o /dev/null -w "%{http_code} " \
  -X POST http://127.0.0.1:3000/orders/$ID/settle; done
# → 200 409 409

curl -s -X POST http://127.0.0.1:3000/orders \
  -H 'content-type: application/json' -d '{"amount":-1}'   # 400
```

启动日志：

```
[order-service] migrations applied: 001-create-orders
[order-service] http listening on 3390
[order-service] warmed up, generating ids like 887740540580401152
[order-service] ready in 38ms
```

## 文件说明

| 文件 | 说明 |
| --- | --- |
| `src/orders.ts` | 业务：Snowflake ID、缓存、事件发布、**分布式锁保护结算** |
| `src/main.ts` | 装配顺序：迁移 → 事件订阅 → HTTP → 定时任务 → 置就绪 |

## 这个示例证明了什么

1. **分布式 ID** —— 订单号是 63 位 Snowflake，能反解出机器号，可直接放进 JSON
2. **锁真的互斥** —— 并发结算三次只有一次 200，其余 409（不是重复扣款）
3. **事件解耦** —— 审计订阅者不在 `OrderService` 里，加消费者不用改业务逻辑
4. **装配顺序正确** —— 迁移在监听之前，就绪标记最后打开
5. **参数错误是 400 不是 500** —— 校验在最外层，不会污染熔断/重试

## 测试

```bash
pnpm vitest run tests/integration/v0.9.0
```
