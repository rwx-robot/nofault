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
    return this.users.get(Number(id));
  }

  @Post('/')
  @ValidateBody(CreateUserDto)
  create(@Body() body: CreateUserDto) {
    return this.users.create(body);
  }

  /**
   * echo：解析 body → 校验 → 原样返回。
   *
   * 存在的意义是给 benchmark 一条"成功路径"的 POST 样本：
   * 创建用户的接口会因为邮箱重复走到 409，而**抛异常要捕获调用栈**，
   * 拿它测吞吐其实测的是异常开销，不是框架开销。
   */
  @Post('/echo')
  @ValidateBody(CreateUserDto)
  echo(@Body() body: CreateUserDto) {
    return { received: body };
  }

  @Put('/:id')
  replace(@Param('id') id: number, @Body() body: Partial<CreateUserDto>) {
    return this.users.update(Number(id), body);
  }

  @Patch('/:id')
  patch(@Param('id') id: number, @Body('name') name?: string) {
    return this.users.update(Number(id), name ? { name } : {});
  }

  @Delete('/:id')
  remove(@Param('id') id: number, @Ctx() ctx: RestContext) {
    this.users.delete(Number(id));
    ctx.response.status(204).end();
    return undefined;
  }

  /** 演示手动抛异常 —— 会走统一的异常过滤，返回 `{ code, data, message }` */
  @Get('/probe/missing')
  probeMissing() {
    throw new NotFoundException('This endpoint always 404s, on purpose');
  }
}
