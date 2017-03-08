import 'reflect-metadata';

/** 路由参数来源 */
export enum ParamSource {
  PARAM = 'param',
  QUERY = 'query',
  BODY = 'body',
  HEADERS = 'headers',
  REQUEST = 'request',
  RESPONSE = 'response',
  CONTEXT = 'context',
  RAW_REQUEST = 'rawRequest',
  RAW_RESPONSE = 'rawResponse',
}

export interface ParamMetadata {
  source: ParamSource;
  /** 取值的键；对 body 来说是对象内的属性路径 */
  key?: string;
  index: number;
  /** 是否必填 */
  required: boolean;
  /** 默认值 */
  defaultValue?: unknown;
  /** 目标类型（来自 design:paramtypes） */
  type?: unknown;
  /** 校验规则（由 @Validate 或 DTO 提供） */
  validator?: (value: unknown) => string | undefined;
}

export interface RouteMetadata {
  method: string;
  path: string;
  propertyKey: string | symbol;
  /** 该方法上声明的中间件 */
  middleware: Array<unknown>;
  /** 该方法上声明的拦截器 */
  interceptors: Array<unknown>;
  /** 自定义状态码 */
  statusCode?: number;
}

export const REST_METADATA = {
  CONTROLLER_PATH: 'nofault:rest:controller:path',
  ROUTES: 'nofault:rest:routes',
  PARAMS: 'nofault:rest:params',
  CONTROLLER_MIDDLEWARE: 'nofault:rest:controller:middleware',
  CONTROLLER_FILTERS: 'nofault:rest:controller:filters',
  ROUTE_FILTERS: 'nofault:rest:route:filters',
  ROUTE_DTO: 'nofault:rest:route:dto',
} as const;

export function getControllerPath(target: Function): string {
  return (Reflect.getMetadata(REST_METADATA.CONTROLLER_PATH, target) as string | undefined) ?? '/';
}

export function getRoutes(target: Function): RouteMetadata[] {
  return (Reflect.getMetadata(REST_METADATA.ROUTES, target) as RouteMetadata[] | undefined) ?? [];
}