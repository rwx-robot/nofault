/**
 * RPC 错误 → HTTP 状态的映射。
 *
 * 为什么单独抽出来：每个 HTTP 网关都要做一次这件事，
 * 各写一遍的结果是"同一个超时，有的返回 500、有的返回 502"，
 * 排查时只能靠猜。放在这里，语义只有一份。
 *
 * 注意它**不依赖 @nofault/rest**——只返回状态码与消息，
 * 具体怎么抛由调用方决定（保持 rpc 包对 Web 层无感知）。
 */
import { RpcError, RPC_ERROR } from './protocol';

export interface HttpStatusMapping {
  status: number;
  message: string;
}

export function rpcErrorToStatus(err: unknown): HttpStatusMapping {
  if (!(err instanceof RpcError)) {
    return { status: 500, message: err instanceof Error ? err.message : String(err) };
  }

  // 业务自定义码（4xx/5xx 段）原样透出：码是契约，不该被框架吃掉
  if (err.code >= 400 && err.code < 600) {
    return { status: err.code, message: err.message };
  }

  switch (err.code) {
    case RPC_ERROR.TIMEOUT:
      // 504 才是"上游超时"的正确语义；502 表示"收到了无效响应"