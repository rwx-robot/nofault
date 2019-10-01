/**
 * `nofaultctl mcp new <project>` —— 一键生成可跑的 MCP 服务器工程。
 *
 * 设计与 `commands/new.ts` 同源（生成一个立刻能跑的工程，而不是一堆 TODO）：
 * 1. 写出工程骨架（package.json / tsconfig / main.ts）
 * 2. 写出示例 tool（echo）+ 典型 MCP 客户端配置片段
 * 3. 依赖里加 `@nofault/mcp`，但不锁具体子版本（用 workspace 协议之外的常见写法）
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pascalCase, kebabCase } from '@nofault/dsl';
import { log } from '../log';

export interface McpNewOptions {
  /** 目标目录（默认等于项目名） */
  dir?: string;
}

export interface McpNewResult {
  dir: string;
  files: string[];
}

export function scaffoldMcp(name: string, options: McpNewOptions = {}): McpNewResult {
  const dir = resolve(options.dir ?? name);
  if (existsSync(dir) && readdirSync(dir).length > 0) {
    throw new Error(`directory already exists and is not empty: ${dir}`);
  }
