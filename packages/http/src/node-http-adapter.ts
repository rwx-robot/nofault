import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { HttpAdapter, HttpHandler } from '@nofault/core';

/**
 * 基于 Node.js 原生 `node:http` 的适配器。
 *
 * v0.1.0 的定位：**零第三方依赖**，只做三件事——挂载 handler、监听、优雅关闭。
 * 路由、中间件、校验等能力在 v0.2.0 的 `@nofault/rest` 中提供。
 */
export class NodeHttpAdapter implements HttpAdapter {
  private server?: Server;
  private handler: HttpHandler = (_req, res) => {
    res.statusCode = 404;
    res.end('404 Not Found');
  };
  private listening = false;
  /** 在途请求计数，用于优雅退出时等待排空 */
  private inflight = 0;
  private readonly drainWaiters: Array<() => void> = [];

  useHandler(handler: HttpHandler): void {
    this.handler = handler;
  }

  async listen(port: number, hostname = '0.0.0.0'): Promise<{ port: number; hostname: string }> {
    if (this.listening) {
      const addr = this.server?.address();
      const p = typeof addr === 'object' && addr ? addr.port : port;
      return { port: p, hostname };
    }

    this.server = createServer((req, res) => {
      this.inflight++;
      res.on('finish', () => this.onRequestFinished());
      res.on('close', () => this.onRequestFinished());
      Promise.resolve()
        .then(() => this.handler(req, res))
        .catch((err: unknown) => {
          if (!res.writableEnded) {
            res.statusCode = 500;
            res.end('500 Internal Server Error');
          }
          console.error('[nofault/http] unhandled error:', err);
        });
    });

    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject);
      this.server!.listen(port, hostname, () => resolve());
    });

    this.listening = true;
    const addr = this.server.address();
    const actualPort = typeof addr === 'object' && addr ? addr.port : port;
    return { port: actualPort, hostname };
  }