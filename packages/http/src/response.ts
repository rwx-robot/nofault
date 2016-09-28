import type { ServerResponse } from 'node:http';

/**
 * 极简响应工具。
 *
 * v0.1.0 只提供最常用的三个：JSON、文本、重定向。
 * 完整的内容协商在 v0.2.0 `@nofault/rest` 中实现。
 */

export function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  const payload = JSON.stringify(body);
  if (!res.headersSent) {
    res.statusCode = statusCode;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('content-length', Buffer.byteLength(payload));
  }
  res.end(payload);
}

export function sendText(res: ServerResponse, statusCode: number, text: string): void {
  if (!res.headersSent) {
    res.statusCode = statusCode;
    res.setHeader('content-type', 'text/plain; charset=utf-8');
    res.setHeader('content-length', Buffer.byteLength(text));
  }
  res.end(text);
}

export function redirect(res: ServerResponse, statusCode: number, location: string): void {
  res.statusCode = statusCode;
  res.setHeader('location', location);
  res.end();
}

/** 读取请求体（JSON），带大小上限，防止被超大 body 打爆 */
export async function readJsonBody(req: import('node:http').IncomingMessage, limitBytes = 1024 * 1024): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    size += buf.length;
    if (size > limitBytes) {
      throw new Error(`Request body too large (limit ${limitBytes} bytes)`);
    }
    chunks.push(buf);