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