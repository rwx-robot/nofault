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