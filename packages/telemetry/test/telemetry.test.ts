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

    const durations = exporter.spans.map((s) => s.durationMs);
    expect(durations).toHaveLength(20);

    /**
     * 判据取"最快那个 Span"：毫秒粒度下耗时只能是整数（0、1、2…），
     * 永远不可能落在 (0,1) 区间；高精度计时的亚毫秒值则必然落在这里。
     * 只看"有没有大于 0 的"是不够的——偶尔跨过一次毫秒边界就能蒙混过关。
     */
    const fastest = Math.min(...durations);
    expect(fastest).toBeGreaterThan(0);
    expect(fastest).toBeLessThan(1);
  });

  it('keeps startTimeMs on the wall clock for exporters', async () => {
    const exporter = new InMemoryExporter();
    const tracer = new Tracer(exporter, undefined, 1);
    const before = Date.now();
    const span = tracer.startSpan('op')!;
    span.end();
    await tracer.flush();
    // 导出器要拿它算绝对时间（OTLP 会换算成纳秒），必须仍是 epoch 毫秒量级
    expect(exporter.spans[0]!.startTimeMs).toBeGreaterThanOrEqual(before - 5);
    expect(exporter.spans[0]!.startTimeMs).toBeLessThanOrEqual(Date.now() + 5);
  });

  it('links child spans to the parent', async () => {
    const exporter = new InMemoryExporter();
    const tracer = new Tracer(exporter, undefined, 10);