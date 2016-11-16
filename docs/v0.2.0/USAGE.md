# nofault v0.2.0 使用说明

## 1. 声明控制器

```ts
import { Controller, Get, Post, Param, Query, Body, ValidateBody } from '@nofault/rest';
import { Injectable } from '@nofault/core';

@Injectable()
export class UserService {
  findAll() { return []; }
}

@Controller('/users')
export class UserController {
  constructor(private readonly users: UserService) {}

  @Get('/')
  list(@Query('keyword') keyword?: string) {
    return this.users.findAll();
  }

  @Get('/:id')
  detail(@Param('id') id: number) {
    return { id };
  }

  @Post('/')
  @ValidateBody(CreateUserDto)
  create(@Body() dto: CreateUserDto) {
    return dto;
  }
}
```

控制器必须登记到模块的 `controllers` 里：

```ts
@Module({ controllers: [UserController], providers: [UserService] })
export class AppModule {}
```

> 控制器**同时也是 Provider**：会自动注册进容器，可以正常注入依赖。

## 2. 启动

```ts
import 'reflect-metadata';
import { RestApplication, cors, bodyParser, securityHeaders } from '@nofault/rest';

const app = await RestApplication.create(AppModule, {
  globalPrefix: '/api',           // 所有路由加前缀
  middleware: [cors(), securityHeaders(), bodyParser()],
  wrapResponse: true,             // 默认 true：返回值包成 { code, data, message }
});

app.enableShutdownHooks();
await app.listen(3000);

console.log(app.getRoutes());     // [{ method: 'GET', path: '/api/users' }, ...]
```

## 3. 路由装饰器

`@Controller(path)` · `@Get` `@Post` `@Put` `@Delete` `@Patch` `@Head` `@Options` `@All` · `@HttpCode(201)`

路径支持三段：

| 写法 | 含义 |
| --- | --- |
| `/users` | 静态段 |
| `/users/:id` | 参数段 |
| `/static/*` | 通配段（吃掉剩余全部） |

**匹配优先级：静态 > 参数 > 通配**。`/users/me` 会命中静态路由而不是 `/users/:id`。

## 4. 参数装饰器

| 装饰器 | 取值 |
| --- | --- |
| `@Param(key?)` | 路径参数 |
| `@Query(key?)` | query string |
| `@Body(key?)` | 请求体（可指定字段） |
| `@Headers(key?)` | 请求头 |
| `@Req()` | `RestRequest` |
| `@Res()` | `RestResponse` |
| `@Ctx()` | `RestContext`（含 `ok()` / `fail()` 快捷方法） |
| `@RawRequest()` / `@RawResponse()` | 原生 node 对象 |

```ts
@Get('/search')
search(
  @Query('q') q: string,
  @Query('page', { default: 1 }) page: number,   // 默认值
  @Query('kw', { required: false }) kw?: string, // 可选
) {}
```

按声明类型自动转换；转换失败返回 **400**。

## 5. 校验

```ts
import { IsEmail, IsInt, IsNotEmpty, Max, Min, MinLength, ValidateBody } from '@nofault/rest';

export class CreateUserDto {
  @IsNotEmpty() @MinLength(2) name!: string;
  @IsEmail() email!: string;
  @IsInt() @Min(0) @Max(150) age!: number;
}

@Post('/')
@ValidateBody(CreateUserDto)
create(@Body() dto: CreateUserDto) {}
```

失败返回 **422**：

```json
{
  "code": 422,
  "data": [{ "property": "email", "constraints": { "isEmail": "must be an email" } }],
  "message": "Validation failed"
}
```

## 6. 中间件

```ts
import type { Middleware } from '@nofault/rest';

const timing: Middleware = async (ctx, next) => {
  const t = process.hrtime.bigint();
  await next();
  ctx.response.header('x-response-time', `${(Number(process.hrtime.bigint() - t) / 1e6).toFixed(2)}ms`);
};
```

三种作用域：

```ts
// 1. 全局
RestApplication.create(AppModule, { middleware: [timing] })

// 2. 控制器级
@Controller({ path: '/users', middleware: [timing] })
@UseMiddleware(timing)                    // 等价写法

// 3. 路由级
@Get('/:id')
@UseMiddleware(timing)
detail() {}
```

内置中间件：

```ts
cors({ origin: true, credentials: true })
bodyParser({ limit: 512 * 1024 })         // JSON / urlencoded / text
securityHeaders({ hsts: true })
requestLogger((msg, fields) => log.debug(msg, fields))
serveStatic({ root: './public', prefix: '/static' })
rateLimit({ windowMs: 60_000, max: 100 }) // 单机内存版
```

## 7. 异常

```ts
import { NotFoundException, ConflictException, BadRequestException } from '@nofault/rest';

@Get('/:id')
detail(@Param('id') id: number) {
  const user = find(id);
  if (!user) throw new NotFoundException(`User ${id} not found`);
  return user;
}
```

自定义异常：

```ts
class PaymentRequiredException extends HttpException {
  constructor() { super(402, 'Payment required', 402); }
}
```

统一响应体：`{ code, data, message }`（`code: 0` 表示成功）。

## 8. 直接操作响应

```ts
@Get('/download')
download(@Ctx() ctx: RestContext) {
  ctx.response.header('content-disposition', 'attachment; filename="a.txt"');
  ctx.response.text('...');      // 不走 { code, data, message } 包装
}

@Delete('/:id')
remove(@Param('id') id: number, @Res() res: RestResponse) {
  res.status(204).end();         // 204 无 body
}
```

> 只要 handler 返回 `undefined` 或已自行写响应，框架就不再包装。

## 9. 元数据记忆化

参数的反射元数据（`design:paramtypes`）与 DTO 声明在**首次请求**时解析并缓存进 `WeakMap`，
后续请求零反射。这是 v0.2.0 的一项性能优化（实测把 POST 开销从 27% 降到 21%）。

## 10. 常见报错

| 报错 | 原因 | 处理 |
| --- | --- | --- |
| `Route conflict: cannot register "X"` | 重复注册，或同层参数名不同（`:id` vs `:name`） | 统一参数名或调整路径 |
| `Cannot convert "abc" to number` | 路径参数转换失败 | 前端传数字，或声明为 `string` |
| `Missing required parameter: param "id"` | 必填参数缺失 | 加 `{ required: false }` 或给默认值 |
| `Middleware must be a function or a class with a use() method` | `@UseMiddleware()` 传错类型 | 传函数或实现 `use()` 的类 |
| 路由没注册 | 控制器没写进 `controllers` | 补 `@Module({ controllers: [...] })` |
