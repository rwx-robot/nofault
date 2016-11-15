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