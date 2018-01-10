import { generateRequestIds, generateSpanId } from './ids';
import type { TraceParent } from './ids';

export interface RequestContextInit {
  /** 自定义请求 ID；默认自动生成 */
  id?: string;
  /** 复用上游传下来的链路信息 */
  traceparent?: TraceParent;
  /** 附加数据 */
  values?: Record<string, unknown>;
}

/**
 * 一次请求的上下文。
 *
 * 请求级值传递用 Node 惯用法表达：
 * 显式对象 + `AsyncLocalStorage` 隐式传播，而不是把 ctx 当第一个参数到处传。