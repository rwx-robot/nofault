/**
 * @nofault/rest —— HTTP 全栈层（v0.2.0）。
 *
 * 提供：Radix 路由树、装饰器控制器、中间件管道、参数绑定与校验、异常过滤器。
 * 规范：Node.js / NestJS 生态约定（camelCase 导出、createXxx 工厂）。
 */
import 'reflect-metadata';

export { RouteTree, RouteTable, RouteConflictError } from './router/route-tree';
export type { RouteMatch } from './router/route-tree';
export { SegmentType } from './router/route-tree';

export {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Head,
  Options,
  All,
  HttpCode,
  Param,
  Query,
  Body,
  Headers,
  Req,
  Res,
  Ctx,
  RawRequest,
  RawResponse,
  UseMiddleware,
  UseInterceptors,
  Catch,
  UseFilters,
  Validate,
  ValidateBody,
  getRouteDto,
  joinPath,
} from './decorators';

export { ParamSource, REST_METADATA } from './metadata';
export type { ParamMetadata, RouteMetadata } from './metadata';

export { RestContext as RestRequestContextType } from './http/context';
export { RestApplication } from './rest-application';
export type { RestApplicationOptions } from './rest-application';

export { RestContext, RestRequest, RestResponse } from './http/context';

export {
  HttpException,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  MethodNotAllowedException,
  ConflictException,
  UnprocessableEntityException,
  InternalServerErrorException,
  isHttpException,
} from './errors/http-exception';

export {
  composeMiddleware,
  resolveHandlerArgs,
  validateDtoIfDeclared,
  validateBodyIfDeclared,
  normalizeError,
} from './pipeline';
export type { Middleware, Interceptor } from './pipeline';

export { openSse } from './sse';
export type { SseWriter } from './sse';
export {
  cors,
  bodyParser,
  securityHeaders,
  requestLogger,
  serveStatic,
  rateLimit,
  requestContext,
} from './middleware';
export type {
  CorsOptions,
  BodyParserOptions,
  SecurityHeadersOptions,
  StaticOptions,
  RequestContextOptions,
} from './middleware';

export {
  IsString,
  IsNumber,
  IsInt,
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  MinLength,
  MaxLength,
  Min,
  Max,
  validateDto,
  coerceDtoFields,
} from './validation';
export type { ValidationError } from './validation';

export { HealthRegistry, statusToHttpCode } from './health';
export type { HealthReport, HealthStatus, HealthCheck, HealthCheckResult } from './health';

export { RouteExplorer } from './route-explorer';
export type { MiddlewareRegistry } from './route-explorer';
export type { ResolvedRoute } from './route-explorer';
export type { RouteRef } from './http/context';
