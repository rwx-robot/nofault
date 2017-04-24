import type { IncomingMessage, ServerResponse } from 'node:http';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';

/**
 * 请求/响应包装。
 *
 * 为什么不直接暴露 `IncomingMessage`：
 * 1. 业务代码不该关心 Node 原生细节（可测试性 + 未来换适配器）
 * 2. 路由参数、已解析的 query/body 需要有个统一的挂点
 */
export class RestRequest {
  /** 已解析的路径参数（来自路由模板） */
  public params: Record<string, string> = {};
  /** 已解析的 body（由 BodyParser 中间件填充） */
  public body: unknown;
  /** 中间件之间传递数据的临时袋 */
  public readonly state = new Map<string, unknown>();

  constructor(public readonly raw: IncomingMessage) {}

  get method(): string {
    return (this.raw.method ?? 'GET').toUpperCase();
  }

  get url(): string {
    return this.raw.url ?? '/';
  }

  /** 不含 query 的路径部分 */
  get path(): string {
    const q = this.url.indexOf('?');
    return q === -1 ? this.url : this.url.slice(0, q);
  }

  get headers(): Record<string, string | string[] | undefined> {
    return this.raw.headers as Record<string, string | string[] | undefined>;
  }

  header(name: string): string | undefined {
    const v = this.raw.headers[name.toLowerCase()];
    return Array.isArray(v) ? v[0] : v;
  }

  get query(): URLSearchParams {
    return new URL(this.url, `http://${this.raw.headers.host ?? 'localhost'}`).searchParams;
  }

  get ip(): string {
    return (this.header('x-forwarded-for') ?? this.raw.socket.remoteAddress ?? '').split(',')[0]!.trim();
  }
