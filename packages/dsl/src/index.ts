/**
 * @nofault/dsl —— API 契约 DSL（v0.4.0）。
 *
 * 契约写成普通 TypeScript 文件（`.api.ts`），用装饰器描述元信息。
 * 这样做的好处是：类型由 TS 编译器保证、IDE 原生支持、无需学新语法。
 * 同时保留 `.api` 文本 DSL 作为可选输入，便于迁移。
 */
export {
  FieldSource,
  createApiSpec,
  findType,
  findService,
} from './spec';
export type { FieldSpec, TypeSpec, RouteSpec, ServiceSpec, ApiSpec } from './spec';

export {
  Api,
  Prefix,
  Group,
  Jwt,
  Middleware,
  Timeout,
  MaxBytes,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Head,
  Options,
  Handler,
  Body,
  Path,
  Query,
  Header,
  Form,
  Rule,
  Optional,
  IsString,
  IsInt,
  IsNumber,
  IsEmail,
  IsNotEmpty,
  MinLength,
  MaxLength,
  Min,
  Max,
  readServiceMeta,
  readRouteMeta,
  readFieldMeta,
  isApiService,
} from './decorators';
export type { ServiceMeta, RouteMeta, FieldMeta } from './decorators';

export {