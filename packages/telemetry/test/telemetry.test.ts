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

    const text = registry.toPrometheus();
    expect(text).toContain('# TYPE http_requests_total counter');
    expect(text).toContain('http_requests_total{route="/api",status="200"} 3');
    expect(text).toContain('# TYPE in_flight gauge');
    expect(text).toContain('# TYPE http_request_duration_ms histogram');
    // 累积桶：42ms 落在 le=50 这个桶里
    expect(text).toContain('http_request_duration_ms_bucket{le="50"} 1');
    expect(text).toContain('http_request_duration_ms_count 1');
  });

  it('escapes label values so the output stays parsable', () => {
    const registry = new MetricRegistry();
    registry.counter('c').inc({ path: 'a"b\nc' });
    expect(registry.toPrometheus()).toContain('path="a\\"b\\nc"');
  });

  it('reuses the same metric instance for the same name', () => {
    const registry = new MetricRegistry();
    registry.counter('x').inc();
    registry.counter('x').inc();
    expect(registry.counter('x').get()).toBe(2);
  });

  it('uses sane default buckets', () => {
    expect(DEFAULT_BUCKETS[0]).toBeLessThan(DEFAULT_BUCKETS[DEFAULT_BUCKETS.length - 1]!);
  });
});
