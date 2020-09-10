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