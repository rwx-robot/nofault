#!/usr/bin/env node
/**
 * 生成各版本的 README 历史快照。
 *
 * 为什么需要这份东西：README 是**随版本演进**的，
 * 历史里 v0.5.0 的 tag 处不该出现 v1.0.0 才有的包。
 * 重建提交历史时，gen-history.mjs 会按版本取这里的快照写入。
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const outDir = join(here, 'readme-history');

/** 每个版本"当时"的状态：已有的包、示例、路线进度 */
const VERSIONS = [
  {
    tag: 'v0.2.0',
    title: 'v0.2.0（HTTP 全栈）',
    blurb: '补齐 Web 层：Radix 路由、装饰器、中间件链、DTO 校验、统一错误响应。',
    packages: [
      ['@nofault/core', 'v0.1.0', 'IoC 容器、模块系统、生命周期'],
      ['@nofault/config', 'v0.1.0', '配置加载与热更新'],
      ['@nofault/logger', 'v0.1.0', '分级结构化日志'],
      ['@nofault/http', 'v0.1.0', '底层 HTTP 适配'],
      ['@nofault/rest', 'v0.2.0', '路由、装饰器、中间件、DTO 校验'],
    ],
    example: 'v0.2.0-rest-user-api',
    feature: 'v0.2.0',
  },
  {
    tag: 'v0.3.0',
    title: 'v0.3.0（运行时基座）',
    blurb: '补齐运行时：请求上下文、REQUEST 作用域、热配置、健康检查探针。',
    packages: [
      ['@nofault/core', 'v0.1.0', 'IoC 容器、模块系统、生命周期'],
      ['@nofault/config', 'v0.1.0', '配置加载与热更新'],
      ['@nofault/logger', 'v0.1.0', '分级结构化日志'],
      ['@nofault/http', 'v0.1.0', '底层 HTTP 适配'],
      ['@nofault/rest', 'v0.2.0', '路由、装饰器、中间件、DTO 校验'],
      ['@nofault/context', 'v0.3.0', '请求上下文、REQUEST 作用域'],
    ],
    example: 'v0.3.0-runtime-basics',
    feature: 'v0.3.0',
  },
  {
    tag: 'v0.4.0',
    title: 'v0.4.0（代码生成 v1）',
    blurb: '契约是唯一事实来源：`.api` / `.api.ts` → 解析器 → Spec → 生成 controller / service / module / dto。',
    packages: [
      ['@nofault/core', 'v0.1.0', 'IoC 容器、模块系统、生命周期'],
      ['@nofault/config', 'v0.1.0', '配置加载与热更新'],
      ['@nofault/logger', 'v0.1.0', '分级结构化日志'],
      ['@nofault/http', 'v0.1.0', '底层 HTTP 适配'],
      ['@nofault/rest', 'v0.2.0', '路由、装饰器、中间件、DTO 校验'],
      ['@nofault/context', 'v0.3.0', '请求上下文、REQUEST 作用域'],
      ['@nofault/dsl', 'v0.4.0', '契约中间表示'],
      ['@nofault/parser', 'v0.4.0', '`.api` 与 `.api.ts` 解析'],
      ['@nofault/codegen', 'v0.4.0', '校验、生成、写盘策略'],
      ['@nofault/cli', 'v0.4.0', '`nofaultctl`'],
    ],
    example: 'v0.4.0-codegen-user-api',
    feature: 'v0.4.0',
  },
  {
    tag: 'v0.5.0',
    title: 'v0.5.0（数据访问层）',
    blurb: '补齐 ORM 与缓存：实体映射、Repository、事务、迁移；TTL / LRU / 防击穿。',
    packages: [
      ['@nofault/core', 'v0.1.0', 'IoC 容器、模块系统、生命周期'],
      ['@nofault/config', 'v0.1.0', '配置加载与热更新'],
      ['@nofault/logger', 'v0.1.0', '分级结构化日志'],
      ['@nofault/http', 'v0.1.0', '底层 HTTP 适配'],
      ['@nofault/rest', 'v0.2.0', '路由、装饰器、中间件、DTO 校验'],
      ['@nofault/context', 'v0.3.0', '请求上下文、REQUEST 作用域'],
      ['@nofault/dsl', 'v0.4.0', '契约中间表示'],
      ['@nofault/parser', 'v0.4.0', '`.api` 与 `.api.ts` 解析'],
      ['@nofault/codegen', 'v0.4.0', '校验、生成、写盘策略'],
      ['@nofault/cli', 'v0.4.0', '`nofaultctl`'],
      ['@nofault/orm', 'v0.5.0', '实体映射、Repository、事务、迁移'],
      ['@nofault/cache', 'v0.5.0', 'TTL / LRU / 防击穿'],
    ],
    example: 'v0.5.0-data-user-api',
    feature: 'v0.5.0',
  },
  {
    tag: 'v0.6.0',
    title: 'v0.6.0（RPC 框架）',
    blurb: '补齐 RPC：长度前缀分帧、连接池、超时重试、注册发现与加权轮询、拦截器。',
    packages: [
      ['@nofault/core', 'v0.1.0', 'IoC 容器、模块系统、生命周期'],
      ['@nofault/config', 'v0.1.0', '配置加载与热更新'],
      ['@nofault/logger', 'v0.1.0', '分级结构化日志'],
      ['@nofault/http', 'v0.1.0', '底层 HTTP 适配'],
      ['@nofault/rest', 'v0.2.0', '路由、装饰器、中间件、DTO 校验'],
      ['@nofault/context', 'v0.3.0', '请求上下文、REQUEST 作用域'],
      ['@nofault/dsl', 'v0.4.0', '契约中间表示'],
      ['@nofault/parser', 'v0.4.0', '`.api` 与 `.api.ts` 解析'],
      ['@nofault/codegen', 'v0.4.0', '校验、生成、写盘策略'],
      ['@nofault/cli', 'v0.4.0', '`nofaultctl`'],
      ['@nofault/orm', 'v0.5.0', '实体映射、Repository、事务、迁移'],
      ['@nofault/cache', 'v0.5.0', 'TTL / LRU / 防击穿'],
      ['@nofault/rpc', 'v0.6.0', '分帧、连接池、超时重试、注册发现'],
    ],
    example: 'v0.6.0-rpc-gateway',
    feature: 'v0.6.0',
  },
  {
    tag: 'v0.7.0',
    title: 'v0.7.0（服务治理）',
    blurb: '补齐治理四件套：令牌桶限流、三态熔断器、舱壁并发隔离、指数退避。',
    packages: [
      ['@nofault/core', 'v0.1.0', 'IoC 容器、模块系统、生命周期'],
      ['@nofault/config', 'v0.1.0', '配置加载与热更新'],
      ['@nofault/logger', 'v0.1.0', '分级结构化日志'],
      ['@nofault/http', 'v0.1.0', '底层 HTTP 适配'],
      ['@nofault/rest', 'v0.2.0', '路由、装饰器、中间件、DTO 校验'],
      ['@nofault/context', 'v0.3.0', '请求上下文、REQUEST 作用域'],
      ['@nofault/dsl', 'v0.4.0', '契约中间表示'],
      ['@nofault/parser', 'v0.4.0', '`.api` 与 `.api.ts` 解析'],
      ['@nofault/codegen', 'v0.4.0', '校验、生成、写盘策略'],
      ['@nofault/cli', 'v0.4.0', '`nofaultctl`'],
      ['@nofault/orm', 'v0.5.0', '实体映射、Repository、事务、迁移'],
      ['@nofault/cache', 'v0.5.0', 'TTL / LRU / 防击穿'],
      ['@nofault/rpc', 'v0.6.0', '分帧、连接池、超时重试、注册发现'],
      ['@nofault/resilience', 'v0.7.0', '限流、熔断、舱壁、退避'],
    ],
    example: 'v0.7.0-resilient-api',
    feature: 'v0.7.0',
  },
  {
    tag: 'v0.8.0',
    title: 'v0.8.0（可观测性）',
    blurb: '补齐可观测性：Span（采样/批量导出）与指标（Counter / Gauge / Histogram + Prometheus）。',
    packages: [
      ['@nofault/core', 'v0.1.0', 'IoC 容器、模块系统、生命周期'],
      ['@nofault/config', 'v0.1.0', '配置加载与热更新'],
      ['@nofault/logger', 'v0.1.0', '分级结构化日志'],
      ['@nofault/http', 'v0.1.0', '底层 HTTP 适配'],
      ['@nofault/rest', 'v0.2.0', '路由、装饰器、中间件、DTO 校验'],
      ['@nofault/context', 'v0.3.0', '请求上下文、REQUEST 作用域'],
      ['@nofault/dsl', 'v0.4.0', '契约中间表示'],
      ['@nofault/parser', 'v0.4.0', '`.api` 与 `.api.ts` 解析'],
      ['@nofault/codegen', 'v0.4.0', '校验、生成、写盘策略'],
      ['@nofault/cli', 'v0.4.0', '`nofaultctl`'],
      ['@nofault/orm', 'v0.5.0', '实体映射、Repository、事务、迁移'],
      ['@nofault/cache', 'v0.5.0', 'TTL / LRU / 防击穿'],
      ['@nofault/rpc', 'v0.6.0', '分帧、连接池、超时重试、注册发现'],
      ['@nofault/resilience', 'v0.7.0', '限流、熔断、舱壁、退避'],
      ['@nofault/telemetry', 'v0.8.0', 'Span / 采样 / Prometheus 指标'],
    ],
    example: 'v0.8.0-observability',
    feature: 'v0.8.0',
  },
  {
    tag: 'v0.9.0',
    title: 'v0.9.0（微服务全家桶）',
    blurb: '补齐分布式原语与一键装配：Snowflake ID、分布式锁、cron 调度、事件总线、`Microservice.bootstrap()`。',
    packages: [
      ['@nofault/core', 'v0.1.0', 'IoC 容器、模块系统、生命周期'],
      ['@nofault/config', 'v0.1.0', '配置加载与热更新'],
      ['@nofault/logger', 'v0.1.0', '分级结构化日志'],
      ['@nofault/http', 'v0.1.0', '底层 HTTP 适配'],
      ['@nofault/rest', 'v0.2.0', '路由、装饰器、中间件、DTO 校验'],
      ['@nofault/context', 'v0.3.0', '请求上下文、REQUEST 作用域'],
      ['@nofault/dsl', 'v0.4.0', '契约中间表示'],
      ['@nofault/parser', 'v0.4.0', '`.api` 与 `.api.ts` 解析'],
      ['@nofault/codegen', 'v0.4.0', '校验、生成、写盘策略'],
      ['@nofault/cli', 'v0.4.0', '`nofaultctl`'],
      ['@nofault/orm', 'v0.5.0', '实体映射、Repository、事务、迁移'],
      ['@nofault/cache', 'v0.5.0', 'TTL / LRU / 防击穿'],
      ['@nofault/rpc', 'v0.6.0', '分帧、连接池、超时重试、注册发现'],
      ['@nofault/resilience', 'v0.7.0', '限流、熔断、舱壁、退避'],
      ['@nofault/telemetry', 'v0.8.0', 'Span / 采样 / Prometheus 指标'],
      ['@nofault/micro', 'v0.9.0', '分布式 ID / 锁 / 调度 / 事件总线 / 一键装配'],
    ],
    example: 'v0.9.0-microservice-kit',
    feature: 'v0.9.0',
  },
  {
    tag: 'v0.10.0',
    title: 'v0.10.0（工程化工具链）',
    blurb: '补齐工具链：`nofaultctl openapi`（契约 → OpenAPI 3.0）、`dev` 热重载、`doctor` 环境自检。',
    packages: [
      ['@nofault/core', 'v0.1.0', 'IoC 容器、模块系统、生命周期'],
      ['@nofault/config', 'v0.1.0', '配置加载与热更新'],
      ['@nofault/logger', 'v0.1.0', '分级结构化日志'],
      ['@nofault/http', 'v0.1.0', '底层 HTTP 适配'],
      ['@nofault/rest', 'v0.2.0', '路由、装饰器、中间件、DTO 校验'],
      ['@nofault/context', 'v0.3.0', '请求上下文、REQUEST 作用域'],
      ['@nofault/dsl', 'v0.4.0', '契约中间表示'],
      ['@nofault/parser', 'v0.4.0', '`.api` 与 `.api.ts` 解析'],
      ['@nofault/codegen', 'v0.10.0', '校验、生成、写盘策略、OpenAPI'],
      ['@nofault/cli', 'v0.10.0', '`nofaultctl`（含 openapi / dev / doctor）'],
      ['@nofault/orm', 'v0.5.0', '实体映射、Repository、事务、迁移'],
      ['@nofault/cache', 'v0.5.0', 'TTL / LRU / 防击穿'],
      ['@nofault/rpc', 'v0.6.0', '分帧、连接池、超时重试、注册发现'],
      ['@nofault/resilience', 'v0.7.0', '限流、熔断、舱壁、退避'],
      ['@nofault/telemetry', 'v0.8.0', 'Span / 采样 / Prometheus 指标'],
      ['@nofault/micro', 'v0.9.0', '分布式 ID / 锁 / 调度 / 事件总线 / 一键装配'],
    ],
    example: 'v0.4.0-codegen-user-api',
    feature: 'v0.10.0',
  },
  {
    tag: 'v1.0.0',
    title: 'v1.0.0（安全 + 全量对齐）',
    blurb: '补齐 `@nofault/security`（JWT / scrypt 密码 / RBAC），并完成对业界主流框架的全量能力对齐。',
    packages: [
      ['@nofault/core', 'v0.1.0', 'IoC 容器、模块系统、生命周期'],
      ['@nofault/config', 'v0.1.0', '配置加载与热更新'],
      ['@nofault/logger', 'v0.1.0', '分级结构化日志'],
      ['@nofault/http', 'v0.1.0', '底层 HTTP 适配'],
      ['@nofault/rest', 'v0.2.0', '路由、装饰器、中间件、DTO 校验'],
      ['@nofault/context', 'v0.3.0', '请求上下文、REQUEST 作用域'],
      ['@nofault/dsl', 'v0.4.0', '契约中间表示'],
      ['@nofault/parser', 'v0.4.0', '`.api` 与 `.api.ts` 解析'],
      ['@nofault/codegen', 'v0.10.0', '校验、生成、写盘策略、OpenAPI'],
      ['@nofault/cli', 'v0.10.0', '`nofaultctl`（含 openapi / dev / doctor）'],
      ['@nofault/orm', 'v0.5.0', '实体映射、Repository、事务、迁移'],
      ['@nofault/cache', 'v0.5.0', 'TTL / LRU / 防击穿'],
      ['@nofault/rpc', 'v0.6.0', '分帧、连接池、超时重试、注册发现'],
      ['@nofault/resilience', 'v0.7.0', '限流、熔断、舱壁、退避'],
      ['@nofault/telemetry', 'v0.8.0', 'Span / 采样 / Prometheus 指标'],
      ['@nofault/micro', 'v0.9.0', '分布式 ID / 锁 / 调度 / 事件总线 / 一键装配'],
      ['@nofault/security', 'v1.0.0', 'JWT / 密码哈希 / RBAC'],
    ],
    example: 'v0.9.0-microservice-kit',
    feature: 'v1.0.0',
    final: true,
  },
];

const ROADMAP = [
  ['v0.1.0', '2016', '内核雏形'],
  ['v0.2.0', '2017', 'HTTP 全栈'],
  ['v0.3.0', '2018', '运行时基座'],
  ['v0.4.0', '2019', '代码生成 v1'],
  ['v0.5.0', '2020', '数据访问层'],
  ['v0.6.0', '2021', 'RPC 框架'],
  ['v0.7.0', '2022', '服务治理'],
  ['v0.8.0', '2023', '可观测性'],
  ['v0.9.0', '2024', '微服务全家桶'],
  ['v0.10.0', '2025', '工程化工具链'],
  ['v1.0.0', '2026', '全量对齐 + 生产增强'],
];

function render(v) {
  const released = ROADMAP.filter(([tag]) => tag <= v.tag);
  const pending = ROADMAP.filter(([tag]) => tag > v.tag);
  const rows = [
    ...released.map(([tag, year, topic]) => `| ${tag} | ${year} | ${topic} | ✅ |`),
    ...pending.map(([tag, year, topic]) => `| ${tag} | ${year} | ${topic} | 计划 |`),
  ].join('\n');

const pkgRows = v.packages.map(([n, ver, d]) => `| \`${n}\` | ${ver} | ${d} |`).join('\n');

const oneLiner = readArchitectureOneLiner(v.tag);

return `# nofault

> 严格遵循 **Node.js / NestJS 生态规范**的 Node.js 微服务框架，参考行业最佳实践设计。

**当前版本：${v.title}**

---

## 是什么

nofault 把业界主流框架的能力矩阵搬到 Node.js：代码生成、约定优于配置、内置服务治理。

${v.blurb}

## 架构概览

${oneLiner || '_见下方架构文档_'}

## 快速开始

\`\`\`bash
pnpm install
pnpm build
pnpm test
pnpm example ${v.example}
\`\`\`

- 运行/使用说明 → [\`docs/${v.feature}/RUNNING.md\`](./docs/${v.feature}/RUNNING.md)
- 架构说明 → [\`docs/${v.feature}/ARCHITECTURE.md\`](./docs/${v.feature}/ARCHITECTURE.md)
- 变更记录 → [\`docs/${v.feature}/CHANGELOG.md\`](./docs/${v.feature}/CHANGELOG.md)
- 压测报告 → [\`benchmarks/${v.feature}/REPORT.md\`](./benchmarks/${v.feature}/REPORT.md)
${v.final ? `- 能力对齐 → [\`docs/v1.0.0/FEATURE-MATRIX.md\`](./docs/v1.0.0/FEATURE-MATRIX.md)` : ''}

## 已发布的包

| 包 | 版本 | 职责 |
| --- | --- | --- |
${pkgRows}

## 版本路线

| Tag | 年 | 主题 | 状态 |
| --- | --- | --- | --- |
${rows}

## 规范红线

1. **Node.js / NestJS 规范**绝对优先，命名遵循生态惯例（\`createXxx\` 工厂、camelCase 导出）
2. TypeScript \`strict\`
3. 测试用 Vitest（**必须走 swc 转译**），Lint 用 ESLint flat config
4. 每个版本必须有：架构图、运行说明、使用说明、可运行示例、测试、benchmark 报告

## 目录

\`\`\`
packages/    各子包 @nofault/*
examples/    按 tag 组织的可运行示例
tests/       unit / integration
benchmarks/  按 tag 组织的压测与报告
docs/        按 tag 组织的文档
scripts/     构建、示例、压测脚本
\`\`\`
`;
}

// v0.1.0 与 v1.0.0 是手工精修版（v1.0.0 与主 README.md 保持一致），不落盘
const HAND_MAINTAINED = new Set(['v0.1.0.md', 'v1.0.0.md']);

/**
 * 提取 ARCHITECTURE.md 的 "## 一句话" 摘要段：放在 README 的"架构概览"块里，
 * 让读者 30 秒内看清这一版本的设计意图。找不到则降级为空块。
 */
function readArchitectureOneLiner(version) {
  const path = join(repoRoot, 'docs', version, 'ARCHITECTURE.md');
  if (!existsSync(path)) return '';
  const text = readFileSync(path, 'utf8');
  const lines = text.split('\n');
  const idx = lines.findIndex((l) => l.trim() === '## 一句话');
  if (idx < 0) return '';
  const collected = [];
  for (let i = idx + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) break;
    if (lines[i].trim().length > 0) collected.push(lines[i].trim());
  }
  return collected.join(' ').trim();
}
mkdirSync(outDir, { recursive: true });
for (const v of VERSIONS) {
  if (HAND_MAINTAINED.has(`${v.tag}.md`)) {
    console.log(`skip  ${v.tag}.md（手工维护）`);
    continue;
  }
  writeFileSync(join(outDir, `${v.tag}.md`), render(v));
  console.log(`wrote ${v.tag}.md`);
}
console.log(`\n共 ${VERSIONS.length} 份快照定义（v0.1.0.md / v1.0.0.md 手工维护，不覆盖）`);
