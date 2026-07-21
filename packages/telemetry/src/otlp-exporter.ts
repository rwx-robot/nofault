/**
 * OTLP/HTTP JSON 导出器 —— 把 Span 发给任何讲 OTLP 的后端
 * （OpenTelemetry Collector、Jaeger 2.x、Tempo、SigNoz……）。
 *
 * 这是 v0.8.0 的最后一块拼图：Tracer / 指标早已就绪，
 * 唯一"只进内存"的就是导出端。接上它，链路数据才真正能到后端。
 *
 * 三条纪律：
 * 1. **导出失败绝不能拖垮宿主应用**。Tracer.finish 里是 `void this.flush()`，
 *    导出器若抛错就是一条未处理的 rejection——所以传输层的一切失败
 *    都在这里吞掉，交给 `onError` 钩子（默认打印一行错误）
 * 2. **OTLP/HTTP JSON 的 64 位整数用字符串**：JSON number 会丢纳秒精度，
 *    startTimeUnixNano / endTimeUnixNano / intValue 一律走字符串，
 *    这也是 OTLP 规范对 JSON 编码的明确要求
 * 3. **零依赖**：fetch 是 Node 20 的全局，不需要任何 HTTP 客户端包
 */
import type { Exporter, FinishedSpan, SpanAttributes, SpanKind } from './tracer';

/** OTLP SpanKind：internal=1 / server=2 / client=3（规范里的枚举值） */
const KIND_CODES: Record<SpanKind, number> = { internal: 1, server: 2, client: 3 };

export interface OtlpExporterOptions {
  /** OTLP/HTTP traces 端点，如 http://localhost:4318/v1/traces */
  endpoint: string;
  /** resource 属性 service.name（在 Jaeger / Tempo 里就是服务名） */
  serviceName?: string;
  /** 额外请求头（如 Authorization） */
  headers?: Record<string, string>;
  /** 单次导出超时（毫秒），默认 5000 */
  timeoutMs?: number;
  /** 导出失败钩子；不提供则打印一行 console.error */
  onError?: (error: unknown, batch: FinishedSpan[]) => void;
}

/** OTLP 属性值：整数走 intValue 且必须是字符串（JSON number 丢精度） */
function attributeValue(value: NonNullable<SpanAttributes[string]>): Record<string, string | number | boolean> {
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { intValue: String(value) } : { doubleValue: value };
  }
  if (typeof value === 'boolean') return { boolValue: value };
  return { stringValue: String(value) };
}

function toOtlpAttributes(attributes: SpanAttributes) {
  return Object.entries(attributes)
    .filter((entry): entry is [string, NonNullable<SpanAttributes[string]>] => entry[1] !== undefined)
    .map(([key, value]) => ({ key, value: attributeValue(value) }));
}

/** 毫秒 → 纳秒字符串（BigInt 避免大数精度丢失） */
function nanos(ms: number): string {
  return (BigInt(Math.round(ms)) * 1_000_000n).toString();
}

/**
 * 单个 Span → OTLP JSON。
 * 导出来便于测试与排查（不用起 collector 就能断言编码结果）。
 */
export function toOtlpSpan(span: FinishedSpan): Record<string, unknown> {
  return {
    traceId: span.traceId,