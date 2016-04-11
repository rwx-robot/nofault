import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * HTTP 请求处理函数（Node 原生签名）。
 *
 * 返回 `true` 表示"我已处理完这个请求"，处理链到此结束；