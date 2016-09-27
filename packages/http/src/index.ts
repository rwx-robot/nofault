/**
 * @nofault/http —— 基于 `node:http` 的最小 HTTP 适配层（v0.1.0）。
 */
export { NodeHttpAdapter, createNodeAdapter } from './node-http-adapter';
export type { IncomingMessage, ServerResponse } from './node-http-adapter';