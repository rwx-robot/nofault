import {
  Body,
  Controller,
  Ctx,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  RestContext,
  UseMiddleware,
  ValidateBody,
} from '@nofault/rest';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { timing } from '../middleware/timing';

/**
 * 用户控制器。
 *
 * 演示 v0.2.0 的全部能力：
 * - `@Controller('/users')` 前缀
 * - `@Get/@Post/@Put/@Patch/@Delete` 方法路由
 * - `@Param/@Query/@Body/@Ctx` 参数绑定
 * - `@ValidateBody(CreateUserDto)` 自动校验
 * - `@UseMiddleware(timing)` 路由级中间件
 */
@Controller('/users')
@UseMiddleware(timing)
export class UserController {
  constructor(private readonly users: UserService) {}

  @Get('/')
  list(@Query('keyword') keyword?: string, @Query('limit', { default: 20 }) limit?: number) {
    return this.users.list(keyword, Number(limit ?? 20));
  }

  @Get('/count')
  count() {
    return { count: this.users.count() };
  }

  @Get('/:id')
  detail(@Param('id') id: number) {