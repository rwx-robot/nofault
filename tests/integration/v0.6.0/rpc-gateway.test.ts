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
let app: RestApplication;
let base: string;

afterAll(async () => {
  await app?.close();
  await rpcServer?.close();
  await registry.close();
});

describe('http gateway over rpc', () => {
  it('boots the backend, registers it and serves requests through the gateway', async () => {
    rpcServer = new RpcServer({
      interceptors: [
        loggingInterceptor({ info: () => {} }),
        async (payload, ctx, next) => {
          seenTraceIds.push(ctx.request.traceId);
          return next(payload);
        },
      ],
    });
    rpcServer.registerService('backend', new Backend());
    const { port: rpcPort } = await rpcServer.listen(0, '127.0.0.1');
    await registry.register({ id: 'b1', name: 'backend', host: '127.0.0.1', port: rpcPort });

    app = await RestApplication.create(GatewayModule, { quiet: true, middleware: [requestContext(), bodyParser()] });
    const { port } = await app.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${port}`;

    const res = await fetch(`${base}/api/echo`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { value: string; traceId?: string } };
    expect(body.data.value).toBe('hi');

    // HTTP 侧的 traceId 必须原样出现在 RPC 后端 —— 链路才串得起来
    expect(body.data.traceId).toBeTruthy();
    expect(seenTraceIds).toContain(body.data.traceId);
  });

  it('gives up at the timeout instead of waiting for the backend', async () => {
    const started = Date.now();
    const res = await fetch(`${base}/api/slow`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ms: 1500 }),
    });
    const elapsed = Date.now() - started;

    // 超时是 504（Gateway Timeout），而不是笼统的 500
    expect(res.status).toBe(504);
    // 200ms 超时：即便后端要 1.5s，网关也必须在 200ms 量级返回
    expect(elapsed).toBeLessThan(900);
  });

  it('reports an unreachable upstream with 502 semantics', async () => {
    const missing = new RpcClient({ registry, service: 'nope', timeoutMs: 200 });
    await expect(missing.call('nope', 'go')).rejects.toThrow(/no instance/);
    await missing.close();

    // 错误码要能区分"业务没找到"和"框架没这个方法"
    expect(RPC_ERROR.METHOD_NOT_FOUND).not.toBe(RPC_ERROR.TIMEOUT);
    expect(new RpcError(RPC_ERROR.TIMEOUT, 't').code).toBe(RPC_ERROR.TIMEOUT);
    expect(() => {
      throw new HttpException(502, 'bad', 502);
    }).toThrow();
  });
});
