/**
 * UserModule —— 生成骨架 + **手工接线**（已删掉生成标记）。
 *
 * 手工加的是 `imports: [DataModule]`：service 依赖 Repository，
 * 而 Repository 由数据层模块提供。生成器不知道你有哪些基础设施模块，
 * 这一步**注定**要人来做——所以模块文件通常是第一批被接管的生成物之一。
 */
import { Module } from '@nofault/core';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { DataModule } from '../data/data.module';

@Module({
  imports: [DataModule],
  controllers: [UserController],