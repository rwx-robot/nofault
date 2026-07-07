# @nofault/mcp

MCP 服务器模式：把 nofault 的能力暴露给 AI 客户端（stdio，换行分隔 JSON-RPC）。

**引入版本**：v1.0.0

## 为什么这么设计

- **零依赖**：MCP 的 stdio 传输就是"一行一个 JSON"，不需要 SDK
- **流可注入**：默认 stdin/stdout，测试与嵌入时传入自定义流
- 实现服务器侧最小面：`initialize` / `tools/list` / `tools/call` / `ping`，其余一律 -32601
- **工具错误走 result.isError**：工具自身的失败是"调用成功但结果为错误"，只有协议级错误才用 JSON-RPC error

## 最快上手

```ts
import { McpServer } from '@nofault/mcp';

const server = new McpServer({
  name: 'nofault-mcp',
  version: '1.0.0',
  tools: [{
    name: 'list-users',
    description: 'list users by page',
    inputSchema: { type: 'object', properties: { page: { type: 'number' } } },
    handler: (input) => users.page(input.page),
  }],