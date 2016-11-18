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