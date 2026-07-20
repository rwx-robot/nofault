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
