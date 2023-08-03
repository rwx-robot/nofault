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
  servers.push(server);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ url: `http://127.0.0.1:${port}/v1/traces`, requests });
    });
  });
}

function findSpan(request: CapturedRequest, name: string): OtlpSpan {
  const span = request.body.resourceSpans[0]!.scopeSpans[0]!.spans.find((s) => s.name === name);
  expect(span, `span ${name} should be exported`).toBeDefined();
  return span!;
}

function attributeValue(span: OtlpSpan, key: string): Record<string, string | number | boolean> {
  const attribute = span.attributes.find((a) => a.key === key);
  expect(attribute, `attribute ${key} should exist`).toBeDefined();
  return attribute!.value;
}

// ---------------------------------------------------------------- 用例

describe('otlp exporter', () => {
  it('posts spans as otlp/json to the endpoint', async () => {
    const collector = await startCollector();
    const exporter = new OtlpExporter({ endpoint: collector.url, serviceName: 'demo-api' });
    const tracer = new Tracer(exporter, undefined, 10);

    const parent = tracer.startSpan('GET /users', 'server')!;
    parent.setAttributes({ route: '/users', status: 200, cached: true });
    const child = tracer.startSpan('db.query', 'client', {
      traceId: parent.traceId,
      spanId: tracer.newSpanId(),
      parentSpanId: parent.spanId,
    })!;
    child.setAttributes({ attempts: 2 });
    child.end();
    parent.end();
    await expect(
      tracer.trace('failing', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    await tracer.flush();

    expect(collector.requests).toHaveLength(1);
    const request = collector.requests[0]!;
    expect(request.url).toBe('/v1/traces');
    expect(request.headers['content-type']).toBe('application/json');

    // resource：service.name 必须在，Jaeger/Tempo 靠它分组服务
    const resourceAttributes = request.body.resourceSpans[0]!.resource.attributes;
    expect(resourceAttributes).toContainEqual({
      key: 'service.name',
      value: { stringValue: 'demo-api' },
    });
    expect(request.body.resourceSpans[0]!.scopeSpans[0]!.scope.name).toBe('@nofault/telemetry');
    expect(request.body.resourceSpans[0]!.scopeSpans[0]!.spans).toHaveLength(3);

    // server span：kind=2，ID 是定长 hex，时间戳是纳秒字符串
    const serverSpan = findSpan(request, 'GET /users');
    expect(serverSpan.kind).toBe(2);
    expect(serverSpan.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(serverSpan.spanId).toMatch(/^[0-9a-f]{16}$/);