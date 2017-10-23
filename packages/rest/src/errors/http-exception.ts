/**
 * HTTP 异常体系。
 *
 * 统一响应的形状是 `{ code, data, message }`：
 * - `status`：HTTP 状态码
 * - `code`：业务错误码（默认 -1，成功为 0）
 */
export class HttpException extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code: number = -1,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HttpException';