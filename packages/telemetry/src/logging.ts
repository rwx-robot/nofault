/**
 * 日志与 Trace 的自动关联。
 *
 * v0.8.0 交付时这是写明"已知限制"的一块：traceId **拿得到**，
 * 但要自己写进每个日志调用。实际结果是没人写——
 * 于是排障时日志和链路是两套对不上的证据。
 *
 * 做法是把"取 traceId"这件事从调用方挪到日志器内部：
 * 包装一次，之后所有日志调用自动带上 `{ traceId, spanId }`。
 * 业务代码零改动，这正是它该有的形态。
 */
import { currentContext } from '@nofault/context';
import { ACTIVE_SPAN, type Span } from './tracer';

export interface FieldLogger {
  debug?(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

export interface TraceFields {
  traceId?: string;
  spanId?: string;
}

/**
 * 取当前的追踪字段。
 *
 * 优先取**活动 Span**（它知道自己在哪条链路的哪一步），
 * 退回请求上下文里的 traceId（v0.3.0 起就有，即使没起 Span 也能串日志）。
 */
export function traceFields(): TraceFields {
  const ctx = currentContext();
  const active = ctx?.get<Span>(ACTIVE_SPAN);
  if (active) return { traceId: active.traceId, spanId: active.spanId };
  if (ctx?.traceId) return { traceId: ctx.traceId };
  return {};
}

/**
 * 包装一个字段式日志器，自动注入 traceId / spanId。
 *
 * 调用方显式传的同名字段**优先**——偶尔要记另一条链路时不应被覆盖。
 */
export function withTraceFields<T extends FieldLogger>(logger: T): T {
  const levels: Array<keyof FieldLogger> = ['debug', 'info', 'warn', 'error'];
  // 展开成可变对象再包装：泛型 T 没有索引签名，直接赋值会被 TS 拒绝
  const wrapped = { ...logger } as Record<string, unknown>;

  for (const level of levels) {
    const original = logger[level];
    if (typeof original !== 'function') continue;

    wrapped[level as string] = (message: string, fields?: Record<string, unknown>): void => {
      (original as (m: string, f?: Record<string, unknown>) => void).call(logger, message, {
        ...traceFields(),
        ...fields,
      });
    };
  }
  return wrapped as T;
}
