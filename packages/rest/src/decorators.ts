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