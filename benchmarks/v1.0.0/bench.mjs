#!/usr/bin/env node
/**
 * v1.0.0 Benchmark —— 安全原语的成本
 *
 * 与治理/可观测不同，安全原语有两个"反常"的指标：
 * - **密码哈希必须慢**。快 = 能被暴力破解。这里量的是"慢到什么程度"
 * - **JWT 验签必须快**。它是每条请求的固定成本
 *
 * 用法：node bench.mjs [--iterations=2000] [--report]
 */
import { writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');

const args = { iterations: 2000, report: false };
for (const a of process.argv.slice(2)) {
  const [k, v] = a.replace(/^--/, '').split('=');
  if (k === 'report') args.report = true;
  else if (k === 'iterations') args.iterations = Number(v);
}

const { Jwt, hashPassword, verifyPassword } = await import(
  join(repoRoot, 'packages/security/dist/index.js')
);

function round(n) {