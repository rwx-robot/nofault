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