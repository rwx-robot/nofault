import 'reflect-metadata';
import { Module } from '@nofault/core';
import { createLogger, LogLevel } from '@nofault/logger';
import { RestApplication, bodyParser, requestContext } from '@nofault/rest';
import { rateLimit, bulkhead } from '@nofault/resilience';
import { FaultyController, dependency } from './faulty.controller';

const logger = createLogger({ context: 'resilient-api', level: LogLevel.INFO });

@Module({ controllers: [FaultyController] })
class AppModule {}

async function bootstrap(): Promise<void> {
  const app = await RestApplication.create(AppModule, {
    name: 'resilient-api',
    logger,
    middleware: [
      requestContext(),
      bodyParser(),
      // 顺序很重要：限流在最外层，舱壁在内层
      // 反过来的话，被限流的请求也会占着并发配额
      rateLimit({ capacity: 20, refillPerSecond: 5 }),
      bulkhead({ concurrency: 5, queueLimit: 10, waitTimeoutMs: 200 }).use,
    ],
  });

  app.enableShutdownHooks();
  const { port } = await app.listen(Number(process.env.PORT ?? 3000), '127.0.0.1');