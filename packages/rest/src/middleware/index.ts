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
