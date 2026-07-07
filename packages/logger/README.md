# @nofault/logger

分级结构化日志。

**引入版本**：v0.1.0

## 为什么这么设计

- 日志是**给人看还是给机器看**决定了格式：这里默认结构化（JSON），便于采集
- 分级：debug / info / warn / error
- 子日志器带固定字段（如 `module`），省得每行都写一遍

## 最快上手

```ts
import { createLogger } from '@nofault/logger';

const log = createLogger({ level: 'info' });
log.info('user created', { id: 'u1' });
const scoped = log.child({ module: 'orders' });
scoped.warn('slow query', { ms: 812 });
```