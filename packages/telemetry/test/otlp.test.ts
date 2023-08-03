/**
 * OTLP 导出器的端到端验证。
 *
 * 验收标准是"产物能到后端"，不是"JSON 序列化不抛错"——
 * 所以这里起一个**真实的 HTTP collector**，断言编码结果逐字段正确：
 * ID 是 hex、64 位纳秒是字符串、kind 是 OTLP 枚举值、错误状态带原因。
 */
import { afterAll, describe, expect, it } from 'vitest';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { OtlpExporter, Tracer } from '../src/index';

// ---------------------------------------------------------------- 测试用 collector

interface OtlpAttribute {
  key: string;
  value: Record<string, string | number | boolean>;
}

interface OtlpSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: number;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes: OtlpAttribute[];
  status: { code: number; message?: string };
}

interface OtlpRequest {
  resourceSpans: {