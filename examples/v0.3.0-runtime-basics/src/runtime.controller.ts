import { Controller, Ctx, Get, Post, RestContext } from '@nofault/rest';
import { Injectable } from '@nofault/core';
import { currentContext } from '@nofault/context';
import { ConfigService } from '@nofault/config';
import { RequestScopeService } from './request-scope.service';

/**
 * 运行时能力演示控制器。
 *
 * 四个端点分别对应 v0.3.0 的四个能力：
 * - `/api/runtime/context`  请求上下文 + REQUEST 作用域
 * - `/api/runtime/config`   配置热更新
 * - `/api/runtime/trace`    traceparent 传播
 * - `/api/runtime/notes`    同一请求内共享实例
 */
@Injectable()
@Controller('/api/runtime')
export class RuntimeController {
  constructor(
    private readonly requestScope: RequestScopeService,
    private readonly config: ConfigService,
  ) {}

  @Get('/context')
  context() {
    const ctx = currentContext();
    return {
      requestId: ctx?.id,
      traceId: ctx?.traceId,
      spanId: ctx?.spanId,
      parentSpanId: ctx?.parentSpanId,
      // REQUEST 作用域：每次请求都是新实例，instanceNo 会递增
      scopeInstanceNo: this.requestScope.instanceNo,
      scopeRequestId: this.requestScope.requestId,
      configReloadable: this.config.isReloadable,
    };
  }