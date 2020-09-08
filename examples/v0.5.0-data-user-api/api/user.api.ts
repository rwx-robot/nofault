/**
 * user 服务的 API 契约（v0.5.0）。
 *
 * 与 v0.4.0 那份相比只多了一件事：**DTO 同时被用作数据层的实体来源**。
 * 一份契约 → controller / service / module / dto / entity / repository。
 */
import {
  Api,
  Prefix,
  Get,
  Post,
  Delete,
  Handler,
  Body,
  Query,
  Path,
  IsString,
  IsInt,
  IsEmail,
  MinLength,
  MaxLength,
  Min,
  Optional,
} from '@nofault/dsl';

export class CreateUserReq {
  @Body('name') @IsString() @MinLength(2) @MaxLength(32)
  name!: string;

  @Body('email') @IsString() @IsEmail()
  email!: string;

  @Body('age') @IsInt() @Min(0) @Optional()
  age?: number;
}

export class ListUsersReq {
  @Query('page') @IsInt() @Min(1)
  page!: number;

  @Query('pageSize') @IsInt() @Min(1)
  pageSize!: number;
}

export class GetUserReq {
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
export class UserService {
  @Get('/ping')
  @Handler('ping')
  ping(): OkResp { throw new Error('not implemented'); }

  @Get('/users')
  listUsers(_req: ListUsersReq): UserPageResp { throw new Error('not implemented'); }

  @Get('/users/:id')
  getUser(_req: GetUserReq): UserResp { throw new Error('not implemented'); }

  @Post('/users')
  createUser(_req: CreateUserReq): UserResp { throw new Error('not implemented'); }

  @Delete('/users/:id')
  deleteUser(_req: GetUserReq): OkResp { throw new Error('not implemented'); }
}
