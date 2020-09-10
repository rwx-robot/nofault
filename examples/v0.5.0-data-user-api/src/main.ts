import 'reflect-metadata';
import { createLogger, LogLevel } from '@nofault/logger';
import { Migrator, type Migration } from '@nofault/orm';
import { RestApplication, bodyParser, cors, requestContext, securityHeaders } from '@nofault/rest';
import { AppModule, dataSource } from './app.module';
import { UserResp } from './data/entities/user-resp.entity';

const logger = createLogger({ context: 'data-user-api', level: LogLevel.INFO });

/**
 * 迁移：把建表也版本化。
 *
 * 示例里只有一条；真实项目会不断追加。
 * `down()` 必须写——没有回滚路径的迁移等于埋雷。
 */
const createUsers: Migration = {
  version: '20200101_create_users',
  up: async (ctx) => {
    await ctx.createTable(UserResp);
  },
  down: async (ctx) => {
    await ctx.dropTable(UserResp);
  },
};

async function bootstrap(): Promise<void> {
  // 迁移在**接流量之前**跑完：避免半初始化的实例开始服务
  const migrator = new Migrator(dataSource, [createUsers]);
  const applied = await migrator.up();
  logger.info('migrations', applied.length > 0 ? { applied } : { applied: 'up to date' });

  const app = await RestApplication.create(AppModule, {
    name: 'data-user-api',
    logger,
    middleware: [requestContext(), cors(), securityHeaders(), bodyParser()],
  });

  app.enableShutdownHooks();
  const { port } = await app.listen(Number(process.env.PORT ?? 3000), '127.0.0.1');
  app.markReady();