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