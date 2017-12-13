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
