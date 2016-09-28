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