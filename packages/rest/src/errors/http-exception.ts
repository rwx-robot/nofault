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
  }

  toBody(): { code: number; data: unknown; message: string } {
    return { code: this.code, data: this.details ?? null, message: this.message };
  }
}

export class BadRequestException extends HttpException {
  constructor(message = 'Bad Request', details?: unknown) {
    super(400, message, 400, details);
    this.name = 'BadRequestException';
  }
}

export class UnauthorizedException extends HttpException {
  constructor(message = 'Unauthorized') {
    super(401, message, 401);
    this.name = 'UnauthorizedException';
  }
}

export class ForbiddenException extends HttpException {
  constructor(message = 'Forbidden') {
    super(403, message, 403);
    this.name = 'ForbiddenException';
  }
}

export class NotFoundException extends HttpException {
  constructor(message = 'Not Found') {
    super(404, message, 404);
    this.name = 'NotFoundException';
  }
}

export class MethodNotAllowedException extends HttpException {
  constructor(message = 'Method Not Allowed') {
    super(405, message, 405);
    this.name = 'MethodNotAllowedException';
  }
}

export class ConflictException extends HttpException {
  constructor(message = 'Conflict') {
    super(409, message, 409);
    this.name = 'ConflictException';
  }
}

export class UnprocessableEntityException extends HttpException {
  constructor(message = 'Unprocessable Entity', details?: unknown) {
    super(422, message, 422, details);
    this.name = 'UnprocessableEntityException';
  }
}

export class InternalServerErrorException extends HttpException {
  constructor(message = 'Internal Server Error') {
    super(500, message, 500);
    this.name = 'InternalServerErrorException';