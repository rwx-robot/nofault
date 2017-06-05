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
  const limit = options.limit ?? 1024 * 1024;
  const types = options.types ?? ['application/json', 'application/x-www-form-urlencoded', 'text/plain'];

  return async (ctx, next) => {
    const method = ctx.request.method;
    if (method === 'GET' || method === 'HEAD' || method === 'DELETE') {
      await next();
      return;
    }
    const ct = ctx.request.contentType.split(';')[0]!.trim();
    if (!types.includes(ct)) {
      await next();
      return;
    }

    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of ctx.request.raw) {
      const buf = chunk as Buffer;
      size += buf.length;
      if (size > limit) throw new BadRequestException(`Request body too large (limit ${limit} bytes)`);
      chunks.push(buf);
    }
    const raw = Buffer.concat(chunks).toString('utf8');

    if (raw.length === 0) {
      ctx.request.body = undefined;
    } else if (ct === 'application/json') {
      try {
        ctx.request.body = JSON.parse(raw) as unknown;
      } catch {
        throw new BadRequestException('Invalid JSON body');
      }
    } else if (ct === 'application/x-www-form-urlencoded') {
      ctx.request.body = Object.fromEntries(new URLSearchParams(raw).entries());
    } else {
      ctx.request.body = raw;
    }

    await next();
  };
}

export interface SecurityHeadersOptions {
  /** 关闭CSP（默认给出安全但不影响开发的策略） */
  contentSecurityPolicy?: string | false;
  hsts?: boolean;
  frameOptions?: string;
}

/** 安全响应头（Helmet 的最小子集） */
export function securityHeaders(options: SecurityHeadersOptions = {}): Middleware {
  // 在闭包外先收窄，闭包内 TS 无法保持对对象属性的类型收窄
  const csp = options.contentSecurityPolicy === undefined ? "default-src 'self'" : options.contentSecurityPolicy;