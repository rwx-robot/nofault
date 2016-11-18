import 'reflect-metadata';
import { createLogger } from '@nofault/logger';
import { createHttpApplication } from '@nofault/http';
import { AppModule } from './app.module';
import { GreeterService } from './greeter.service';
import { createRouter } from './router';

const logger = createLogger({ context: 'bootstrap' });

async function bootstrap(): Promise<void> {
  const app = await createHttpApplication(AppModule, { name: 'hello-kernel' });
  const greeter = await app.get(GreeterService);

  app.use(createRouter(greeter));
  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 3000);
  const { port: actualPort } = await app.listen(port);

  logger.info('server started', { port: actualPort, pid: process.pid });
}

void bootstrap().catch((err: unknown) => {
  logger.error('bootstrap failed', undefined, err);
  process.exit(1);
});
