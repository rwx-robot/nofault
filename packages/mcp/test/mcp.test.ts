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