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
  const frameOptions = options.frameOptions ?? 'SAMEORIGIN';
  const hsts = options.hsts === true;

  return async (ctx, next) => {
    const res = ctx.response;
    res.header('x-content-type-options', 'nosniff');
    res.header('x-frame-options', frameOptions);
    res.header('referrer-policy', 'no-referrer');
    res.header('x-xss-protection', '0');
    if (csp !== false) {
      res.header('content-security-policy', csp);
    }
    if (hsts) {
      res.header('strict-transport-security', 'max-age=15552000; includeSubDomains');
    }
    await next();
  };
}

/** 请求耗时与访问日志 */
export function requestLogger(log: (msg: string, fields?: Record<string, unknown>) => void): Middleware {
  return async (ctx, next) => {
    const start = process.hrtime.bigint();
    let status = 200;
    try {
      await next();
    } finally {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      status = ctx.response.statusCodeValue;
      log(`${ctx.request.method} ${ctx.request.path}`, {
        status,
        ms: Number(ms.toFixed(2)),
        ip: ctx.request.ip,
      });
    }
  };
}

export interface StaticOptions {
  /** 磁盘根目录 */
  root: string;
  /** URL 前缀，默认 `/` */
  prefix?: string;
  /** 是否允许路径穿越（默认禁止） */
  allowTraversal?: boolean;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

/** 静态资源：命中则直接返回，未命中继续走路由 */
export function serveStatic(options: StaticOptions): Middleware {
  const root = options.root;
  const prefix = options.prefix ?? '/';

  return async (ctx, next) => {
    const p = ctx.request.path;
    if (!p.startsWith(prefix)) {
      await next();
      return;
    }
    const rel = p.slice(prefix.length).replace(/^\/+/, '');
    if (!options.allowTraversal && rel.includes('..')) {
      throw new BadRequestException('Invalid path');
    }
    const file = join(root, normalize(rel));
    const stat = existsSync(file) ? statSync(file) : undefined;
    if (!file.startsWith(root) || !stat?.isFile()) {
      if (p.endsWith('/')) throw new NotFoundException(`Static file not found: ${p}`);
      await next();
      return;
    }
    // 流式发送：不把整个文件读进内存，背压交给 pipeline（`ctx.response.stream` 在 commit 时接线）
    ctx.response.stream(
      createReadStream(file),
      MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
      stat.size,
    );
    ctx.response.status(200);
  };
}

/** 简单的内存限流（单机版；分布式限流在 v0.7.0 提供） */
export function rateLimit(options: { windowMs: number; max: number }): Middleware {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return async (ctx, next) => {