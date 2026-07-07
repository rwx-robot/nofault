# @nofault/cache

缓存抽象与内存实现：TTL、LRU、抖动、single-flight。

**引入版本**：v0.5.0

## 为什么这么设计

- `getOrSet()` 让**缓存击穿在源头消失**：并发同 key 只回源一次
- TTL 必须带**抖动**，否则大批 key 同时过期 = 雪崩
- 不固化 `undefined`——固化"查不到"会让数据写入后永远读不到
- LRU 淘汰 + `max` 上限，防止无界增长

## 最快上手

```ts
import { MemoryCache, NullCache } from '@nofault/cache';

const cache = new MemoryCache({ max: 10_000 });
const user = await cache.getOrSet(`user:${id}`, () => db.find(id), { ttl: 60_000 });
```