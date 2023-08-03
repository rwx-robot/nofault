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