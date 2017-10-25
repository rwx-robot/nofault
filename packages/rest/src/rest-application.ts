import type { IncomingMessage, ServerResponse } from 'node:http';
import { createHttpApplication } from '@nofault/http';
import type { NofaultApplication } from '@nofault/core';
import type { DynamicModule, Type } from '@nofault/core';
import { RequestContext, requestContextStore } from '@nofault/context';
import type { RequestContextStore } from '@nofault/context';
import { parseTraceparent } from '@nofault/context';
import { createLogger, type Logger } from '@nofault/logger';
import { RestContext, RestRequest, RestResponse } from './http/context';
import { MethodNotAllowedException, NotFoundException, isHttpException } from './errors/http-exception';
import {
  composeMiddleware,
  resolveHandlerArgs,
  validateDtoIfDeclared,
  normalizeError,
  type Middleware,
} from './pipeline';
import { RouteExplorer, type ResolvedRoute, type MiddlewareRegistry } from './route-explorer';
import type { RouteTable } from './router/route-tree';
import { HealthRegistry, statusToHttpCode } from './health';
import type { HealthReport } from './health';

export interface RestApplicationOptions {
  name?: string;
  quiet?: boolean;
  /** 全局路由前缀 */
  globalPrefix?: string;
  /** 全局中间件 */
  middleware?: Middleware[];
  /** 是否把返回值包装成 `{ code, data, message }`，默认 true */