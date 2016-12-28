/**
 * 根模块（**手写**）。
 *
 * 生成器不产出根模块，原因很实在：根模块要决定用哪个 DataSource、哪个缓存实现，
 * 这些是部署决策，契约里没有——生成器不该猜。
 *
 * 于是 `app.module.ts` 与 `data.module.ts` 都是手写的，
 * 而 controller / dto / entity / repository 由契约生成。
 */
import { Module } from '@nofault/core';
import { OrmModule } from '@nofault/orm';
import { CacheModule } from '@nofault/cache';
import { MemoryDataSource } from '@nofault/orm';
import { DataModule } from './data/data.module';
import { UserModule } from './user/user.module';

/** 导出给 main.ts 跑迁移用：迁移必须与运行时共用同一个数据源实例 */
export const dataSource = new MemoryDataSource();

@Module({
  imports: [
    // 全局提供 DataSource 与 Cache
    OrmModule.forRoot({ dataSource }),
    CacheModule.forRoot({ memory: { ttl: 10_000, max: 1000, jitter: 0.1 } }),
    // 数据层：注册生成的 Repository
    DataModule,
    // 业务层：生成的 controller / module
    UserModule,
  ],
})
export class AppModule {}
