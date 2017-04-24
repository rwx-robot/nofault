import type { IncomingMessage, ServerResponse } from 'node:http';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';

/**
 * 请求/响应包装。
 *
 * 为什么不直接暴露 `IncomingMessage`：
 * 1. 业务代码不该关心 Node 原生细节（可测试性 + 未来换适配器）