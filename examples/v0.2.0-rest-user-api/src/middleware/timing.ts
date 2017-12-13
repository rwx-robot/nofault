import type { Middleware } from '@nofault/rest';

/**
 * 极简耗时中间件：演示洋葱模型的"前后夹击"。
 *
 * ```ts
 * const t = Date.now();
 * await next();        // 进入内层
 * // 回来后再写响应头