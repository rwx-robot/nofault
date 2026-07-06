# @nofault/micro

微服务全家桶：分布式 ID、分布式锁、cron 调度、事件总线、一键装配。

**引入版本**：v0.9.0

## 为什么这么设计

- Snowflake 返回**字符串**：63 位超过 `MAX_SAFE_INTEGER`，转 number 会静默丢精度
- 序列号耗尽要**等到下一毫秒**，回绕会产生重复 ID
- 释放锁**必须校验 token**：不校验会释放别人的锁，等于没加锁
- 调度器默认**不补跑、不允许重叠**（补跑会在重启瞬间涌入几十个任务）
- cron 的日与周是**或**关系（Unix 语义），做成"与"则 `0 0 1 * 0` 永远不触发
- 装配顺序即正确性：迁移 → 订阅事件 → 监听 → 定时任务 → **最后**置就绪

## 最快上手

```ts
import { Snowflake, DistributedLock, Scheduler, EventBus, Microservice } from '@nofault/micro';

const ids = new Snowflake({ workerId: 1 });
const id = ids.nextIdString();

await lock.run(async () => { /* 同一时刻只有一个实例在做 */ });
```

## 注意

停机是启动的**逆序**：先停定时任务、再关监听、最后释放数据源。

## 相关文档

- 架构说明 → [`docs/v0.9.0/ARCHITECTURE.md`](../../docs/v0.9.0/ARCHITECTURE.md)
- 变更记录 → [`docs/v0.9.0/CHANGELOG.md`](../../docs/v0.9.0/CHANGELOG.md)
