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
