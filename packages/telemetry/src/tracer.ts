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
  startTimeMs: number;
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
  private readonly startTime = Date.now();
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
      else ctx.delete(ACTIVE_SPAN);
    }
    const finished: FinishedSpan = {
      traceId: this.traceId,
      spanId: this.spanId,
      parentSpanId: this.parentSpanId,
      name: this.name,
      kind: this.kind,
      startTimeMs: this.startTime,
      durationMs: Date.now() - this.startTime,
      attributes: this.attributes,
      status: this.status,
      error: this.error,
    };
    this.tracer.finish(finished);
  }

  setAttributes(attributes: SpanAttributes): this {
    Object.assign(this.attributes, attributes);
    return this;
  }

  setError(err: unknown): this {
    this.status = 'error';
    this.error = err instanceof Error ? err.message : String(err);
    return this;
  }
}

export class Tracer {
  private readonly buffer: FinishedSpan[] = [];
  private readonly idBuffer = new Uint8Array(24);
  private idCounter = 0;

  constructor(
    private readonly exporter: Exporter,
    private readonly sampler: Sampler = alwaysSample,
    /** 缓冲多少条后批量导出 */
    private readonly batchSize = 64,
  ) {}

  /**
   * 一次随机填充同时产出 traceId 与 spanId。
   *
   * 分开填两次要 ~9µs，一次只要 ~4µs —— ID 生成占"起一个 Span"成本的大头，
   * 减半它是这里唯一值得做的优化。
   */
  newIds(): { traceId: string; spanId: string } {
    this.idCounter += 1;
    randomFill(this.idBuffer);
    return {
      traceId: toHex(this.idBuffer.subarray(0, 16)),
      spanId: toHex(this.idBuffer.subarray(16)),
    };
  }

  newTraceId(): string {
    return this.newIds().traceId;
  }

  newSpanId(): string {
    return this.newIds().spanId;
  }

  /**
   * 起一个 Span。
   *
   * **不采样时返回 null**，调用方要用 `span?.end()` 的写法——
   * 这看起来不如"返回一个空实现的 Span"优雅，
   * 但它保证了不采样时**真的不花一点开销**。
   */
  startSpan(name: string, kind: SpanKind = 'internal', context?: { traceId: string; spanId: string; parentSpanId?: string }): Span | null {
    if (!this.sampler()) return null;
    return new Span(name, this, kind, context);
  }

  /** 包一层：自动 end，并在抛错时标记 error */
  async trace<T>(name: string, fn: (span: Span | null) => Promise<T>, kind: SpanKind = 'internal'): Promise<T> {
    const span = this.startSpan(name, kind);
    try {
      const result = await fn(span);
      return result;
    } catch (err) {
      span?.setError(err);
      throw err;
    } finally {
      span?.end();
    }
  }

  finish(span: FinishedSpan): void {
    this.buffer.push(span);
    if (this.buffer.length >= this.batchSize) void this.flush();
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const batch = this.buffer.splice(0, this.buffer.length);
    await this.exporter.export(batch);
  }

  get pendingCount(): number {
    return this.buffer.length;
  }
}

/** 内存导出器：测试与示例用，也便于"先跑起来再接后端" */
export class InMemoryExporter implements Exporter {
  readonly spans: FinishedSpan[] = [];

  export(spans: FinishedSpan[]): void {
    this.spans.push(...spans);
  }

  reset(): void {
    this.spans.length = 0;
  }

  byName(name: string): FinishedSpan[] {
    return this.spans.filter((s) => s.name === name);
  }
}

/** 0x00~0xff 的十六进制字符串。查表比 `toString(16).padStart(2,'0')` 快一倍多 */
const HEX: readonly string[] = Array.from({ length: 256 }, (_, i) =>
  i.toString(16).padStart(2, '0'),
);

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += HEX[bytes[i]!];
  return out;
}

function randomFill(buffer: Uint8Array): void {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj?.getRandomValues) {
    cryptoObj.getRandomValues(buffer);
    return;
  }
  for (let i = 0; i < buffer.length; i++) buffer[i] = Math.floor(Math.random() * 256);
}
