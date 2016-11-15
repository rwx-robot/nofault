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

## 跑基准测试

```bash
pnpm bench v0.1.0
# 自定义参数
pnpm bench v0.1.0 --duration=10 --connections=64 --warmup=2 --rounds=3 --report
```

- 被测服务与压测器**分进程**运行，避免互相抢 CPU 导致数据失真
- 多轮交替测量，取 RPS 中位数轮次
- `--report` 会把结果写入 `benchmarks/v0.1.0/results.json`

## Lint / 格式化

```bash
pnpm lint
pnpm lint:fix
pnpm format
```

## 目录导航

```
packages/core       内核：IoC / 模块 / 生命周期
packages/config     配置
packages/logger     日志
packages/http       node:http 适配器
examples/v0.1.0-hello-kernel   可运行示例
tests/integration/v0.1.0       集成测试
benchmarks/v0.1.0              压测与报告
docs/v0.1.0                    文档
```
