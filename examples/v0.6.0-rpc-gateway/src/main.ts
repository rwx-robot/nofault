import 'reflect-metadata';
import { Module } from '@nofault/core';
import { createLogger, LogLevel } from '@nofault/logger';
import { InMemoryRegistry, RpcModule, RpcServer, loggingInterceptor } from '@nofault/rpc';
import { RestApplication, bodyParser, requestContext } from '@nofault/rest';
import { UserRpcService } from './user-rpc.service';
import { GatewayController } from './gateway.controller';

const logger = createLogger({ context: 'rpc-gateway', level: LogLevel.INFO });
