# @nofault/codegen

由契约产出代码与文档：校验、生成、写盘策略、OpenAPI。

**引入版本**：v0.10.0

## 为什么这么设计

- 生成器**不碰 IO**：`generate()` 是纯函数，写盘交给 `writeFiles()`（可测、可 dry-run）
- 校验一次报完所有问题，而不是遇到第一个就停
- **只覆盖自己也认领过的文件**（首行生成标记），删掉标记 = 手工接管
- DTO 属性名取**传输键**而非源字段名：照抄源字段名会产出"能编译、能启动、永远绑不上数据"的代码

## 最快上手

```ts
import { generate, writeFiles, openApiDocument } from '@nofault/codegen';

const { files } = generate(spec, { withOrm: true });
await writeFiles(files, { outDir: 'src', policy: 'generated' });

const doc = openApiDocument(spec, { title: 'User API' });