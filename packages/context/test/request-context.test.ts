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