/**
 * 链路追踪：Span + 采样 + 导出。
 *
 * 与 v0.3.0 的关系：那时只做 traceId **透传**（日志能串起来），
 * 这一版补上"上报"——每个 Span 有开始/结束、时长、属性、状态，
 * 完成后交给 Exporter。
 *
 * 三条纪律：
 * 1. **采样必须在创建 Span 时决定**（`shouldSample` 在 start 阶段调用）。
 *    先建 Span 再丢弃，等于白花了一整条链路的开销
 * 2. **只有结束的 Span 才会被导出**；未结束的 Span 必然是 bug 或进程被杀
 * 3. 默认导出器是**内存**的：可观测性不该要求先装一套后端才跑得起来
 */
import { currentContext } from '@nofault/context';

/** 请求上下文里"当前正在进行的 Span"的键 */
export const ACTIVE_SPAN = 'telemetry.activeSpan';

export type SpanKind = 'server' | 'client' | 'internal';

export interface SpanAttributes {
  [key: string]: string | number | boolean | undefined;
}

export interface FinishedSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: SpanKind;
  /** 起点：epoch 毫秒，带小数（小数部分来自 `performance.now()`） */
  startTimeMs: number;
  /** 耗时：毫秒，带小数——亚毫秒的 Span 不会被抹平成 0 */
  durationMs: number;
  attributes: SpanAttributes;
  status: 'ok' | 'error';
  error?: string;
}

export interface Exporter {
  export(spans: FinishedSpan[]): Promise<void> | void;
}

/** 采样器：返回 true 表示这条链路要记 */