/**
 * 可观测性的 HTTP 接入：每个请求一个服务端 Span + 一组指标。
 *
 * 指标命名沿用 Prometheus 惯例（`<name>_<unit>`、`<name>_total`），
 * 这样接 Grafana 时不用再查一遍单位。
 */
import type { Tracer } from './tracer';
import { MetricRegistry } from './metrics';