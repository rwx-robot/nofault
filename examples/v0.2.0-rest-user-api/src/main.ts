import 'reflect-metadata';
import { createLogger } from '@nofault/logger';
import { RestApplication, cors, bodyParser, requestLogger, securityHeaders } from '@nofault/rest';
import { AppModule } from './app.module';
import { UserService } from './users/user.service';
import { reset } from './users/user.model';

const logger = createLogger({ context: 'bootstrap' });

async function bootstrap(): Promise<void> {
  const app = await RestApplication.create(AppModule, {
    name: 'rest-user-api',
    globalPrefix: '/api',
    middleware: [
      requestLogger((msg, fields) => logger.debug(msg, fields)),
      cors({ origin: true, credentials: true }),
      securityHeaders(),
      bodyParser({ limit: 512 * 1024 }),
    ],
  });

  app.enableShutdownHooks();

  // 演示用：预置两条数据
  const users = await app.get(UserService);
  reset();
  users.create({ name: 'Ada Lovelace', email: 'ada@nofault.dev', age: 36 });
  users.create({ name: 'Alan Turing', email: 'alan@nofault.dev', age: 41 });

  const port = Number(process.env.PORT ?? 3000);
  const { port: actualPort } = await app.listen(port);
  logger.info('rest api ready', { port: actualPort, routes: app.getRoutes().length });
  for (const r of app.getRoutes()) {
    logger.info(`  ${r.method.padEnd(6)} ${r.path}`);
  }
}

void bootstrap().catch((err: unknown) => {
  logger.error('bootstrap failed', undefined, err);
  process.exit(1);
});
