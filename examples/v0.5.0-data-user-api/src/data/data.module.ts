/**
 * 数据层装配（**手写**）。
 *
 * `OrmModule.forFeature([UserResp])` 为每个实体注册 Repository Provider，
 * 生成的 `UserRespRepository` 再用 `@InjectRepository` 把它注入进来。
 *
 * 为什么要这一层手写模块：哪些实体需要 Repository 是部署/业务决策，
 * 生成器只能给出骨架，装配顺序得由人定。
 */
import { Module } from '@nofault/core';
import { OrmModule } from '@nofault/orm';
import { UserRespRepository } from './repositories/user-resp.repository';
import { UserResp } from './entities/user-resp.entity';

@Module({
  imports: [OrmModule.forFeature([UserResp])],
  providers: [UserRespRepository],