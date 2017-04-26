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

  get contentType(): string {
    return this.header('content-type') ?? '';
  }
}

/**
 * 响应包装：**延迟提交**（deferred commit）。
 *
 * 整个中间件管道期间只往缓冲区写状态码/头/体，
 * 等管道回到最外层时由框架统一 `commit()`。
 *
 * 这样中间件才能在 `await next()` **之后**再改响应头
 * ——否则业务 handler 一 `end()`，后面的中间件就什么都改不了了。
 * 这是 Koa 的经典做法，也是 `@UseMiddleware(timing)` 这类后置逻辑能生效的前提。
 */
export class RestResponse {
  private _status = 200;
  private readonly _headers = new Map<string, string>();
  private _body: string | Buffer | undefined;
  private _stream: Readable | undefined;
  private committed = false;

  constructor(public readonly raw: ServerResponse) {}

  /** 响应是否已不可再修改 */
  get headersSent(): boolean {
    return this.committed || this.raw.headersSent;
  }

  get statusCodeValue(): number {
    return this._status;
  }

  status(code: number): this {
    this._status = code;
    return this;
  }

  header(name: string, value: string): this {
    if (!this.committed) this._headers.set(name.toLowerCase(), value);
    return this;
  }

  removeHeader(name: string): this {
    this._headers.delete(name.toLowerCase());
    return this;
  }

  getHeader(name: string): string | undefined {
    return this._headers.get(name.toLowerCase());
  }

  /** 写入缓冲区（真正发出要等 commit） */
  buffer(payload: string | Buffer, contentType?: string): void {
    if (this.committed) return;
    this._body = payload;
    if (contentType) this._headers.set('content-type', contentType);
  }

  /**
   * 以流的方式发送 body（真正接线要等 commit，遵守延迟提交语义）。
   *
   * 大文件走这里：不把整个文件读进内存，背压交给 `pipeline`；
   * `contentLength` 已知时写进 content-length，客户端能提前显示进度。
   */
  stream(src: Readable, contentType?: string, contentLength?: number): void {
    if (this.committed) {
      src.destroy();
      return;
    }
    this._stream = src;
    this._body = undefined;
    if (contentType) this._headers.set('content-type', contentType);
    if (contentLength !== undefined) this._headers.set('content-length', String(contentLength));
  }

  json(payload: unknown): void {
    this.buffer(JSON.stringify(payload), 'application/json; charset=utf-8');
  }

  text(payload: string): void {
    this.buffer(payload, 'text/plain; charset=utf-8');
  }

  html(payload: string): void {
    this.buffer(payload, 'text/html; charset=utf-8');
  }

  /** 缓冲区里是否已经有 body（用于判断"handler 已经自己写过响应了"） */
  get hasBody(): boolean {
    return this._body !== undefined || this._stream !== undefined;
  }

  /** 空响应（204 / 304 用） */
  end(): void {
    if (this.committed) return;
    this._body = this._body ?? Buffer.alloc(0);
  }

  redirect(location: string, code = 302): void {
    this.status(code).header('location', location).end();
  }

  /** 把缓冲区一次性写到原生响应上；幂等 */
  commit(): void {
    if (this.committed) return;
    this.committed = true;
    const raw = this.raw;
    if (raw.headersSent || raw.writableEnded) return;

    raw.statusCode = this._status;
    for (const [k, v] of this._headers) raw.setHeader(k, v);

    const body = this._body ?? Buffer.alloc(0);
    // 204 / 304 不能带 content-length 与 body
    const noBody = this._status === 204 || this._status === 304;
    if (noBody) {