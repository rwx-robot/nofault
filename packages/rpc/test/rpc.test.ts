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
