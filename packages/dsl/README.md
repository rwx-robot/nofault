# @nofault/dsl

契约中间表示：`ApiSpec` 与契约装饰器。

**引入版本**：v0.4.0

## 为什么这么设计

- 两种输入（`.api` 与 `.api.ts`）**共用一个中间表示**，生成器才不用写两遍
- 契约装饰器只写元数据、不执行——解析器把契约当文本扫，不 import 用户代码
- 命名工具（pascal / camel / kebab / snake / singularize）集中一处

## 最快上手

```ts
import { ApiSpec, FieldSource } from '@nofault/dsl';

const spec: ApiSpec = {
  name: 'demo',
  types: [{ name: 'User', fields: [{ name: 'id', key: 'id', type: 'number', source: FieldSource.BODY, optional: false, rules: [] }] }],
  services: [],
};
```

## 注意

字段名（`Name`）与传输键（`name`）是两回事：**传输格式才是契约**。

## 相关文档

- 架构说明 → [`docs/v0.4.0/ARCHITECTURE.md`](../../docs/v0.4.0/ARCHITECTURE.md)
- 变更记录 → [`docs/v0.4.0/CHANGELOG.md`](../../docs/v0.4.0/CHANGELOG.md)
