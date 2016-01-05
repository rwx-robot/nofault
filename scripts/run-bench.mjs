#!/usr/bin/env node
/**
 * 运行某个版本的 benchmark，并把结果写入该版本的 REPORT.md。
 *
 * 用法：
 *   pnpm bench v0.1.0
 *   node scripts/run-bench.mjs v0.1.0 --duration=10 --connections=64
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);

if (args.length === 0) {
  const available = existsSync(join(root, 'benchmarks'))
    ? readdirSync(join(root, 'benchmarks'), { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
    : [];
  console.log(`用法: node scripts/run-bench.mjs <tag> [args...]\n可用:\n${available.map((n) => `  - ${n}`).join('\n')}`);
  process.exit(available.length ? 0 : 1);
}

const tag = args[0];
const benchDir = join(root, 'benchmarks', tag);
const script = existsSync(join(benchDir, 'bench.mjs')) ? join(benchDir, 'bench.mjs') : join(benchDir, 'bench.js');
if (!existsSync(script)) {
  console.error(`[bench] 未找到脚本: ${script}`);