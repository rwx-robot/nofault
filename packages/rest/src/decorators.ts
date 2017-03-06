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