# nofault

> 严格遵循 **Node.js / NestJS 生态规范**的 Node.js 微服务框架，参考行业最佳实践设计。

**当前版本：v0.2.0（HTTP 全栈）**

---

## 是什么

nofault 把业界主流框架的能力矩阵搬到 Node.js：代码生成、约定优于配置、内置服务治理。

补齐 Web 层：Radix 路由、装饰器、中间件链、DTO 校验、统一错误响应。

## 架构概览

_见下方架构文档_

## 快速开始

```bash
pnpm install
pnpm build
pnpm test
pnpm example v0.2.0-rest-user-api
```

- 运行/使用说明 → [`docs/v0.2.0/RUNNING.md`](./docs/v0.2.0/RUNNING.md)
- 架构说明 → [`docs/v0.2.0/ARCHITECTURE.md`](./docs/v0.2.0/ARCHITECTURE.md)
- 变更记录 → [`docs/v0.2.0/CHANGELOG.md`](./docs/v0.2.0/CHANGELOG.md)
- 压测报告 → [`benchmarks/v0.2.0/REPORT.md`](./benchmarks/v0.2.0/REPORT.md)


## 已发布的包

| 包 | 版本 | 职责 |
| --- | --- | --- |
| `@nofault/core` | v0.1.0 | IoC 容器、模块系统、生命周期 |
| `@nofault/config` | v0.1.0 | 配置加载与热更新 |
| `@nofault/logger` | v0.1.0 | 分级结构化日志 |
| `@nofault/http` | v0.1.0 | 底层 HTTP 适配 |
| `@nofault/rest` | v0.2.0 | 路由、装饰器、中间件、DTO 校验 |

## 版本路线

| Tag | 年 | 主题 | 状态 |
| --- | --- | --- | --- |
| v0.1.0 | 2016 | 内核雏形 | ✅ |
| v0.2.0 | 2017 | HTTP 全栈 | ✅ |
| v0.10.0 | 2025 | 工程化工具链 | ✅ |
| v0.3.0 | 2018 | 运行时基座 | 计划 |
| v0.4.0 | 2019 | 代码生成 v1 | 计划 |
| v0.5.0 | 2020 | 数据访问层 | 计划 |
| v0.6.0 | 2021 | RPC 框架 | 计划 |
| v0.7.0 | 2022 | 服务治理 | 计划 |
| v0.8.0 | 2023 | 可观测性 | 计划 |
| v0.9.0 | 2024 | 微服务全家桶 | 计划 |
| v1.0.0 | 2026 | 全量对齐 + 生产增强 | 计划 |

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
