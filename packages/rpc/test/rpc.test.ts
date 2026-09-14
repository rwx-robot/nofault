/**
 * RPC 测试：起真实的 TCP 服务端，用真实客户端打调用。
 *
 * 用本机 socket 而不是 mock，是因为 RPC 的绝大多数 bug 都出在
 * **分帧、并发响应配对、连接生命周期**上——这些恰恰是 mock 掉的部分。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { RpcServer, RpcClient, RpcError, RPC_ERROR, InMemoryRegistry, RoundRobinBalancer, FrameReader } from '../src/index';

const clients: RpcClient[] = [];
const servers: RpcServer[] = [];

afterEach(async () => {
  for (const client of clients.splice(0)) await client.close();
  for (const server of servers.splice(0)) await server.close();
});

async function start(server: RpcServer): Promise<number> {
  const { port } = await server.listen(0, '127.0.0.1');
  servers.push(server);
  return port;
}

function client(port: number, options = {}): RpcClient {
  const created = new RpcClient({ host: '127.0.0.1', port, ...options });
  clients.push(created);
  return created;
}

describe('framing', () => {
  it('reassembles a message split across chunks', () => {
    const reader = new FrameReader();
    const body = Buffer.from(JSON.stringify({ hello: 'world' }), 'utf8');
    const header = Buffer.alloc(4);
    header.writeUInt32BE(body.length, 0);
    const frame = Buffer.concat([header, body]);

    // 半包：先来 3 字节，什么都吐不出来
    expect(reader.push(frame.subarray(0, 3))).toHaveLength(0);
    expect(reader.pendingBytes).toBe(3);
    // 补齐后立刻完整解出一帧
    const frames = reader.push(frame.subarray(3));
    expect(frames).toHaveLength(1);
    expect(JSON.parse(frames[0]!.toString())).toEqual({ hello: 'world' });
  });

  it('handles two frames arriving in one chunk (no sticky packet)', () => {
    const reader = new FrameReader();
    const make = (value: string): Buffer => {
      const body = Buffer.from(value, 'utf8');
      const header = Buffer.alloc(4);
      header.writeUInt32BE(body.length, 0);
      return Buffer.concat([header, body]);
    };
    const frames = reader.push(Buffer.concat([make('"a"'), make('"b"')]));
    expect(frames.map((f) => JSON.parse(f.toString()))).toEqual(['a', 'b']);
  });

  it('rejects oversized frames instead of allocating forever', () => {
    const reader = new FrameReader(16);
    const header = Buffer.alloc(4);
    header.writeUInt32BE(10_000_000, 0);
    expect(() => reader.push(header)).toThrow(/too large/);
  });
});

describe('rpc round trip', () => {
  it('calls a method and returns the result', async () => {
    const server = new RpcServer();
    server.register('math', 'add', (payload) => {
      const { a, b } = payload as { a: number; b: number };
      return a + b;
    });
    const port = await start(server);

    await expect(client(port).call('math', 'add', { a: 2, b: 3 })).resolves.toBe(5);
  });

  it('returns a method-not-found error instead of hanging up', async () => {
    const server = new RpcServer();
    const port = await start(server);
    // 业务错误也要回一帧：断连会让调用方分不清"服务挂了"和"方法不存在"
    await expect(client(port).call('math', 'nope', {})).rejects.toThrow(/no handler/);
  });

  it('propagates handler errors with their message', async () => {
    const server = new RpcServer();
    server.register('boom', 'go', () => {
      throw new Error('handler exploded');
    });
    const port = await start(server);
    await expect(client(port).call('boom', 'go', {})).rejects.toThrow('handler exploded');
  });

  it('keeps concurrent calls on one connection correctly paired', async () => {
    const server = new RpcServer();
    server.register('slow', 'echo', async (payload) => {
      const { value, delay } = payload as { value: number; delay: number };
      await new Promise((r) => setTimeout(r, delay));
      return value;
    });
    const port = await start(server);

    const rpc = client(port);
    // 故意让"慢"的请求先发：若靠顺序配响应，这里会全部串位
    const results = await Promise.all([
      rpc.call('slow', 'echo', { value: 1, delay: 60 }),
      rpc.call('slow', 'echo', { value: 2, delay: 1 }),
      rpc.call('slow', 'echo', { value: 3, delay: 30 }),
    ]);
    expect(results).toEqual([1, 2, 3]);
    expect(rpc.poolStats.size).toBe(1);
  });

  it('times out instead of waiting forever', async () => {
    const server = new RpcServer();
    server.register('slow', 'go', () => new Promise((resolve) => setTimeout(resolve, 500)));
    const port = await start(server);

    const rpc = client(port, { timeoutMs: 60 });
    await expect(rpc.call('slow', 'go', {})).rejects.toThrow(/timed out/);
  });

  it('retries retryable failures but not business errors', async () => {
    let attempts = 0;
    const server = new RpcServer();
    server.register('flakey', 'go', () => {
      attempts++;
      if (attempts < 3) throw new RpcError(RPC_ERROR.TIMEOUT, 'transient');
      return 'ok';
    });
    const port = await start(server);

    await expect(client(port, { retries: 3, retryDelayMs: 5 }).call('flakey', 'go', {})).resolves.toBe('ok');
    expect(attempts).toBe(3);

    // 业务错误重试毫无意义，只会放大故障
    const strict = new RpcServer();
    strict.register('bad', 'go', () => {
      throw new RpcError(RPC_ERROR.METHOD_NOT_FOUND, 'nope');
    });
    const strictPort = await start(strict);
    const counting = client(strictPort, { retries: 3 });
    await expect(counting.call('bad', 'go', {})).rejects.toThrow('nope');
  });

  it('passes the trace id through interceptors', async () => {
    const seen: Array<string | undefined> = [];
    const server = new RpcServer({
      interceptors: [
        async (payload, ctx, next) => {
          seen.push(ctx.request.traceId);
          return next(payload);
        },
      ],
    });
    server.register('trace', 'go', () => 'done');
    const port = await start(server);

    await client(port).call('trace', 'go', {}, 'trace-123');
    expect(seen).toEqual(['trace-123']);
  });

  it('reuses pooled connections', async () => {
    const server = new RpcServer();
    server.register('p', 'go', () => 1);
    const port = await start(server);
    const rpc = client(port, { poolSize: 2 });
    await Promise.all([rpc.call('p', 'go'), rpc.call('p', 'go'), rpc.call('p', 'go')]);
    expect(rpc.poolStats.size).toBeLessThanOrEqual(2);
  });
});

describe('registry and load balancing', () => {
  it('deregisters and expires stale instances', async () => {
    const registry = new InMemoryRegistry({ ttlMs: 50 });
    await registry.register({ id: 'a', name: 'svc', host: '127.0.0.1', port: 1 });
    expect(await registry.discover('svc')).toHaveLength(1);

    await registry.deregister('a');
    expect(await registry.discover('svc')).toHaveLength(0);

    // 被 SIGKILL 的进程没机会注销自己 —— 只能靠 TTL 剔除
    await registry.register({ id: 'b', name: 'svc', host: '127.0.0.1', port: 2 });
    await new Promise((r) => setTimeout(r, 70));
    expect(await registry.discover('svc')).toHaveLength(0);
  });

  it('spreads calls across instances', () => {
    const balancer = new RoundRobinBalancer();
    const instances = [
      { id: 'a', name: 's', host: 'h', port: 1 },
      { id: 'b', name: 's', host: 'h', port: 2 },
    ];
    const picks = [balancer.pick(instances)!.id, balancer.pick(instances)!.id, balancer.pick(instances)!.id];
    expect(picks).toEqual(['a', 'b', 'a']);
  });

  it('honours weights', () => {
    const balancer = new RoundRobinBalancer();
    const instances = [
      { id: 'a', name: 's', host: 'h', port: 1, weight: 2 },
      { id: 'b', name: 's', host: 'h', port: 2, weight: 1 },
    ];
    const picks = Array.from({ length: 3 }, () => balancer.pick(instances)!.id);
    expect(picks).toEqual(['a', 'a', 'b']);
  });

  it('lets a client resolve the target from the registry', async () => {
    const server = new RpcServer();
    server.register('svc', 'ping', () => 'pong');
    const { port } = await server.listen(0, '127.0.0.1');
    servers.push(server);

    const registry = new InMemoryRegistry();
    await registry.register({ id: 'inst-1', name: 'svc', host: '127.0.0.1', port });

    const rpc = client(0, { registry, service: 'svc' });
    await expect(rpc.call('svc', 'ping')).resolves.toBe('pong');
  });

  it('fails clearly when no instance is registered', async () => {
    const registry = new InMemoryRegistry();
    const rpc = client(0, { registry, service: 'missing' });
    await expect(rpc.call('missing', 'go')).rejects.toThrow(/no instance/);
  });
});

describe('server streaming', () => {
  it('streams chunks in order and terminates with the final frame', async () => {
    const server = new RpcServer();
    server.register('tick', 'range', async function* (payload: unknown) {
      const n = (payload as { n: number }).n;
      for (let i = 0; i < n; i++) {
        await new Promise((r) => setTimeout(r, 5));
        yield { i };
      }
    });
    const port = await start(server);
    const rpc = client(port);
    const seen: number[] = [];
    for await (const item of rpc.callStream<{ i: number }>('tick', 'range', { n: 4 })) {
      seen.push(item.i);
    }
    expect(seen).toEqual([0, 1, 2, 3]);
  });

  it('surfaces a mid-stream failure as an rpc error', async () => {
    const server = new RpcServer();
    server.register('tick', 'boom', async function* () {
      yield 1;
      throw new Error('generator exploded');
    });
    const port = await start(server);
    const rpc = client(port);
    const seen: unknown[] = [];
    await expect(async () => {
      for await (const item of rpc.callStream('tick', 'boom')) seen.push(item);
    }).rejects.toThrow(/generator exploded/);
    expect(seen).toEqual([1]);
  });
});

