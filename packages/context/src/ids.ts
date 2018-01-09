/**
 * 追踪标识生成：兼容 W3C Trace Context（`traceparent`）。
 *
 * 格式：`00-<32 hex traceId>-<16 hex spanId>-<2 hex flags>`
 *
 * 为什么现在就做：v0.8.0 才上完整链路追踪，但 traceId 必须在**请求入口**就生成好，
 * 否则日志里永远补不上——日志一旦写出去就是既成事实。
 */

const HEX = '0123456789abcdef';

function randomHex(length: number): string {
  const bytes = new Uint8Array(length / 2);
  // 用 crypto 而不是 Math.random：traceId 需要足够随机且不阻塞
  const cryptoObj = globalThis.crypto;
  if (cryptoObj?.getRandomValues) {
    cryptoObj.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let out = '';
  for (const b of bytes) {
    out += HEX[(b >> 4) & 0xf];
    out += HEX[b & 0xf];
  }
  return out;
}

/** 32 位十六进制 traceId */
export function generateTraceId(): string {
  return randomHex(32);
}

/** 16 位十六进制 spanId */
export function generateSpanId(): string {
  return randomHex(16);
}

/** 短请求 ID（日志里人读友好），如 `req_9f3c1a2b` */
export function generateRequestId(): string {
  return `req_${randomHex(8)}`;
}

export interface RequestIds {
  requestId: string;
  traceId: string;
  spanId: string;
}

/**