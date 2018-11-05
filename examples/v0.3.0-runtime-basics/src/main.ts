import 'reflect-metadata';
import { createLogger, FileTransport, LogLevel } from '@nofault/logger';
import { currentContext } from '@nofault/context';
import { ConfigService } from '@nofault/config';
import { RestApplication, bodyParser, cors, requestContext, securityHeaders } from '@nofault/rest';
import { AppModule } from './app.module';

/**
 * 关键一行：日志的 `contextProvider` 从请求上下文取 traceId。
 *
 * 这样**每一条日志都自动带上 traceId**，业务代码完全无感——
 * 不需要在每个 log 调用里手动塞字段。
 */
const logger = createLogger({
  context: 'runtime-basics',
  level: LogLevel.DEBUG,
  contextProvider: () => currentContext()?.toJSON(),
  transports: [
    {
      // stdout：容器里会被日志采集器接走
      write: (line, record) => {
        const target = record.level >= LogLevel.WARN ? process.stderr : process.stdout;
        target.write(line + '\n');
      },
    },
    new FileTransport({
      filePath: process.env.NOFAULT_LOG_FILE ?? 'logs/runtime-basics.log',
      maxSize: 1024 * 512,
      maxFiles: 3,
    }),
  ],
});

async function bootstrap(): Promise<void> {
  const app = await RestApplication.create(AppModule, {
    name: 'runtime-basics',
    logger,
    // requestContext() 必须放在最前：后面的中间件与业务逻辑都依赖它
    middleware: [requestContext(), cors(), securityHeaders(), bodyParser()],
  });

  // 注册一个 readiness 检查：模拟"依赖预热完成后才接流量"
  const config = await app.get(ConfigService);
  app.health.registerReadiness('config', () => {
    // 缺 tenant 就认为没就绪
    if (!config.get<string>('app.tenant')) throw new Error('tenant not configured');
    return true;
  });
  app.health.registerLiveness('event-loop', () => process.uptime() >= 0);

  // 配置变更时打日志（真实项目里可以用来重建连接池）
  config.subscribe((next) => {
    logger.info('config reloaded', { tenant: next.app, betaEnabled: (next.feature as Record<string, unknown>)?.betaEnabled });
  });

  app.enableShutdownHooks();
  const port = Number(process.env.PORT ?? 3000);
  const { port: actualPort } = await app.listen(port);

  // 预热完成，正式接流量
  app.markReady();
  logger.info('runtime basics ready', { port: actualPort, routes: app.getRoutes().length });
  for (const r of app.getRoutes()) {
    logger.debug(`  ${r.method.padEnd(6)} ${r.path}`);
  }
}

void bootstrap().catch((err: unknown) => {
  logger.error('bootstrap failed', undefined, err);
  // 启动失败的堆栈必须打全，否则只剩一行 message 根本没法排查
  if (err instanceof Error && err.stack) process.stderr.write(`${err.stack}\n`);
  process.exit(1);
});
