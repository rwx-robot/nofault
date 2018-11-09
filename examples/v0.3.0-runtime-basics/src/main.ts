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