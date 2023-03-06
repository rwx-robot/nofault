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