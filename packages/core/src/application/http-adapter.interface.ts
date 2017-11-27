import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * HTTP 请求处理函数（Node 原生签名）。
 *
 * 返回 `true` 表示"我已处理完这个请求"，处理链到此结束；
 * 返回 `false`/`undefined` 表示"我不管"，继续交给下一个 handler。
 */
export type HttpHandler = (
  req: IncomingMessage,
  res: ServerResponse,
) => void | boolean | Promise<void | boolean>;

/**
 * HTTP 适配器抽象。
 *
 * nofault 内核不绑定任何具体实现：v0.1.0 由 `@nofault/http` 提供 `node:http` 实现，
 * 后续版本可替换为 Fastify / uWebSockets / Bun 等适配器。
 */
export interface HttpAdapter {
  /** 挂载请求处理函数 */
  useHandler(handler: HttpHandler): void;
  /** 开始监听；返回实际监听的地址信息 */
  listen(port: number, hostname?: string): Promise<{ port: number; hostname: string }>;