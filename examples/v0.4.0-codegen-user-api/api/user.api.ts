/**
 * user 服务的 API 契约。
 *
 * **这是日常要改的那份文件**：改完之后跑
 * ```bash
 * npx nofaultctl generate api api/user.api.ts --out src --root-module
 * ```
 * 契约一行，业务零改动地多出 controller / service / module / dto。
 */
import {
  Api,
  Prefix,
  Middleware,
  Get,
  Post,
  Delete,
  Handler,
  Body,
  Query,
  Path,
  IsString,
  IsInt,
  IsNotEmpty,
  IsEmail,
  MinLength,
  MaxLength,
  Min,
  Max,
  Optional,
} from '@nofault/dsl';

/** 创建用户的请求体 */
export class CreateUserReq {
  @Body('name') @IsString() @IsNotEmpty() @MinLength(2) @MaxLength(32)
  name!: string;

  @Body('email') @IsString() @IsEmail()
  email!: string;

  @Body('age') @IsInt() @Min(0) @Max(150) @Optional()
  age?: number;
}

export class UpdateUserReq {
  @Body('id') @IsInt()
  id!: number;

  @Body('name') @IsString() @MinLength(2) @MaxLength(32) @Optional()
  name?: string;
}

/** 分页参数：来自 query string */
export class ListUsersReq {
  @Query('page') @IsInt() @Min(1)
  page!: number;

  @Query('pageSize') @IsInt() @Min(1) @Max(100)
  pageSize!: number;
}

/** 路径参数：来自 URL 的 `:id` */
export class GetUserReq {
  @Path('id') @IsInt()
  id!: number;
}

export class DeleteUserReq {
  @Path('id') @IsInt()
  id!: number;
}

export class UserResp {
  @Body('id') @IsInt()
  id!: number;

  @Body('name') @IsString()
  name!: string;

  @Body('email') @IsString()
  email!: string;
}

export class UserPageResp {
  @Body('total') @IsInt()
  total!: number;

  @Body('page') @IsInt()
  page!: number;
}

export class OkResp {
  @Body('ok') @IsString()
  ok!: string;
}

@Api('user')
@Prefix('/api')
@Middleware('RequestLogger')
export class UserService {
  @Get('/ping')
  @Handler('ping')
  ping(): OkResp {
    throw new Error('not implemented');
  }

  @Get('/users')
  listUsers(_req: ListUsersReq): UserPageResp {
    throw new Error('not implemented');
  }

  @Get('/users/:id')
  getUser(_req: GetUserReq): UserResp {
    throw new Error('not implemented');
  }

  @Post('/users')
  createUser(_req: CreateUserReq): UserResp {
    throw new Error('not implemented');
  }

  @Delete('/users/:id')
  deleteUser(_req: DeleteUserReq): OkResp {
    throw new Error('not implemented');
  }
}
