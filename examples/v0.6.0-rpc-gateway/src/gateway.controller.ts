/**
 * HTTP 网关：把外部 HTTP 请求翻译成内部 RPC 调用。
 *
 * 关键点：
 * 1. **traceId 透传** —— HTTP 侧的上下文 id 塞进 RPC 请求的 traceId，
 *    于是后端日志能串到同一次用户请求上（v0.3.0 的上下文在这里续上）
 * 2. **超时必须有** —— 后端慢，网关不能跟着慢死，否则级联雪崩
 * 3. **只重试可重试的** —— 业务错误（用户不存在）重试毫无意义
 */
import { Injectable } from '@nofault/core';
import { currentContext } from '@nofault/context';
import { Controller, Get, Post, Body, Param, HttpException } from '@nofault/rest';

import { InjectRpcClient, RpcClient, rpcErrorToStatus } from '@nofault/rpc';
import type { UserDto } from './user-rpc.service';

@Injectable()
@Controller('/api')
export class GatewayController {
  // RPC 客户端以 token 提供（可以换成不同配置/不同实现），
  // 所以注入时必须用 @InjectRpcClient()，而不是按类注入
  constructor(@InjectRpcClient() private readonly rpc: RpcClient) {}

  @Get('/ping')