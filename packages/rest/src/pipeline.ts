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