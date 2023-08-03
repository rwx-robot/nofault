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
    resource: { attributes: OtlpAttribute[] };
    scopeSpans: { scope: { name: string }; spans: OtlpSpan[] }[];
  }[];
}

interface CapturedRequest {
  url: string;
  headers: IncomingMessage['headers'];
  body: OtlpRequest;
}

const servers: Server[] = [];

afterAll(async () => {
  await Promise.all(
    servers.map(
      (server) => new Promise<void>((resolve) => server.close(() => resolve())),
    ),
  );
});

/** 起一个把请求原样记录下来的假 OTLP collector */
function startCollector(): Promise<{ url: string; requests: CapturedRequest[] }> {
  const requests: CapturedRequest[] = [];
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      requests.push({ url: req.url ?? '', headers: req.headers, body: JSON.parse(raw) as OtlpRequest });
      res.writeHead(200).end();
    });
  });