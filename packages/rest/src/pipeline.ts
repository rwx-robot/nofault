import { RestContext, RestRequest, RestResponse } from './http/context';
import { BadRequestException, HttpException } from './errors/http-exception';
import { ParamSource, getParams, type ParamMetadata } from './metadata';
import { getRouteDto } from './decorators';
import { validateDto, coerceDtoFields, type ValidationError } from './validation';

/**
 * 中间件签名：洋葱模型。
 *
 * ```ts
 * const timing: Middleware = async (ctx, next) => {
 *   const t = Date.now();
 *   await next();
 *   ctx.response.header('x-response-time', String(Date.now() - t));
 * };
 * ```
 */
export type Middleware = (ctx: RestContext, next: () => Promise<void>) => Promise<void> | void;

/** 把中间件数组折叠成单个执行函数（经典的 compose） */
export function composeMiddleware(middleware: Middleware[]): (ctx: RestContext, final: () => Promise<void>) => Promise<void> {
  return async (ctx, final) => {
    let index = -1;
    const dispatch = async (i: number): Promise<void> => {
      if (i <= index) throw new Error('next() called multiple times');
      index = i;
      const fn = i === middleware.length ? final : middleware[i];
      if (!fn) return;
      await fn(ctx, () => dispatch(i + 1));
    };
    await dispatch(0);
  };
}

/** 拦截器：在 handler 前后插入逻辑，可改写结果 */
export interface Interceptor {
  intercept(ctx: RestContext, next: () => Promise<unknown>): Promise<unknown>;
}

// ------------------------------------------------------------------ 参数绑定

function coerce(value: string, type: unknown): unknown {
  if (type === Number) {
    const n = Number(value);
    if (Number.isNaN(n)) throw new BadRequestException(`Cannot convert "${value}" to number`);
    return n;
  }
  if (type === Boolean) return value === 'true' || value === '1';
  return value;
}

function pick(source: ParamSource, ctx: RestContext, key?: string): unknown {
  const req = ctx.request;
  switch (source) {
    case ParamSource.PARAM:
      return key ? req.params[key] : { ...req.params };
    case ParamSource.QUERY:
      return key ? (req.query.get(key) ?? undefined) : Object.fromEntries(req.query.entries());
    case ParamSource.BODY:
      if (!key) return req.body;
      return (req.body as Record<string, unknown> | undefined)?.[key];
    case ParamSource.HEADERS:
      return key ? req.header(key) : req.headers;
    case ParamSource.REQUEST:
      return req;
    case ParamSource.RESPONSE:
      return ctx.response;
    case ParamSource.CONTEXT:
      return ctx;
    case ParamSource.RAW_REQUEST:
      return req.raw;
    case ParamSource.RAW_RESPONSE:
      return ctx.response.raw;
    default:
      return undefined;
  }
}

/**
 * 按方法签名解析实参。
 *
 * 顺序必须与装饰器声明顺序一致（TS 的 `design:paramtypes` 顺序即参数顺序）。
 */
/** 只需要 propertyKey，放宽类型以便复用（ResolvedRoute / RouteMetadata 都能传） */
type RouteLike = { propertyKey: string | symbol };

/**
 * 参数元数据缓存。
 *
 * `Reflect.getMetadata` + `sort()` 是**每请求**都要走的路径，
 * 在热路径上反复做反射查询开销可观（实测占 POST 场景不小比例），
 * 因此按 (target, propertyKey) 记忆化一次。
 */
const paramCache = new WeakMap<object, Map<string | symbol, ParamMetadata[]>>();

function cachedParams(target: object, propertyKey: string | symbol): ParamMetadata[] {