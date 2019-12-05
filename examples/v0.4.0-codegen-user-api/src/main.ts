import 'reflect-metadata';
import { createLogger, LogLevel } from '@nofault/logger';
import {
  RestApplication,
  bodyParser,
  cors,
  requestContext,
  securityHeaders,
  type Middleware,
} from '@nofault/rest';
import { AppModule } from './app.module';

const logger = createLogger({ context: 'user-api', level: LogLevel.INFO });

/**
 * 契约里 `@Middleware('RequestLogger')` 声明的中间件，需要在**这里注册实现**。
 *
 * 生成器只保留名字（它需要知道调用哪个中间件），实现留给人——
 * 中间件往往依赖连接池、鉴权 SDK 之类无法从契约推导的东西。
 */
const requestLogger: Middleware = async (ctx, next) => {
  const started = Date.now();
  const result = await next();
  logger.info('request', {
    method: ctx.request.method,
    path: ctx.request.path,
    status: ctx.response.statusCodeValue,
    ms: Date.now() - started,
  });
  return result;
};

async function bootstrap(): Promise<void> {
  const app = await RestApplication.create(AppModule, {
    name: 'codegen-user-api',
    logger,
    middleware: [requestContext(), cors(), securityHeaders(), bodyParser()],
    // 契约里 `@Middleware('RequestLogger')` 只是个名字，实现在这里登记。
    // 忘了登记会**直接启动失败**并提示缺哪个，而不是静默跳过 —— 见 route-explorer.ts
    middlewareRegistry: { RequestLogger: requestLogger },
  });

  app.enableShutdownHooks();
  const { port } = await app.listen(Number(process.env.PORT ?? 3000), '127.0.0.1');
  app.markReady();

  logger.info('ready — try these:', { port });
  for (const route of app.getRoutes()) {
    logger.info(`  ${route.method.padEnd(6)} ${route.path}`);
  }
}

void bootstrap().catch((err: unknown) => {
  logger.error('bootstrap failed', undefined, err);
  if (err instanceof Error && err.stack) process.stderr.write(`${err.stack}\n`);
  process.exit(1);
});
