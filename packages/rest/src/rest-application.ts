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
  wrapResponse?: boolean;
  /** 自定义日志器 */
  logger?: Logger;
  /**
   * 上下文存储。默认开启（全局 `requestContextStore`）。
   * 传 `null` 关闭——但没有上下文时 `Scope.REQUEST` 的 Provider 无法解析。
   */
  contextStore?: RequestContextStore | null;
  /**
   * 健康检查端点。默认开启：`/healthz`（存活）+ `/readyz`（就绪）。
   * 传 `false` 关闭，或传对象自定义路径。
   */
  health?: false | { livenessPath?: string; readinessPath?: string };
  /**
   * 命名中间件表：契约/装饰器里以**字符串**声明的中间件在这里登记实现。