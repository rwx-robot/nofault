import 'reflect-metadata';
import { Module } from '@nofault/core';
import { createLogger, LogLevel } from '@nofault/logger';
import { InMemoryRegistry, RpcModule, RpcServer, loggingInterceptor } from '@nofault/rpc';
import { RestApplication, bodyParser, requestContext } from '@nofault/rest';
import { UserRpcService } from './user-rpc.service';
import { GatewayController } from './gateway.controller';

const logger = createLogger({ context: 'rpc-gateway', level: LogLevel.INFO });

/**
 * 注册中心必须是**模块级单例**：服务端与客户端看到同一份，
 * 否则注册了也发现不到。真实环境它是独立进程，这里为了单进程演示放在内存。
 *
 * 注意它要定义在 GatewayModule **之前**：装饰器在类定义时就会求值，
 * 放在后面会踩暂时性死区（TDZ）。
 */
const registry = new InMemoryRegistry({ ttlMs: 30_000 });

@Module({
  imports: [
    RpcModule.forClient({
      registry,
      service: 'user',
      timeoutMs: 500,
      retries: 1,
      retryDelayMs: 30,
      poolSize: 4,