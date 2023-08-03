import { describe, expect, it } from 'vitest';
import {
  Tracer,
  InMemoryExporter,
  ratioSampler,
  neverSample,
  MetricRegistry,
  Counter,
  Gauge,
  Histogram,
  DEFAULT_BUCKETS,
} from '../src/index';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('tracer', () => {
  it('creates spans with a trace id and span id', async () => {
    const exporter = new InMemoryExporter();
    const tracer = new Tracer(exporter, undefined, 1);
    const span = tracer.startSpan('op');
    span!.end();
    await tracer.flush();

    expect(exporter.spans).toHaveLength(1);
    expect(exporter.spans[0]!.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(exporter.spans[0]!.spanId).toMatch(/^[0-9a-f]{16}$/);
  });

  it('records duration, attributes and error status', async () => {
    const exporter = new InMemoryExporter();
    const tracer = new Tracer(exporter, undefined, 1);

    await expect(
      tracer.trace('failing', async (span) => {
        span?.setAttributes({ attempts: 2 });
        await sleep(20);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    await tracer.flush();

    const span = exporter.spans[0]!;
    expect(span.status).toBe('error');
    expect(span.error).toBe('boom');
    expect(span.durationMs).toBeGreaterThanOrEqual(15);
    expect(span.attributes.attempts).toBe(2);
  });

  it('records sub-millisecond spans instead of flattening them to 0', async () => {
    const exporter = new InMemoryExporter();
    const tracer = new Tracer(exporter, undefined, 100);

    // 缓存命中、本地方法调用这类"起一个 Span 立刻就结束"的操作是亚毫秒级的。
    // 用毫秒粒度计时会被统统记成 0ms，在火焰图上等于消失——而这恰恰是最该被观测的一段。
    for (let i = 0; i < 20; i++) {
      tracer.startSpan('fast')!.end();
    }
    await tracer.flush();