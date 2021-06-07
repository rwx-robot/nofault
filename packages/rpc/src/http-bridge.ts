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