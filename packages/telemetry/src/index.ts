/**
 * @nofault/telemetry —— 可观测性（v0.8.0）。
 *
 * Trace：v0.3.0 只做 traceId 透传，这里补上"上报"（时长、属性、状态、采样）。
 * Metrics：Counter / Gauge / Histogram + Prometheus 文本导出。
 */
export {
  Tracer,
  Span,
  InMemoryExporter,
  alwaysSample,
  neverSample,
  ratioSampler,
  ACTIVE_SPAN,
} from './tracer';
export type { FinishedSpan, Exporter, Sampler, SpanKind, SpanAttributes } from './tracer';

export { OtlpExporter, toOtlpSpan, toOtlpRequest } from './otlp-exporter';
export type { OtlpExporterOptions } from './otlp-exporter';

export { MetricRegistry, Counter, Gauge, Histogram, DEFAULT_BUCKETS } from './metrics';
export type { Labels, Sample } from './metrics';

export { withTraceFields, traceFields } from './logging';
export type { FieldLogger, TraceFields } from './logging';

export { observability } from './middleware';
export type { ObservabilityOptions, ObservabilityContext } from './middleware';
