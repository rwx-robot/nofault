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