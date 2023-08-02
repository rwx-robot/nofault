/**
 * 可观测性的单例。
 *
 * 必须**全局唯一**：指标和 Span 缓冲区天然是进程级共享的，
 * 出现两份实例就等于"一半数据不见了"，而且查不出原因。
 */
import { InMemoryExporter, MetricRegistry, Tracer } from '@nofault/telemetry';

export const exporter = new InMemoryExporter();