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
