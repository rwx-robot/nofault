/**
 * MCP 服务器端到端测试：不走真实进程，直接注入内存流，
 * 断言"一行请求 → 一行响应"的 stdio 协议行为。
 */
import { describe, expect, it } from 'vitest';
import { PassThrough } from 'node:stream';
import { McpServer, type McpTool } from '../src/index';

interface Harness {
  /** 写请求进 stdin */
  client: PassThrough;
  /** stdout 上收到的响应行（每行一个 JSON-RPC 消息） */
  responses: string[];
  server: McpServer;
}

function setup(tools: McpTool[] = []): Harness {
  const client = new PassThrough();
  const output = new PassThrough();
  const responses: string[] = [];
  output.on('data', (chunk: Buffer) => {
    for (const line of chunk.toString('utf8').split('\n')) {
      if (line.trim().length > 0) responses.push(line);
    }
  });
  const server = new McpServer({ name: 'nofault-mcp', version: '1.0.0', tools, input: client, output }).start();
  return { client, responses, server };
}

async function call(h: Harness, id: number, method: string, params?: unknown): Promise<Record<string, unknown>> {
  const before = h.responses.length;
  h.client.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  await waitFor(() => h.responses.length > before);
  return JSON.parse(h.responses[before]) as Record<string, unknown>;
}

async function waitFor(cond: () => boolean): Promise<void> {
  for (let i = 0; i < 100 && !cond(); i++) {
    await new Promise((r) => setTimeout(r, 5));
  }
}

const echo: McpTool = {
  name: 'echo',
  description: 'echo the input back',
  inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
  handler: (input) => ({ echoed: input.text }),
};

describe('mcp server', () => {
  it('answers initialize with protocol version and server info', async () => {
    const h = setup([echo]);
    const res = await call(h, 1, 'initialize', {});
    expect(res.result).toMatchObject({
      protocolVersion: '2024-11-05',
      serverInfo: { name: 'nofault-mcp', version: '1.0.0' },