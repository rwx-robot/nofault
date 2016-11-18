/**
 * v0.6.0 端到端：HTTP 网关 → RPC → 后端服务，全链路走真实 socket。
 *
 * 关注 mock 掉就测不到的部分：
 * 1. 一次 HTTP 请求里的 traceId 是否真的穿到了 RPC 后端
 * 2. 后端慢时，网关是否**在超时点**返回（而不是等到后端结束）
 * 3. 上游不可用时返回 502 而不是 500（语义要对）
 */
import { afterAll, describe, expect, it } from 'vitest';
import 'reflect-metadata';
import { Module } from '@nofault/core';
import { currentContext } from '@nofault/context';
import { Body, Controller, Get, Post, RestApplication, bodyParser, requestContext, HttpException } from '@nofault/rest';
import {
  InMemoryRegistry,
  rpcErrorToStatus,
  loggingInterceptor,
  RpcClient,
  RpcError,
  RpcModule,
  RpcServer,
  RPC_ERROR,
  InjectRpcClient,
} from '@nofault/rpc';

class Backend {
  async echo(input: { value: string; traceId?: string }): Promise<{ value: string; traceId?: string }> {
    return { value: input.value, traceId: input.traceId };
  }

  async slow(input: { ms: number }): Promise<{ waited: number }> {
    await new Promise((resolve) => setTimeout(resolve, input.ms));
    return { waited: input.ms };
  }
}

const registry = new InMemoryRegistry({ ttlMs: 30_000 });
const seenTraceIds: Array<string | undefined> = [];

@Controller('/api')
class GatewayController {
  constructor(@InjectRpcClient() private readonly rpc: RpcClient) {}

  @Get('/echo')
  async echo(): Promise<unknown> {
    const traceId = currentContext()?.traceId;
    return this.rpc.call('backend', 'echo', { value: 'hi', traceId }, traceId);
  }

  @Post('/slow')
  async slow(@Body() body: { ms: number }): Promise<unknown> {
    try {
      return await this.rpc.call('backend', 'slow', body);
    } catch (err) {
      const mapped = rpcErrorToStatus(err);
      throw new HttpException(mapped.status, mapped.message, mapped.status);
    }
  }
}

@Module({
  imports: [RpcModule.forClient({ registry, service: 'backend', timeoutMs: 200, retries: 0, poolSize: 2 })],
  controllers: [GatewayController],
})
class GatewayModule {}

let rpcServer: RpcServer;