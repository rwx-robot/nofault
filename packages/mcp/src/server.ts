/**
 * MCP 服务器模式 —— 通过 stdio 上的换行分隔 JSON-RPC 把 nofault 能力暴露给
 * 实现 MCP 协议的客户端。协议本身与具体客户端无关，工具分发走 JSON Schema。
 *
 * 协议：stdio 上的**换行分隔 JSON-RPC 2.0**（MCP 标准传输）。
 * 只实现服务器侧必需的最小面：`initialize` / `tools/list` / `tools/call` / `ping`，
 * 其余 method 一律 -32601——规范允许协商，客户端不该依赖我们没声明的能力。
 *
 * 设计立场：
 * - **零依赖**：MCP 的 stdio 传输就是"一行一个 JSON"，不需要 SDK；
 * - **流可注入**：默认 stdin/stdout，测试与嵌入（如挂到已有服务的端口上）时传入自定义流；
 * - **工具错误走 result.isError**：MCP 约定工具自身的失败是"调用成功但结果为错误"，
 *   只有协议级错误（未知 method / 未知工具）才用 JSON-RPC error。
 */
import { createInterface } from 'node:readline';
import type { Readable, Writable } from 'node:stream';

export interface McpTool {
  name: string;
  description: string;
  /** JSON Schema（draft 2020-12），描述 arguments 的形状 */
  inputSchema: Record<string, unknown>;
  handler: (input: Record<string, unknown>) => unknown | Promise<unknown>;
}

export interface McpServerOptions {
  name: string;
  version: string;
  tools?: McpTool[];
  /** 缺省 process.stdin / process.stdout；测试与嵌入时注入 */
  input?: Readable;
  output?: Writable;
}

const PROTOCOL_VERSION = '2024-11-05';

export class McpServer {
  private readonly tools = new Map<string, McpTool>();
  private readonly input: Readable;
  private readonly output: Writable;
  private readline?: ReturnType<typeof createInterface>;
  private running = false;

  constructor(private readonly options: McpServerOptions) {
    for (const tool of options.tools ?? []) {
      if (this.tools.has(tool.name)) {
        throw new Error(`duplicate mcp tool: ${tool.name}`);
      }
      this.tools.set(tool.name, tool);
    }
    this.input = options.input ?? process.stdin;
    this.output = options.output ?? process.stdout;
  }

  get toolNames(): string[] {
    return [...this.tools.keys()];