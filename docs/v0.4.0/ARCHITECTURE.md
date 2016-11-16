# v0.4.0 架构：代码生成 v1

> 图见 [`ARCHITECTURE.svg`](./ARCHITECTURE.svg)

## 一句话

**契约是唯一事实来源，代码是它的投影。**
改契约、跑生成器，controller / service / module / DTO 自动跟着变；手写实现则通过"生成标记"机制被永久保护。

## 流水线

```
契约文本 ──parser──> ApiSpec ──validate──> generate() ──writeFiles──> 磁盘
```

五个环节各自独立，中间靠 `ApiSpec` 这一个数据结构衔接。
好处很直接：**将来加 OpenAPI / protobuf 输入，只是多写一个 parser**，生成器一行不用改。

## 一、为什么有两种契约格式

| | `.api.ts`（主推） | `.api`（兼容） |
|---|---|---|
| 类型检查 | 由 TS 编译器保证 | 无 |
| IDE 支持 | 跳转、补全、重构全都有 | 无 |
| 学习成本 | 会 TS 就会写 | 要学新语法 |
| 迁移成本 | — | 存量 `.api` 契约可直接接入 |

两者都**不执行用户代码**：`.api.ts` 是当文本扫描的，不是 `import` 进来跑装饰器。
所以解析一个来路不明的契约文件是安全的。

## 二、解析器：为什么不用 ANTLR

- 契约语法很小（约 30 条产生式），手写扫描器 + 递归下降约 500 行
- 引入 ANTLR 意味着生成步骤、体积和又一套错误模型
- **错误定位**是我们最看重的能力：每个 token 带行列号，
  报"`service user > route login`: unknown request type"而不是"解析失败"。
  自动生成器的报错质量很难做到这一点

实测解析 312 行契约 0.43ms（2,304 ops/sec），不是瓶颈。

## 三、ApiSpec：枢纽

```ts
interface ApiSpec { name; types: TypeSpec[]; services: ServiceSpec[] }
interface ServiceSpec { name; group; prefix?; jwt?; middleware[]; routes: RouteSpec[] }
interface RouteSpec { handler; method; path; requestType?; responseType?; middleware? }
interface FieldSpec  { name; key; type; source; optional; rules[] }
```

几个刻意的设计：

- **`key` 与 `name` 分开**：`key` 是传输键（json tag），`name` 是源字段名
- **`source` 决定绑定方式**：body / query / path / header / form
- **`rules` 是字符串数组**（`['isString','minLength:3']`），让校验规则保持开放

## 四、生成器的三条硬规则

1. **属性名取传输键**（`key`），不取源字段名。
   Go 的 `Name string \`json:"name"\`` 会生成 `name!: string`。
   照抄字段名的话，代码能编译、服务能启动，但**永远绑定不上数据**——这是本次最难查的一类 bug。

2. **GET/HEAD/DELETE/OPTIONS 一律走 Query**。
   GET 带 body 在多数网关和 CDN 上会被直接丢弃。

3. **带 `@Path` 字段的请求类型不做整体校验**。
   它的字段是逐个 `@Param()` 接的，没有完整的"请求对象"，
   整体校验会把每个请求都判成缺字段。

## 五、写盘策略：生成器最重要的一个决定

默认策略 `generated`：**只覆盖首行带生成标记的文件**。

- 生成器自己写的 → 有标记 → 可以被覆盖（契约变了就该变）
- 被人工接管的文件（删掉标记）→ 跳过
- 内容没变 → 不写盘（幂等）
