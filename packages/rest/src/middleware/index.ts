import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import type { Middleware } from '../pipeline';
import { RestContext } from '../http/context';
import { BadRequestException, NotFoundException } from '../errors/http-exception';

/**
 * 内置中间件集合。
 *
 * 每个都是**纯函数**，符合 `(ctx, next) => Promise<void>` 签名，
 * 与用户自定义中间件完全同构——没有特权代码路径。
 */

export interface CorsOptions {
  origin?: string | string[] | boolean;
  methods?: string[];
  headers?: string[];
  credentials?: boolean;
  maxAge?: number;
}

/** CORS：预检请求直接返回，不再进入后续管道 */
export function cors(options: CorsOptions = {}): Middleware {
  const allowOrigin = options.origin ?? '*';
  const allowMethods = (options.methods ?? ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']).join(',');
  const allowHeaders = (options.headers ?? ['content-type', 'authorization']).join(',');
  const maxAge = String(options.maxAge ?? 86400);

  return async (ctx, next) => {
    const reqOrigin = ctx.request.header('origin');
    const originValue: string =
      allowOrigin === true
        ? (reqOrigin ?? '*')
        : Array.isArray(allowOrigin)
          ? (reqOrigin && allowOrigin.includes(reqOrigin) ? reqOrigin : 'null')
          : allowOrigin === false
            ? 'null'
            : allowOrigin;

    ctx.response.header('access-control-allow-origin', originValue);
    if (options.credentials) ctx.response.header('access-control-allow-credentials', 'true');
    ctx.response.header('access-control-allow-methods', allowMethods);
    ctx.response.header('access-control-allow-headers', allowHeaders);
    ctx.response.header('access-control-max-age', maxAge);

    if (ctx.request.method === 'OPTIONS') {
      ctx.response.status(204).end();
      return;
    }
    await next();
  };
}

export interface BodyParserOptions {
  /** 大小上限（字节），默认 1MB */
  limit?: number;
  /** 允许的 content-type 前缀 */
  types?: string[];
}

/** Body 解析：JSON / urlencoded / text */
export function bodyParser(options: BodyParserOptions = {}): Middleware {