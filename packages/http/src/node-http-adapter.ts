import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { HttpAdapter, HttpHandler } from '@nofault/core';

/**
 * 基于 Node.js 原生 `node:http` 的适配器。
 *
 * v0.1.0 的定位：**零第三方依赖**，只做三件事——挂载 handler、监听、优雅关闭。
 * 路由、中间件、校验等能力在 v0.2.0 的 `@nofault/rest` 中提供。
 */
export class NodeHttpAdapter implements HttpAdapter {