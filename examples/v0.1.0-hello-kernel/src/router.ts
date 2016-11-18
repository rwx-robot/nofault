import type { IncomingMessage, ServerResponse } from 'node:http';
import type { HttpHandler } from '@nofault/core';
import { sendJson, sendText } from '@nofault/http';
import type { GreeterService } from './greeter.service';

/**
 * v0.1.0 的路由：手写 switch。
 *
 * 这是**故意**的——v0.1.0 只交付内核，路由树与装饰器路由属于 v0.2.0 的 `@nofault/rest`。
 * 保留这一层手写实现，正好作为下一版本重构前的"基线"。
 */
export function createRouter(greeter: GreeterService): HttpHandler {
  return (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const path = url.pathname;

    if (req.method === 'GET' && path === '/') {
      sendText(res, 200, 'nofault v0.1.0 hello-kernel. Try GET /hello?name=world or GET /health\n');