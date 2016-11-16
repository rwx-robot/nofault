# v0.4.0 使用说明：nofaultctl 与 API 契约

## 安装

```bash
pnpm add -D @nofault/cli      # 或 npm i -D @nofault/cli
```

## 三个命令

```bash
npx nofaultctl new <project>                # 建工程（含示例契约并立刻生成一遍）
npx nofaultctl generate api <contract>      # 由契约生成代码
npx nofaultctl validate <contract>          # 只校验，不生成（可挂 CI）
npx nofaultctl routes <contract>            # 列出契约里的全部路由
```

常用选项：

| 选项 | 说明 |
| --- | --- |
| `--out <dir>` | 输出根目录，默认 `src` |
| `--root-module` | 额外生成根 `app.module.ts` |
| `--templates <dir>` | 模板覆盖目录 |
| `--force` | 契约有错也生成；覆盖时无视生成标记 |
| `--dry-run` | 只报告，不写盘 |

## 一、写契约（TypeScript 形态，主推）

```ts
// api/user.api.ts
import {
  Api, Prefix, Middleware,
  Get, Post, Delete, Handler,
  Body, Query, Path,
  IsString, IsInt, IsEmail, MinLength, MaxLength, Min, Max, Optional,
} from '@nofault/dsl';

export class CreateUserReq {
  @Body('name') @IsString() @MinLength(2) @MaxLength(32)
  name!: string;

  @Body('email') @IsString() @IsEmail()
  email!: string;

  @Body('age') @IsInt() @Min(0) @Max(150) @Optional()
  age?: number;
}

export class GetUserReq {
  @Path('id') @IsInt()
  id!: number;
}

@Api('user')
@Prefix('/api')
@Middleware('RequestLogger')
export class UserService {
  @Get('/users/:id')
  getUser(_req: GetUserReq): UserResp { throw new Error('not implemented'); }

  @Post('/users')
  createUser(_req: CreateUserReq): UserResp { throw new Error('not implemented'); }
}
```

方法体一律 `throw`：契约只描述**形状**，实现写在别处。
参数写成 `_req` 是因为声明里用不到它，只有类型会被解析器读走。

### 装饰器速查

| 类别 | 装饰器 |
| --- | --- |
| 服务级 | `@Api(name)` `@Prefix(path)` `@Group(name)` `@Jwt(name)` `@Middleware(...names)` `@Timeout('3s')` |
| 路由级 | `@Get` `@Post` `@Put` `@Delete` `@Patch` `@Handler(name)` |
| 字段来源 | `@Body(key)` `@Query(key)` `@Path(key)` `@Header(key)` `@Form(key)` |
| 校验 | `@IsString` `@IsInt` `@IsNumber` `@IsEmail` `@IsNotEmpty` `@MinLength(n)` `@MaxLength(n)` `@Min(n)` `@Max(n)` `@Optional` |

## 二、写契约（`.api` 文本 DSL）

```
syntax = "v1"

type CreateUserReq {
  Name  string `json:"name"`
  Email string `json:"email"`
  Age   int    `json:"age,optional"`
}

type GetUserReq {
  Id int `path:"id"`
}

@server (
  group:  user
  prefix: /api
  middleware: RequestLogger
)
service user-api {
  @handler getUser
  get /users/:id (GetUserReq) returns (UserResp)

  @handler createUser
  post /users (CreateUserReq) returns (UserResp)
}
```

类型映射：`string→string`、`int/int64/float→number`、`bool→boolean`。
`json:"x,optional"` 与 `path:"id"` 分别决定传输键与绑定来源。
