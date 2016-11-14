#!/usr/bin/env node
/**
 * v0.10.0 Benchmark —— 工具链该有多快
 *
 * 工具链的速度标准只有一条：**要快到能挂在保存钩子上**。
 * 一旦慢到需要"手动跑一下"，它就不再是被信任的那份文档了。
 *
 * 用法：node bench.mjs [--iterations=200] [--report]
 */
import { writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');

const args = { iterations: 200, report: false };
for (const a of process.argv.slice(2)) {
  const [k, v] = a.replace(/^--/, '').split('=');
  if (k === 'report') args.report = true;
  else if (k === 'iterations') args.iterations = Number(v);
}

const { parseContractFile } = await import(join(repoRoot, 'packages/parser/dist/index.js'));
const { openApiDocument } = await import(join(repoRoot, 'packages/codegen/dist/index.js'));
const { doctor } = await import(join(repoRoot, 'packages/cli/dist/commands/doctor.js'));

const contract = join(repoRoot, 'examples/v0.4.0-codegen-user-api/api/user.api.ts');

function round(n) {
  return Math.round(n * 100) / 100;
}

async function bench(name, fn, iterations = args.iterations) {
  const spec = await parseContractFile(contract, 'user.api.ts');
  void spec;
  await fn();
  const samples = [];
  for (let i = 0; i < iterations; i++) {
    const t = process.hrtime.bigint();
    await fn();
    samples.push(Number(process.hrtime.bigint() - t) / 1e6);
  }
  samples.sort((a, b) => a - b);
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  return {
    name,
    meanMs: round(mean),