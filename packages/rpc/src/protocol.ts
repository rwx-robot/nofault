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
