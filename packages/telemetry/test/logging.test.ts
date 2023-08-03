/**
 * withTraceFields 单元测试。
 *
 * 这是 v0.8.0 写明"已知限制"、v1.0.0 补上的最后一块：
 * traceId 要能**自动**进日志，而不是指望每处调用都记得手写。
 */
import { describe, expect, it } from 'vitest';
import { RequestContext, requestContextStore } from '@nofault/context';
import { traceFields, withTraceFields, type FieldLogger } from '../src/logging';

function capturingLogger() {
  const calls: Record<string, { message: string; fields?: Record<string, unknown> }> = {};
  const logger: FieldLogger = {
    debug: (m, f) => (calls.debug = { message: m, fields: f }),
    info: (m, f) => (calls.info = { message: m, fields: f }),
    warn: (m, f) => (calls.warn = { message: m, fields: f }),
    error: (m, f) => (calls.error = { message: m, fields: f }),
  };
  return { logger, calls };
}

describe('withTraceFields', () => {
  it('injects the traceId from the request context', () => {
    const { logger, calls } = capturingLogger();
    const traced = withTraceFields(logger);

    // 必须用**真实** RequestContext：traceFields() 会调 ctx.get()，
    // 传裸对象会在那里炸掉——这正是这次要防的那类半真测试
    requestContextStore.run(new RequestContext({ traceparent: { traceId: 'trace-123', spanId: 's1' } as never }), () => {
      traced.info('hello');
    });

    expect(calls.info?.fields).toMatchObject({ traceId: 'trace-123' });
  });

  it('keeps working (without fields) outside a request context', () => {
    const { logger, calls } = capturingLogger();
    const traced = withTraceFields(logger);
    traced.info('no request here');
    expect(calls.info?.message).toBe('no request here');
    expect(calls.info?.fields?.traceId).toBeUndefined();
  });

  it('lets the caller override the trace id explicitly', () => {
    const { logger, calls } = capturingLogger();
    const traced = withTraceFields(logger);

    requestContextStore.run(new RequestContext({ traceparent: { traceId: 'auto', spanId: 's1' } as never }), () => {
      traced.info('correlating another trace', { traceId: 'manual' });
    });

    // 显式传的字段优先：偶尔要记另一条链路时不应被覆盖
    expect(calls.info?.fields?.traceId).toBe('manual');
  });

  it('traces every level that the underlying logger supports', () => {
    const { logger, calls } = capturingLogger();
    const traced = withTraceFields(logger);

    requestContextStore.run(new RequestContext({ traceparent: { traceId: 't', spanId: 's1' } as never }), () => {
      traced.info('a');
      traced.warn('b');
      traced.error('c');
      traced.debug?.('d');
    });
