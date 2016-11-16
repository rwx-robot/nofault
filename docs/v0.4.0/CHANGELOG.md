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