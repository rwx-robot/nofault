# Changelog — v0.2.0（2017 · HTTP 全栈）

把 v0.1.0 的手写 `switch` 路由，升级为声明式的 Web 框架。

## 新增

### @nofault/rest（新包）
- **路由**
  - `RouteTree`：Radix 压缩前缀树，静态段前缀压缩 + 静态/参数/通配分槽
  - `RouteTable`：**每个 HTTP method 一棵树**（Radix 树实现），HEAD 自动回落 GET
  - 匹配优先级：静态 > 参数 > 通配
  - 注册期冲突检测，重复路径 / 同层不同参数名直接抛 `RouteConflictError`
  - `allowedMethods()` 支撑 405 + `Allow` 响应头
- **装饰器**
  - `@Controller(path | { path, middleware })`
  - `@Get` `@Post` `@Put` `@Delete` `@Patch` `@Head` `@Options` `@All` `@HttpCode`
  - `@Param` `@Query` `@Body` `@Headers` `@Req` `@Res` `@Ctx` `@RawRequest` `@RawResponse`
  - `@UseMiddleware` `@UseInterceptors` `@Catch` `@UseFilters` `@ValidateBody`
- **中间件**：洋葱模型 `composeMiddleware()`，重复 `next()` 检测，支持函数与 `use()` 类
  - 内置：`cors` `bodyParser` `securityHeaders` `requestLogger` `serveStatic` `rateLimit`（单机）
- **参数绑定**：按 `design:paramtypes` 自动类型转换；转换失败 400；支持默认值与可选
- **校验**：自研轻量校验器（`IsString/IsInt/IsEmail/MinLength/Min/Max/...`），422 返回字段级明细
- **异常**：`HttpException` 体系 + 8 个常用子类 + `normalizeError()` 自动兜底
- **响应**：`{ code, data, message }` 统一包装（可关闭）；`RestResponse` **延迟提交**

### @nofault/core
- `@Module()` 新增 `controllers` 元数据；控制器自动注册为 Provider
- 新增 `ApplicationContext.getModuleRefs()`，供 Web 层扫描模块元数据

## 关键设计变更

1. **响应延迟提交（deferred commit）**