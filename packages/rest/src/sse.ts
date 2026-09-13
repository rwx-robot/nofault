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
  /** 发送一个事件；data 为对象时自动 JSON 序列化，多行内容按 SSE 规范拆成多个 data 行 */
  send(event: string, data: unknown): void;
  /** 发送注释行（心跳用，防止代理把空闲连接掐断） */
  comment(text: string): void;
  /** 结束事件流并完成响应 */
  close(): void;
}

export function openSse(ctx: RestContext): SseWriter {
  const stream = new PassThrough();
  ctx.response.header('cache-control', 'no-cache');
  ctx.response.stream(stream, 'text/event-stream');
  ctx.response.status(200);

  const write = (chunk: string): void => {
    stream.write(chunk);
  };

  return {
    send(event: string, data: unknown): void {
      const payload = typeof data === 'string' ? data : JSON.stringify(data);
      const lines = payload
        .split('\n')
        .map((line) => `data: ${line}`)
        .join('\n');
      write(`event: ${event}\n${lines}\n\n`);
    },