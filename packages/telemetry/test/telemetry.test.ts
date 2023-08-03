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
    const parent = tracer.startSpan('parent')!;
    const child = tracer.startSpan('child', 'client', {
      traceId: parent.traceId,
      spanId: tracer.newSpanId(),
      parentSpanId: parent.spanId,
    })!;
    child.end();
    parent.end();
    await tracer.flush();

    const childSpan = exporter.spans.find((s) => s.name === 'child')!;
    expect(childSpan.traceId).toBe(parent.traceId);
    expect(childSpan.parentSpanId).toBe(parent.spanId);
  });

  it('does not allocate a span when the sampler declines', () => {
    const tracer = new Tracer(new InMemoryExporter(), neverSample);
    // 不采样时返回 null：不采样就必须真的不花开销
    expect(tracer.startSpan('op')).toBeNull();
  });

  it('samples approximately at the configured ratio', () => {
    const tracer = new Tracer(new InMemoryExporter(), ratioSampler(0.5));
    let created = 0;
    for (let i = 0; i < 2000; i++) {
      if (tracer.startSpan('op')) created++;
    }
    expect(created).toBeGreaterThan(700);
    expect(created).toBeLessThan(1300);
  });

  it('batches exports and flushes on demand', async () => {
    const exporter = new InMemoryExporter();
    const tracer = new Tracer(exporter, undefined, 5);
    for (let i = 0; i < 4; i++) tracer.startSpan(`op-${i}`)!.end();
    expect(exporter.spans).toHaveLength(0); // 还没达到 batchSize

    await tracer.flush();
    expect(exporter.spans).toHaveLength(4);
    expect(tracer.pendingCount).toBe(0);
  });
});

describe('metrics', () => {
  it('counts by label set', () => {
    const counter = new Counter('requests_total');
    counter.inc({ route: '/a' });
    counter.inc({ route: '/a' });
    counter.inc({ route: '/b' });
    expect(counter.get({ route: '/a' })).toBe(2);
    expect(counter.get({ route: '/b' })).toBe(1);
  });

  it('gauges can go up and down', () => {
    const gauge = new Gauge('in_flight');
    gauge.add(1);
    gauge.add(1);
    expect(gauge.get()).toBe(2);
    gauge.add(-1);
    expect(gauge.get()).toBe(1);
    gauge.set(10);
    expect(gauge.get()).toBe(10);
  });

  it('histogram buckets and percentiles', () => {
    const histogram = new Histogram('latency_ms', '', [10, 50, 100]);
    for (const value of [1, 5, 20, 60, 300]) histogram.observe(value);

    // 桶式直方图只能给出**所在桶的上界**（与 Prometheus 一致），是近似值：
    // 样本 [1,5,20,60,300] 的 p50 落在 le=50 这个桶里，因此返回 50 而不是 20
    expect(histogram.percentile(50)).toBe(50);
    expect(histogram.percentile(100)).toBe(100);
    const stats = histogram.stats()!;
    expect(stats.count).toBe(5);
    expect(stats.sum).toBe(386);
  });

  it('returns undefined for percentiles without samples', () => {
    expect(new Histogram('empty').percentile(95)).toBeUndefined();
  });

  it('exports prometheus text format', () => {
    const registry = new MetricRegistry();
    registry.counter('http_requests_total', 'Total requests').inc({ route: '/api', status: '200' }, 3);
    registry.gauge('in_flight', 'In flight').set(2);
    registry.histogram('http_request_duration_ms', 'Duration', [50, 100]).observe(42);
