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