import type { ServerResponse } from 'node:http';

/**
 * 极简响应工具。
 *
 * v0.1.0 只提供最常用的三个：JSON、文本、重定向。
 * 完整的内容协商在 v0.2.0 `@nofault/rest` 中实现。
 */

export function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {