import { PassThrough } from 'node:stream';
import type { RestContext } from './http/context';

/**
 * Server-Sent Events（SSE）出口。
 *
 * 为什么建在 `RestResponse.stream()` 之上：SSE 本质就是一条
 * `text/event-stream` 的只读流——分帧、延迟提交、背压全部复用既有机制，
 * 这里只负责把消息编成 SSE 的线格式（`event:` + 多行 `data:` + 空行）。
 *
 * 用法（合成路由或拿到 ctx 的 handler）：
 * ```ts
 * const sse = openSse(ctx);
 * sse.send('tick', { n: 1 });
 * sse.close(); // 结束响应
 * ```
 */
export interface SseWriter {