import { generateRequestIds, generateSpanId } from './ids';
import type { TraceParent } from './ids';

export interface RequestContextInit {
  /** 自定义请求 ID；默认自动生成 */
  id?: string;
  /** 复用上游传下来的链路信息 */
  traceparent?: TraceParent;
  /** 附加数据 */