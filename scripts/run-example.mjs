#!/usr/bin/env node
/**
 * 运行示例：构建依赖包 → 编译示例 → 启动进程。
 *
 * 用法：
 *   pnpm example v0.1.0-hello-kernel
 *   node scripts/run-example.mjs v0.1.0-hello-kernel PORT=3111
 *
 * 为什么不用 tsx 直接跑 TS：esbuild 不支持 `emitDecoratorMetadata`，
 * 而 nofault 的构造函数注入依赖 `design:paramtypes`，必须先过一遍 tsc。
 */
import { spawnSync, spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);

if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  const available = existsSync(join(root, 'examples'))
    ? readdirSync(join(root, 'examples'), { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
    : [];
  console.log(`用法: node scripts/run-example.mjs <example-dir> [ENV=value ...]\n`);
  console.log(`可用示例:\n${available.map((n) => `  - ${n}`).join('\n')}`);
  process.exit(available.length ? 0 : 1);
}

const name = args[0];
const exampleDir = join(root, 'examples', name);
if (!existsSync(exampleDir)) {
  console.error(`[example] 未找到示例: ${name}`);
  process.exit(1);
}

const env = { ...process.env };
for (const arg of args.slice(1)) {
  const idx = arg.indexOf('=');
  if (idx > 0) env[arg.slice(0, idx)] = arg.slice(idx + 1);