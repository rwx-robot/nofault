# @nofault/rest

Web 层：Radix 路由、装饰器、中间件链、DTO 校验、统一错误响应。

**引入版本**：v0.2.0

## 为什么这么设计

- 路由用 Radix 树，路径参数 `/users/:id` 是 O(路径段数) 而非遍历全表
- 参数**必须带装饰器**（`@Body` / `@Query` / `@Param`）：框架靠它知道值从哪来，
- 漏了装饰器会静默拿到 undefined——表现为 204 空响应，非常难查
- DTO 校验按**实际绑定来源**取值：绑 query 就校验 query，GET 不再绕过校验
- query string 的值永远是字符串，整对象绑 DTO 时按 `design:type` 强制转换

## 最快上手

```ts
import { Controller, Get, Post, Body, Param, Query, Validate } from '@nofault/rest';

class CreateUserReq {
  @IsEmail() email!: string;
  @MinLength(2) name!: string;
}

@Controller('/users')
class UserController {
  @Post('/')
  @Validate(CreateUserReq)
  async create(@Body() body: CreateUserReq) { return { ok: true }; }

  @Get('/:id')
  async get(@Param('id') id: string) { return { id }; }
}
```

## 注意

错误语义：422 校验失败、400 参数错误、404 找不到、500 未处理异常。熔断/超时要显式翻译成 503/504。

## 相关文档

- 架构说明 → [`docs/v0.2.0/ARCHITECTURE.md`](../../docs/v0.2.0/ARCHITECTURE.md)
- 变更记录 → [`docs/v0.2.0/CHANGELOG.md`](../../docs/v0.2.0/CHANGELOG.md)
