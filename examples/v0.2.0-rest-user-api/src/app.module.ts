import { Module } from '@nofault/core';
import { UserController } from './users/user.controller';
import { UserService } from './users/user.service';

/**
 * 根模块。
 *
 * `controllers` 是 v0.2.0 新增的模块元数据：内核只负责登记，
 * 真正的路由解析由 `@nofault/rest` 的 `RouteExplorer` 完成。
 */
@Module({
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class AppModule {}
