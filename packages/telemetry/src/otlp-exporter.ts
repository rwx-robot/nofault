/**
 * OTLP/HTTP JSON 导出器 —— 把 Span 发给任何讲 OTLP 的后端
 * （OpenTelemetry Collector、Jaeger 2.x、Tempo、SigNoz……）。
 *
 * 这是 v0.8.0 的最后一块拼图：Tracer / 指标早已就绪，
 * 唯一"只进内存"的就是导出端。接上它，链路数据才真正能到后端。
 *
 * 三条纪律：
 * 1. **导出失败绝不能拖垮宿主应用**。Tracer.finish 里是 `void this.flush()`，