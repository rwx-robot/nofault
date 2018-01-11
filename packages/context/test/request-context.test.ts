import { describe, expect, it } from 'vitest';
import {
  RequestContext,
  RequestContextStore,
  currentContext,
  currentContextId,
  formatTraceparent,
  generateSpanId,
  generateTraceId,
  parseTraceparent,
  requestContextStore,
  runWithContext,
  setContextValue,
  getContextValue,
} from '../src/index';

describe('ids', () => {
  it('generates w3c-shaped ids', () => {
    expect(generateTraceId()).toMatch(/^[0-9a-f]{32}$/);
    expect(generateSpanId()).toMatch(/^[0-9a-f]{16}$/);
  });

  it('parses a valid traceparent header', () => {
    const tp = parseTraceparent('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01');
    expect(tp).toEqual({
      traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
      spanId: '00f067aa0ba902b7',
      sampled: true,
    });
  });

  it('returns undefined for malformed or all-zero headers', () => {
    expect(parseTraceparent(undefined)).toBeUndefined();
    expect(parseTraceparent('garbage')).toBeUndefined();
    expect(parseTraceparent('00-00000000000000000000000000000000-00f067aa0ba902b7-01')).toBeUndefined();
  });

  it('round-trips format and parse', () => {
    const header = formatTraceparent('a'.repeat(32), 'b'.repeat(16), true);
    expect(header).toBe(`00-${'a'.repeat(32)}-${'b'.repeat(16)}-01`);
    expect(parseTraceparent(header)?.sampled).toBe(true);
  });
});

describe('RequestContext', () => {
  it('generates a request id and trace ids by default', () => {
    const ctx = new RequestContext();
    expect(ctx.id).toMatch(/^req_[0-9a-f]{8}$/);
    expect(ctx.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(ctx.spanId).toMatch(/^[0-9a-f]{16}$/);
  });

  it('inherits the upstream trace id but creates a new span', () => {
    const parent = parseTraceparent('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-00')!;
    const ctx = new RequestContext({ traceparent: parent });
    expect(ctx.traceId).toBe(parent.traceId);
    expect(ctx.parentSpanId).toBe(parent.spanId);
    expect(ctx.spanId).not.toBe(parent.spanId);
    expect(ctx.sampled).toBe(false);
  });

  it('stores and reads values', () => {
    const ctx = new RequestContext({ values: { userId: 7 } });
    expect(ctx.get<number>('userId')).toBe(7);
    ctx.set('role', 'admin');
    expect(ctx.get('role')).toBe('admin');
    expect(ctx.has('role')).toBe(true);
    expect(ctx.delete('role')).toBe(true);
    expect(ctx.has('role')).toBe(false);
  });

  it('serializes to a log-friendly object', () => {
    const ctx = new RequestContext({ id: 'req_fixed' });
    const json = ctx.toJSON();
    expect(json.id).toBe('req_fixed');
    expect(json.traceId).toHaveLength(32);
    expect(typeof json.elapsedMs).toBe('number');
  });
});

describe('RequestContextStore', () => {
  it('exposes the context only inside run()', () => {
    const store = new RequestContextStore();
    expect(store.current()).toBeUndefined();
    expect(store.hasContext()).toBe(false);

    const ctx = new RequestContext({ id: 'req_a' });
    const seen = store.run(ctx, () => store.current());
    expect(seen).toBe(ctx);
    expect(store.current()).toBeUndefined();
  });

  it('propagates across await boundaries', async () => {
    const ctx = new RequestContext({ id: 'req_async' });
    const result = await requestContextStore.run(ctx, async () => {
      await new Promise((r) => setTimeout(r, 1));
      return currentContext()?.id;