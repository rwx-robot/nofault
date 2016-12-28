# @nofault/rpc

RPC 框架：长度前缀分帧、连接池、超时重试、注册发现、拦截器。

**引入版本**：v0.6.0

## 为什么这么设计

- TCP 是字节流、**没有消息边界** → 自己分帧（`[4 字节长度][JSON]`）
- 一条连接上可并发多个在途调用 → **请求必须带 id** 才能配对响应
- 只对"可能成功"的失败重试：网络错误、超时、解析错误；业务错误重试只会放大故障
- 按目标**去重在建连接**——否则 N 个并发首调各建一条，池化在最需要它时失效

## 最快上手

```ts
import { RpcServer, RpcClient, InMemoryRegistry } from '@nofault/rpc';

const server = new RpcServer();
server.registerService('user', new UserService());
await server.listen(9000);

const client = new RpcClient({ registry: new InMemoryRegistry() });
const user = await client.call('user', 'get', { id: 1 });
```

## 注意

超时映射成 **504**（Gateway Timeout），不是笼统的 500——504 才是"上游超时"的正确语义。

## 相关文档

- 架构说明 → [`docs/v0.6.0/ARCHITECTURE.md`](../../docs/v0.6.0/ARCHITECTURE.md)
- 变更记录 → [`docs/v0.6.0/CHANGELOG.md`](../../docs/v0.6.0/CHANGELOG.md)
