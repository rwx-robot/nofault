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
export interface Sampler {
  (): boolean;
}

export const alwaysSample: Sampler = () => true;
export const neverSample: Sampler = () => false;

/** 按比例采样（0~1） */
export function ratioSampler(ratio: number): Sampler {
  const clamped = Math.max(0, Math.min(1, ratio));
  return () => Math.random() < clamped;
}

export class Span {
  readonly name: string;
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
  readonly attributes: SpanAttributes = {};
  private finished = false;
  /**
   * 计时用 `performance.now()` 而不是 `Date.now()`：
   * - 它是**单调**的，不受系统时钟调整影响；
   * - 它是**亚毫秒**精度的。`Date.now()` 只有毫秒，亚毫秒级的 Span
   *   会被统统记成 0ms——缓存命中、本地方法调用这类正好是最该被观测的短 Span。
   */
  private readonly startedAt = performance.now();
  /**
   * 墙上时钟起点（epoch 毫秒，带小数）。导出器要用它算绝对时间，
   * 所以不能只留相对值；小数部分让 OTLP 的 nanos 换算不至于丢精度。
   */
  private readonly startedWallMs = performance.timeOrigin + this.startedAt;
  private status: 'ok' | 'error' = 'ok';
  private error?: string;
  private readonly previousActive: Span | undefined;

  constructor(
    name: string,
    private readonly tracer: Tracer,
    readonly kind: SpanKind = 'internal',
    context?: { traceId: string; spanId: string; parentSpanId?: string },
  ) {
    this.name = name;
    // 优先复用 v0.3.0 请求上下文里的 traceId：HTTP → RPC → 日志 全串起来
    const ctx = currentContext();
    const active = ctx?.get<Span>(ACTIVE_SPAN);
    const fromContext = context?.traceId ?? ctx?.traceId;
    // 只有真的缺的时候才做随机填充：ID 生成是起一个 Span 最贵的部分（见 randomHex）
    if (fromContext !== undefined && context?.spanId !== undefined) {
      this.traceId = fromContext;
      this.spanId = context.spanId;
    } else {
      const ids = tracer.newIds();
      this.traceId = fromContext ?? ids.traceId;
      this.spanId = context?.spanId ?? ids.spanId;
    }
    // 父 Span 的优先级：显式传入 > 上下文里正在进行的 Span > 上游传来的 parent
    this.parentSpanId = context?.parentSpanId ?? active?.spanId ?? ctx?.parentSpanId;

    // 把自己登记为"当前 Span"，并记下旧的以便结束时还原（Span 会嵌套）
    this.previousActive = active;
    ctx?.set(ACTIVE_SPAN, this);
  }

  /** 结束 Span 并交给导出器。重复调用会被忽略 */
  end(): void {
    if (this.finished) return;
    this.finished = true;
    // 还原"当前 Span"：嵌套结构下，父 Span 结束后必须回到它自己的父
    const ctx = currentContext();
    if (ctx?.get(ACTIVE_SPAN) === this) {
      if (this.previousActive) ctx.set(ACTIVE_SPAN, this.previousActive);