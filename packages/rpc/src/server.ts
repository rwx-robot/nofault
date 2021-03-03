/**
 * RPC 服务端。
 *
 * 职责边界很清楚：**收帧 → 找方法 → 调用 → 回帧**。
 * 不做序列化框架、不做服务治理（那是 v0.7.0 的事）。
 *
 * 两个容易写错的地方：
 * 1. 每个连接需要一个独立的 FrameReader —— 帧状态是**连接级**的
 * 2. handler 抛错必须回一个带 error 的响应，而不是断开连接；
 *    断连会让客户端分不清"服务挂了"和"业务报错"
 */
import { createServer, type Server, type Socket } from 'node:net';
import type { RpcRequest, RpcResponse } from './protocol';
import { FrameReader, JsonCodec, RPC_ERROR, RpcError, DEFAULT_MAX_FRAME_BYTES, isAsyncIterable } from './protocol';
import type { Interceptor } from './interceptor';
import { composeInterceptors } from './interceptor';

export interface RpcContext {
  request: RpcRequest;
  /** 远端地址（日志与审计用） */
  remote?: string;
}

export type Handler = (payload: unknown, ctx: RpcContext) => unknown | Promise<unknown>;

export interface RpcServerOptions {
  host?: string;
  port?: number;
  interceptors?: Interceptor[];
  maxFrameBytes?: number;
  logger?: { info(message: string, fields?: Record<string, unknown>): void; error(message: string, fields?: Record<string, unknown>): void };
}

export class RpcServer {
  private readonly handlers = new Map<string, Handler>();
  private readonly codec: JsonCodec;
  private readonly interceptors: Interceptor[];
  private readonly maxFrameBytes: number;
  private server?: Server;
  private listening = false;

  constructor(private readonly options: RpcServerOptions = {}) {
    this.codec = new JsonCodec(options.maxFrameBytes ?? DEFAULT_MAX_FRAME_BYTES);
    this.interceptors = options.interceptors ?? [];
    this.maxFrameBytes = options.maxFrameBytes ?? DEFAULT_MAX_FRAME_BYTES;
  }

  /** 注册一个方法；key 是 `service.method` */
  register(service: string, method: string, handler: Handler): this {
    this.handlers.set(`${service}.${method}`, handler);
    return this;
  }

  /** 注册整个服务对象（方法名即 RPC 方法名） */
  registerService(name: string, instance: object, methods?: string[]): this {
    const proto = Object.getPrototypeOf(instance) as object;
    const names =
      methods ??
      Object.getOwnPropertyNames(proto).filter(
        (key) => key !== 'constructor' && typeof (instance as Record<string, unknown>)[key] === 'function',
      );
    for (const method of names) {
      const fn = (instance as Record<string, unknown>)[method];
      if (typeof fn !== 'function') continue;
      this.register(name, method, (payload, ctx) =>
        Promise.resolve((fn as Handler).call(instance, payload, ctx)),
      );
    }
    return this;
  }

  get methodNames(): string[] {
    return [...this.handlers.keys()];
  }

  async listen(port = this.options.port ?? 0, host = this.options.host ?? '127.0.0.1'): Promise<{ port: number }> {
    if (this.listening) throw new Error('RpcServer is already listening');
    this.server = createServer((socket) => this.onConnection(socket));
    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject);
      this.server!.listen(port, host, () => resolve());
    });
    this.listening = true;
    const address = this.server.address();
    const actualPort = typeof address === 'object' && address ? address.port : port;
    this.options.logger?.info('rpc server listening', { port: actualPort, host });
    return { port: actualPort };
  }

  async close(): Promise<void> {
    if (!this.server || !this.listening) return;
    await new Promise<void>((resolve) => {
      this.server!.close(() => resolve());
    });
    this.listening = false;
  }

  private onConnection(socket: Socket): void {
    // 每个连接一个 FrameReader：帧状态绝不能跨连接共享
    const reader = new FrameReader(this.maxFrameBytes);
    const remote = `${socket.remoteAddress}:${socket.remotePort}`;

    socket.on('data', (chunk) => {
      let frames: Buffer[];
      try {
        frames = reader.push(chunk);
      } catch (err) {
        this.options.logger?.error('bad frame', { remote, message: String(err) });
        socket.destroy();
        return;
      }
      for (const frame of frames) void this.handleFrame(frame, socket, remote);
    });

    socket.on('error', () => {
      /* 连接断开是常态，记日志即可，不该抛 */
    });
  }

  private async handleFrame(frame: Buffer, socket: Socket, remote: string): Promise<void> {
    let request: RpcRequest;
    try {
      request = this.codec.decode(frame) as RpcRequest;
    } catch {
      this.reply(socket, { id: '', ok: false, error: { code: RPC_ERROR.PARSE, message: 'invalid JSON' } });
      return;
    }

    if (!request || typeof request.service !== 'string' || typeof request.method !== 'string') {
      this.reply(socket, {
        id: request?.id ?? '',
        ok: false,
        error: { code: RPC_ERROR.BAD_REQUEST, message: 'malformed request' },
      });