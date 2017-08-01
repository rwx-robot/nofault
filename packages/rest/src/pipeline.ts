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