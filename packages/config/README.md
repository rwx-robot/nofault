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