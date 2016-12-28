# @nofault/parser

契约解析器：手写扫描器 + 递归下降，支持 `.api` 与 `.api.ts`。

**引入版本**：v0.4.0

## 为什么这么设计

- **不引 ANTLR**：语法很小，自己写才能给出"哪一行哪一列"的报错
- 两种格式产出同一个 `ApiSpec`
- 错误带行列号，并指出是哪个服务 / 哪条路由 / 哪个字段
- **不执行用户代码**——只当文本扫，避免副作用与安全风险

## 最快上手

```ts
import { parseContractFile, parseApiSource } from '@nofault/parser';

const spec = await parseContractFile('api/user.api.ts');
// 或
const spec2 = parseApiSource('get /ping returns (Ok)', 'inline.api');
```

## 注意

`returns` 是关键字，不是路径片段——漏判会让 `/ping returns (X)` 变成路径 `/pingreturns`。

## 相关文档

- 架构说明 → [`docs/v0.4.0/ARCHITECTURE.md`](../../docs/v0.4.0/ARCHITECTURE.md)
- 变更记录 → [`docs/v0.4.0/CHANGELOG.md`](../../docs/v0.4.0/CHANGELOG.md)
