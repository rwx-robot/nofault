/**
 * 可观测性的 HTTP 接入：每个请求一个服务端 Span + 一组指标。
 *
 * 指标命名沿用 Prometheus 惯例（`<name>_<unit>`、`<name>_total`），
 * 这样接 Grafana 时不用再查一遍单位。
 */
import type { Tracer } from './tracer';
import { MetricRegistry } from './metrics';
import { HttpException } from '@nofault/rest';

export interface ObservabilityContext {
  request: { method: string; path: string };
  response: {
    statusCodeValue?: number;
    statusCode?: number;
    header(name: string, value: string): unknown;
  };
}

export interface ObservabilityOptions {
  tracer?: Tracer;
  metrics?: MetricRegistry;
  /** 是否把 traceId 回给客户端（便于对齐日志） */
  exposeTraceId?: boolean;
  /** 路由标签要不要收敛：不收敛的话 /users/1 和 /users/2 是两个序列 */
  routeLabelOf?: (ctx: ObservabilityContext) => string;
}

export function observability(options: ObservabilityOptions = {}) {
  const metrics = options.metrics ?? new MetricRegistry();
  const requests = metrics.counter('http_requests_total', 'Total HTTP requests');
  const duration = metrics.histogram('http_request_duration_ms', 'HTTP request duration in milliseconds');
  const errors = metrics.counter('http_request_errors_total', 'Total failed HTTP requests');

  return {
    metrics,
    use: async (ctx: ObservabilityContext, next: () => Promise<void>): Promise<void> => {
      const route = options.routeLabelOf?.(ctx) ?? ctx.request.path;
      const span = options.tracer?.startSpan(`${ctx.request.method} ${route}`, 'server');
      span?.setAttributes({ method: ctx.request.method, route });
      const started = Date.now();
      // 错误状态码要在 catch 里记下来：
      // 此时框架还没把异常映射成响应状态码，finally 里读到的是默认的 200，
      // 于是失败的请求会被统计成成功——监控上"零错误"，实际上全线 500。
      let errorStatus: number | undefined;

      try {
        await next();
      } catch (err) {