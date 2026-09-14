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