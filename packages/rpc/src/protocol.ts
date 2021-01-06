/**
 * 协议与分帧。
 *
 * **为什么是"长度前缀 + JSON"**：TCP 是字节流，没有消息边界。
 * 不自己分帧就会出现"粘包/半包"——表现为偶发的 JSON 解析失败，
 * 而且只在负载稍大时才复现，是最难查的一类网络 bug。
 *
 * 帧格式：`[4 字节大端长度][JSON body]`。
 * 长度前缀还带来一个副作用：可以在读满整帧**之前**就知道要分配多少内存，
 * 顺便挡住"超大帧把内存打爆"（`maxFrameBytes`）。
 */
export interface RpcRequest {
  /** 请求 ID，用于把响应对回请求（同一个连接上会并发多个调用） */
  id: string;
  service: string;
  method: string;
  payload: unknown;
  /** 链路追踪透传（v0.3.0 的 traceId 在这里接续） */
  traceId?: string;
}

export interface RpcResponse {
  id: string;
  ok: boolean;
  result?: unknown;
  error?: { code: number; message: string };
  /**
   * 流式中间帧（服务端流）：带 `chunk` 的帧逐条推送，
   * 末帧仍是不带 `result` 的正常响应。一元调用的 JSON 里不会出现这个键
   */
  chunk?: unknown;
}

/** 服务端流判定：只有 AsyncIterable 触发流式（数组等普通 Iterable 保持一元语义） */
export function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] === 'function'
  );
}

export const DEFAULT_MAX_FRAME_BYTES = 8 * 1024 * 1024;

export interface Codec {
  encodeRequest(req: RpcRequest): Buffer;
  encodeResponse(res: RpcResponse): Buffer;
  decode(chunk: Buffer): unknown;
}

export class RpcError extends Error {
  constructor(
    public readonly code: number,
    message: string,
  ) {
    super(message);
    this.name = 'RpcError';
  }
}

export const RPC_ERROR = {
  PARSE: -32700,
  BAD_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  HANDLER: -32000,
  TIMEOUT: -32001,
  UNREACHABLE: -32002,
} as const;

export class JsonCodec implements Codec {
  constructor(private readonly maxFrameBytes: number = DEFAULT_MAX_FRAME_BYTES) {}

  encodeRequest(req: RpcRequest): Buffer {
    return this.frame(req);
  }

  encodeResponse(res: RpcResponse): Buffer {
    return this.frame(res);
  }

  decode(chunk: Buffer): unknown {
    return JSON.parse(chunk.toString('utf8')) as unknown;
  }

  private frame(value: unknown): Buffer {
    const body = Buffer.from(JSON.stringify(value), 'utf8');
    if (body.length > this.maxFrameBytes) {
      throw new RpcError(RPC_ERROR.BAD_REQUEST, `frame too large: ${body.length} bytes`);
    }
    const header = Buffer.alloc(4);
    header.writeUInt32BE(body.length, 0);
    return Buffer.concat([header, body]);
  }
}

/**
 * 把字节流还原成一条条完整消息。
 *
 * keep 一个内部缓冲区：收到半帧时什么都不吐，等下一块数据补齐。
 */
export class FrameReader {
  private buffer = Buffer.alloc(0);

  constructor(private readonly maxFrameBytes: number = DEFAULT_MAX_FRAME_BYTES) {}

  push(chunk: Buffer): Buffer[] {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const frames: Buffer[] = [];

    while (this.buffer.length >= 4) {
      const length = this.buffer.readUInt32BE(0);
      if (length > this.maxFrameBytes) {
        // 非法长度：丢掉缓冲区，避免后续全部错位
        this.buffer = Buffer.alloc(0);
        throw new RpcError(RPC_ERROR.PARSE, `frame too large: ${length} bytes`);
      }
      if (this.buffer.length < 4 + length) break;
      frames.push(this.buffer.subarray(4, 4 + length));
      this.buffer = this.buffer.subarray(4 + length);
    }
    return frames;
  }

  get pendingBytes(): number {
    return this.buffer.length;
  }
}
