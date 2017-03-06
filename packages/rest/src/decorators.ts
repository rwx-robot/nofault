import 'reflect-metadata';
import {
  ParamSource,
  REST_METADATA,
  joinPath,
  pushParam,
  pushRoute,
  getRoutes,
  type ParamMetadata,
} from './metadata';

// ------------------------------------------------------------------ 控制器

export interface ControllerOptions {
  /** 路由前缀 */
  path?: string;
  /** 控制器级中间件（类或函数） */
  middleware?: Array<unknown>;
}

export function Controller(options: string | ControllerOptions = '/'): ClassDecorator {
  return (target) => {
    const opts = typeof options === 'string' ? { path: options } : options;
    Reflect.defineMetadata(REST_METADATA.CONTROLLER_PATH, opts.path ?? '/', target);
    if (opts.middleware?.length) {
      Reflect.defineMetadata(REST_METADATA.CONTROLLER_MIDDLEWARE, opts.middleware, target);
    }
  };
}

// ------------------------------------------------------------------ HTTP 方法

function methodDecorator(method: string) {
  return (path = '/'): MethodDecorator =>
    (target, propertyKey) => {
      pushRoute(target.constructor, {
        method,
        path,
        propertyKey,
        middleware: [],
        interceptors: [],
      });
    };
}

export const Get = methodDecorator('GET');
export const Post = methodDecorator('POST');
export const Put = methodDecorator('PUT');
export const Delete = methodDecorator('DELETE');
export const Patch = methodDecorator('PATCH');
export const Head = methodDecorator('HEAD');
export const Options = methodDecorator('OPTIONS');
export const All = methodDecorator('ALL');

/** 自定义响应状态码 */
export function HttpCode(code: number): MethodDecorator {
  return (target, propertyKey) => {
    const routes = getRoutes(target.constructor);
    const route = [...routes].reverse().find((r) => r.propertyKey === propertyKey);
    if (route) route.statusCode = code;
  };
}

// ------------------------------------------------------------------ 参数

function paramDecorator(source: ParamSource) {
  return (key?: string, options: { required?: boolean; default?: unknown } = {}): ParameterDecorator =>
    (target, propertyKey, index) => {
      if (propertyKey === undefined) return;
      const types = (Reflect.getMetadata('design:paramtypes', target, propertyKey) ?? []) as unknown[];
      const meta: ParamMetadata = {
        source,
        key,
        index: index as number,
        required: options.required ?? source === ParamSource.PARAM,
        defaultValue: options.default,
        type: types[index as number],
      };
      pushParam(target, propertyKey, meta);
    };
}

/** 路径参数 */
export const Param = paramDecorator(ParamSource.PARAM);
/** query 参数 */
export const Query = paramDecorator(ParamSource.QUERY);
/** 请求体（可指定字段名） */
export const Body = paramDecorator(ParamSource.BODY);
/** 请求头 */
export const Headers = paramDecorator(ParamSource.HEADERS);
/** 原始 node 请求对象 */
export const RawRequest = paramDecorator(ParamSource.RAW_REQUEST);
/** 原始 node 响应对象 */
export const RawResponse = paramDecorator(ParamSource.RAW_RESPONSE);

/** 完整的 `RestRequest` 包装 */
export const Req = paramDecorator(ParamSource.REQUEST);
/** 完整的 `RestResponse` 包装 */
export const Res = paramDecorator(ParamSource.RESPONSE);
/** 完整上下文（含 request + response + ok/fail 快捷方法） */
export const Ctx = paramDecorator(ParamSource.CONTEXT);

// ------------------------------------------------------------------ 中间件 / 拦截器 / 过滤器

export function UseMiddleware(...middleware: Array<unknown>): MethodDecorator & ClassDecorator {
  return ((target: object, propertyKey?: string | symbol) => {
    if (propertyKey === undefined) {
      Reflect.defineMetadata(REST_METADATA.CONTROLLER_MIDDLEWARE, middleware, target as Function);
      return;
    }
    const routes = getRoutes(target.constructor);
    const route = [...routes].reverse().find((r) => r.propertyKey === propertyKey);
    if (route) route.middleware.push(...middleware);
  }) as MethodDecorator & ClassDecorator;
}

export function UseInterceptors(...interceptors: Array<unknown>): MethodDecorator {
  return (target, propertyKey) => {
    const routes = getRoutes(target.constructor);
    const route = [...routes].reverse().find((r) => r.propertyKey === propertyKey);
    if (route) route.interceptors.push(...interceptors);
  };
}

export function Catch(...exceptionTypes: Array<new (...args: never[]) => Error>): ClassDecorator {
  return (target) => {
    Reflect.defineMetadata(REST_METADATA.CONTROLLER_FILTERS, exceptionTypes, target);