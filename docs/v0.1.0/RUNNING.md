# nofault v0.1.0 运行说明

## 环境要求

- Node.js **≥ 20**（开发用 v22.22.2）
- pnpm **≥ 9**（开发用 v12.3.4）

## 一键安装

```bash
cd nofault-all/nofault
pnpm install
```

## 构建

```bash
pnpm build
# 等价：node scripts/build-packages.mjs
# 会按依赖拓扑顺序构建：core → config → http → logger
```

## 跑测试

```bash
pnpm test          # 全部测试（36 项，含集成测试）
pnpm test:cov      # 带覆盖率
pnpm vitest run packages/core/test/container.test.ts   # 只跑某个文件
```

> 测试用 **swc** 转译（不是 esbuild）——因为 esbuild 不支持 `emitDecoratorMetadata`，
> 而 nofault 的构造函数按类型注入依赖 `design:paramtypes`。详见 `vitest.config.ts`。

## 跑示例

```bash
pnpm example v0.1.0-hello-kernel
# 自定义端口
pnpm example v0.1.0-hello-kernel PORT=3111
```

脚本会依次执行：构建 workspace 包 → `tsc` 编译示例 → `node dist/main.js`。

服务起来后：

```bash
curl http://127.0.0.1:3000/
# nofault v0.1.0 hello-kernel. Try GET /hello?name=world or GET /health

curl "http://127.0.0.1:3000/hello?name=world"
# {"message":"Hello from nofault, world!","app":"hello-kernel"}

curl http://127.0.0.1:3000/health
# {"status":"ok","app":"hello-kernel","uptime":3}

curl -i http://127.0.0.1:3000/nope
# HTTP/1.1 404 Not Found
```

环境变量覆盖配置（12-factor）：

```bash
NOFAULT_APP__GREETING="Hi there" pnpm example v0.1.0-hello-kernel
# curl /hello → {"message":"Hi there!","app":"hello-kernel"}
```

停止：`Ctrl-C`（会走优雅退出，先停止监听再排在途请求）。
