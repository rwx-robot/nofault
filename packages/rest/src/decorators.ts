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