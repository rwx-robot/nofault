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
