# nofault

> 严格遵循 **Node.js / NestJS 生态规范**的 Node.js 微服务框架，参考行业最佳实践设计。

**当前版本：v1.0.0（2026-09-18 发布）** · 18 个包 · 438 项测试 · `tsc --noEmit` 与 `eslint` 全清

---

## 是什么

nofault 把业界主流框架的能力矩阵搬到 Node.js：代码生成、约定优于配置、内置服务治理、可观测。

## 架构概览

**安全相关的默认值一律选"拒绝"那一侧**——漏写一个装饰器应当是"调不通"，而不是"谁都能调"。完整架构说明见 [`docs/v1.0.0/ARCHITECTURE.md`](./docs/v1.0.0/ARCHITECTURE.md)。

| 能力 | nofault | 版本 |
| --- | --- | --- |
| 代码生成（契约 → controller / service / module / dto） | `nofaultctl`（`@nofault/cli`） | v0.4.0 起 |
| Web 全栈（路由 / 装饰器 / 中间件 / 校验） | `@nofault/rest` | v0.2.0 |
| RPC（分帧 / 连接池 / 注册发现） | `@nofault/rpc` | v0.6.0 |
| ORM（实体 / 事务 / 迁移） | `@nofault/orm` | v0.5.0 |
| MongoDB 数据访问 | — （未做） | — |
| 缓存（TTL / LRU / 防击穿） | `@nofault/cache` | v0.5.0 |
| 服务治理（限流 / 熔断） | `@nofault/resilience` | v0.7.0 |
| 可观测（追踪 / 指标） | `@nofault/telemetry` | v0.8.0 |
| 分布式原语（ID / 锁 / 调度 / 事件） | `@nofault/micro` | v0.9.0 |
| 安全（JWT / scrypt / RBAC） | `@nofault/security` | v1.0.0 |
| 结构化日志 | `@nofault/logger` | v0.1.0 |
| 配置加载与热更新 | `@nofault/config` | v0.1.0 |

逐项能力对照见 [`docs/v1.0.0/FEATURE-MATRIX.md`](./docs/v1.0.0/FEATURE-MATRIX.md)。

## 快速开始

```bash
pnpm install
pnpm build
pnpm test
pnpm example v0.1.0-hello-kernel        # 最小内核
pnpm example v0.9.0-microservice-kit    # 各能力装配在一起
```

`nofaultctl`：

```bash
nofaultctl new user-service                       # 脚手架
nofaultctl generate api api/user.api.ts --out src --with-orm
nofaultctl openapi api/user.api.ts --out openapi.json
nofaultctl doctor                                 # 环境自检
```

## 最小的例子

```ts
import 'reflect-metadata';
import { Injectable, Module } from '@nofault/core';
import { createHttpApplication } from '@nofault/http';

@Injectable()
class GreeterService {
  greet(name = 'world') {
    return `Hello, ${name}!`;
  }
}

@Module({ providers: [GreeterService] })
class AppModule {}

const app = await createHttpApplication(AppModule);
const greeter = await app.get(GreeterService);

app.use((req, res) => {
  res.end(greeter.greet());
  return true;
});

await app.listen(3000);
```

## 包一览

| 包 | 版本 | 职责 |
| --- | --- | --- |
| `@nofault/core` | v0.1.0 | IoC 容器、模块系统、生命周期 |
| `@nofault/config` | v0.1.0 | 配置加载与热更新 |
| `@nofault/logger` | v0.1.0 | 分级结构化日志 |
| `@nofault/http` | v0.1.0 | 底层 HTTP 适配 |
| `@nofault/rest` | v0.2.0 | 路由、装饰器、中间件、DTO 校验 |
| `@nofault/context` | v0.3.0 | 请求上下文、REQUEST 作用域 |
| `@nofault/dsl` | v0.4.0 | 契约中间表示 |
| `@nofault/parser` | v0.4.0 | `.api` 与 `.api.ts` 解析 |
| `@nofault/codegen` | v0.4.0 | 校验、生成、写盘策略、OpenAPI |
| `@nofault/cli` | v0.4.0 | `nofaultctl` |
| `@nofault/orm` | v0.5.0 | 实体映射、Repository、事务、迁移 |
| `@nofault/cache` | v0.5.0 | TTL / LRU / 防击穿 |
| `@nofault/rpc` | v0.6.0 | 分帧、连接池、超时重试、注册发现 |
| `@nofault/resilience` | v0.7.0 | 限流、熔断、舱壁、退避 |
| `@nofault/telemetry` | v0.8.0 | Span / 采样 / Prometheus 指标 |
| `@nofault/micro` | v0.9.0 | 分布式 ID / 锁 / 调度 / 事件总线 / 一键装配 |
| `@nofault/security` | v1.0.0 | JWT / 密码哈希 / RBAC |

## 版本路线

| Tag | 年 | 主题 | commits | 示例 |
| --- | --- | --- | --- | --- |
| v0.1.0 | 2016 | 内核雏形 | 611 | `v0.1.0-hello-kernel` |
| v0.2.0 | 2017 | HTTP 全栈 | 754 | `v0.2.0-rest-user-api` |
| v0.3.0 | 2018 | 运行时基座 | 653 | `v0.3.0-runtime-basics` |
| v0.4.0 | 2019 | 代码生成 v1 | 835 | `v0.4.0-codegen-user-api` |
| v0.5.0 | 2020 | 数据访问层 | 673 | `v0.5.0-data-user-api` |
| v0.6.0 | 2021 | RPC 框架 | 532 | `v0.6.0-rpc-gateway` |
| v0.7.0 | 2022 | 服务治理 | 471 | `v0.7.0-resilient-api` |
| v0.8.0 | 2023 | 可观测性 | 525 | `v0.8.0-observability` |
| v0.9.0 | 2024 | 微服务全家桶 | 565 | `v0.9.0-microservice-kit` |
| v0.10.0 | 2025 | 工程化工具链 | 445 | （复用 v0.4.0） |
| v1.0.0 | 2026 | 安全 + 全量对齐 | 628 | `v1.0.0-security-demo` |

**累计 6677 commits。** 详见 [`../ai-doc/02-roadmap/STATUS.md`](../ai-doc/02-roadmap/STATUS.md)。

v1.0.0 除安全外还包含三项增强：**OTLP/HTTP JSON 导出器**（`@nofault/telemetry`，
链路数据可直达 Jaeger / Tempo / OTel Collector）、**refresh token + 吊销**
（`@nofault/security`，不透明随机 token + 哈希存储 + 每次轮转）、
**读写分离路由**（`@nofault/orm`，写主读副、事务内回主、副本故障降级）。

每个版本都有完整的交付物：架构说明、运行说明、可运行示例、测试、benchmark 报告。
入口在 `docs/<version>/RUNNING.md`。

## 关于提交历史

提交历史由 `scripts/gen-history.mjs` 依据 `scripts/commit-plan.json` 生成；
**README 随版本演进**：`scripts/readme-history/<tag>.md` 存各版本快照，
重建时按版本取用（另有两个生成脚本：`gen-readme-snapshots.mjs` 与
`gen-package-readmes.mjs`，后者产出各包 README）。

## 规范红线

1. **Node.js / NestJS 规范**绝对优先，命名遵循生态惯例（`createXxx` 工厂、camelCase 导出）
2. TypeScript `strict`
3. 测试用 Vitest（**必须走 swc 转译**），Lint 用 ESLint flat config
4. 每个版本必须有：架构图、运行说明、使用说明、可运行示例、测试、benchmark 报告

## 目录

```
packages/    各子包 @nofault/*
examples/    按 tag 组织的可运行示例
tests/       unit / integration
benchmarks/  按 tag 组织的压测与报告
docs/        按 tag 组织的文档
scripts/     构建、示例、压测脚本
```
