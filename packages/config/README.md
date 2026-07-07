# @nofault/config

配置加载与热更新。

**引入版本**：v0.1.0

## 为什么这么设计

- 从文件 + 环境变量加载，环境变量优先（部署时改配置不该改动代码）
- **热更新**：文件变更后通知订阅者，不需要重启进程
- 取值失败要有明确报错——配置拼错是最常见的一类"启动即崩"

## 最快上手

```ts
import { loadConfig } from '@nofault/config';

const config = await loadConfig({ file: 'app.yaml' });
config.onChange((next) => console.log('reloaded', next));
```

## 注意

敏感值走环境变量，不要写进配置文件。

## 相关文档

- 架构说明 → [`docs/v0.1.0/ARCHITECTURE.md`](../../docs/v0.1.0/ARCHITECTURE.md)
- 变更记录 → [`docs/v0.1.0/CHANGELOG.md`](../../docs/v0.1.0/CHANGELOG.md)
