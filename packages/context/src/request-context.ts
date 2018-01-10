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
 *
 * 它同时扮演两个角色：
 * 1. **请求级数据袋**（`set` / `get`）
 * 2. **内核 REQUEST 作用域的 contextId**（对象身份即 key）
 */
export class RequestContext {
  /** 人读友好的请求 ID */
  public readonly id: string;
  /** W3C traceId（32 hex） */
  public readonly traceId: string;
  /** W3C spanId（16 hex） */
  public readonly spanId: string;
  /** 上游传下来的父 spanId */
  public readonly parentSpanId?: string;
  /** 是否采样（影响日志与追踪是否落盘） */
  public readonly sampled: boolean;
  /** 创建时间（毫秒，hrtime） */
  public readonly startedAt: number;

  private readonly values = new Map<string, unknown>();

  constructor(init: RequestContextInit = {}) {
    if (init.id && init.traceparent) {
      this.id = init.id;
      this.traceId = init.traceparent.traceId;
      this.spanId = generateSpanId();
    } else {
      const ids = generateRequestIds();
      this.id = init.id ?? ids.requestId;
      this.traceId = init.traceparent?.traceId ?? ids.traceId;
      this.spanId = ids.spanId;
    }
    this.parentSpanId = init.traceparent?.spanId;
    this.sampled = init.traceparent?.sampled ?? true;
    this.startedAt = performance.now();

    if (init.values) {
      for (const [k, v] of Object.entries(init.values)) this.values.set(k, v);
    }
  }

  set(key: string, value: unknown): this {
    this.values.set(key, value);
    return this;
  }

  get<T = unknown>(key: string): T | undefined {
    return this.values.get(key) as T | undefined;
  }

  has(key: string): boolean {