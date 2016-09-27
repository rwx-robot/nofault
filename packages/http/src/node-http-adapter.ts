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
      // 一次请求只能把 inflight 减一次。
      // finish（响应写完）与 close（连接关闭）在正常请求里**都会**触发，
      // 两个事件各减一次会让计数偏低，进而让优雅关闭在请求尚未真正排空时就 resolve。
      // 取先到者即可：正常走 finish，被中断的请求靠 close 兜住。
      let settled = false;
      const settle = (): void => {
        if (settled) return;
        settled = true;
        this.onRequestFinished();
      };
      res.on('finish', settle);
      res.on('close', settle);
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

  private onRequestFinished(): void {
    this.inflight = Math.max(0, this.inflight - 1);
    if (this.inflight === 0) {
      while (this.drainWaiters.length) this.drainWaiters.pop()!();
    }
  }

  /** 关闭：先停止接收新连接，再等待在途请求排空 */
  async close(): Promise<void> {
    if (!this.server || !this.listening) return;
    this.listening = false;
    await new Promise<void>((resolve) => {
      this.server!.close(() => resolve());
    });
    if (this.inflight > 0) {
      await new Promise<void>((resolve) => {
        this.drainWaiters.push(resolve);
        setTimeout(resolve, 5000).unref();
      });
    }
    this.server = undefined;
  }