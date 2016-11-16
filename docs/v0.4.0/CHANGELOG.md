# Changelog — v0.4.0（2019 · 代码生成 v1）

> 契约是唯一事实来源，代码是它的投影。

## 新增包

### `@nofault/dsl`
- `ApiSpec` / `TypeSpec` / `RouteSpec` / `FieldSpec`：两种输入共用的中间表示
- 契约装饰器：`@Api @Prefix @Group @Jwt @Middleware @Timeout @MaxBytes`、
  `@Get @Post @Put @Delete @Patch @Head @Options @Handler`、
  `@Body @Path @Query @Header @Form`、
  `@IsString @IsInt @IsNumber @IsEmail @IsNotEmpty @MinLength @MaxLength @Min @Max @Optional`
- 命名工具：pascal / camel / kebab / snake / singularize

### `@nofault/parser`
- 手写**扫描器 + 递归下降**（不引 ANTLR），约 500 行
- `parseApiSource()`：`.api` 文本 DSL
- `parseTsSource()`：TS 契约 `.api.ts`（**不执行用户代码**，只当文本扫）
- `parseContractFile()`：按扩展名自动识别格式
- 每个错误都带**行列号**，并能指出"哪个服务 / 哪条路由 / 哪个字段"

### `@nofault/codegen`
- `validateSpec()`：重复路由、未知类型、路径缺斜杠、属性重名……**一次报完**
- `generate()`：纯函数，Spec → 文件内容
- `writeFiles()`：覆盖策略默认只覆盖"自己也认领过"的文件
- `renderTemplate()`：mustache 子集（插值 / if / unless / each），模板可整体覆盖

### `@nofault/cli`（`nofaultctl`）
- `new <project>`：脚手架 + 示例契约 + 立刻生成一遍
- `generate api <contract>`：生成 controller / service / module / dto
- `validate <contract>`、`routes <contract>`
- 零第三方依赖的参数解析

## 框架的改动（生成器逼出来的）

1. **DTO 属性名取传输键**（`json:"name"` → `name`），不取源字段名（`Name`）。
2. **query DTO 也要校验**：`validateBodyIfDeclared` → `validateDtoIfDeclared`，
   按 DTO **实际绑定来源**取值；原先 GET 的 DTO 完全绕过校验。
3. **query 值按声明类型强制转换**（新增 `coerceDtoFields`）：
   query string 里永远是字符串，`number` 字段原本会拿到 `"1"`。
4. **命名中间件注册表** `middlewareRegistry`：契约里只能写中间件**名字**，
   没登记实现就**启动失败**并提示缺哪个，而不是静默跳过。
5. 新增 `@Validate(dto)`（`@ValidateBody` 保留作别名）：名字不再暗示"只能校验 body"。

## 关键设计决策

| 决策 | 理由 |
| --- | --- |
| 主推 TS 契约，兼容 `.api` | 类型由编译器保证、IDE 原生支持；同时能接住存量 `.api` 契约 |
| 不用 ANTLR | 语法很小；自己写才能给出"哪一行哪一列"的报错 |
| 生成器不碰 IO | `generate()` 是纯函数，可测、可 dry-run |
| 只覆盖自己认领过的文件 | 静默覆盖用户代码是生成器最恶劣的行为 |
| 属性名取传输键 | 照抄源字段名会生成"能编译、能启动、永远绑不上数据"的代码 |
| GET 一律走 Query | GET 带 body 在多数网关/CDN 上会被丢弃 |

## 测试

- 单元测试 +71：parser 31、codegen 46、cli 21（含重叠）
- 集成测试 +6：生成 → `tsc` 编译 → 起服务 → 真实 HTTP（含 query 校验、路径参数）
- 合计 **238 项全通过**，`tsc --noEmit` 与 `eslint` 全清

## 性能（benchmarks/v0.4.0）

| 指标 | 数值 |
| --- | --- |
| 解析 `.api` | 0.43 ms（2,304 ops/sec） |
| 解析 `.api.ts` | 0.57 ms（1,768 ops/sec） |
| 生成 | 1.69 ms（592 ops/sec） |
| **端到端（含写盘）** | **30.7 ms** |
| 杠杆率 | 312 行契约 → 1,076 行代码 / 73 文件（3.45×） |

二次执行 **0 文件变更**（内容相同不写盘）——幂等。

## 已知限制

- 路径参数只做逐个 `@Param()` 绑定，不做整体 DTO 校验
- 传输键与属性名在 camelCase 后仍不一致时需手工映射（生成注释提示）
- 无 `watch` 模式
- 契约不支持多文件互相引用
- 无 ORM / 缓存 → v0.5.0；无 RPC → v0.6.0；无熔断限流 → v0.7.0；无链路追踪 / 指标 → v0.8.0
