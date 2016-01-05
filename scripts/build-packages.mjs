#!/usr/bin/env node
/**
 * 按依赖拓扑顺序构建所有 workspace 包。
 *
 * 为什么不用 `tsc -b` 的项目引用：monorepo 里 dev（指向 src）与 build（指向 dist）
 * 需要两套解析规则，用显式拓扑排序 + 逐个 `tsc -p` 更直白、更不容易出错。
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packagesDir = join(root, 'packages');

function readPackage(dir) {
  const pkgPath = join(packagesDir, dir, 'package.json');
  if (!existsSync(pkgPath)) return null;
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  return { dir, name: pkg.name, deps: Object.keys(pkg.dependencies ?? {}) };
}

const packages = readdirSync(packagesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => readPackage(d.name))
  .filter(Boolean);

const nameToDir = new Map(packages.map((p) => [p.name, p.dir]));

// 拓扑排序（仅考虑 workspace 内部依赖）
const visited = new Set();
const visiting = new Set();
const order = [];

function visit(p) {
  if (visited.has(p.name)) return;
  if (visiting.has(p.name)) {
    throw new Error(`Circular dependency detected at package ${p.name}`);
  }
  visiting.add(p.name);
  for (const dep of p.deps) {
    const depDir = nameToDir.get(dep);
    if (!depDir) continue;
    visit(packages.find((x) => x.name === dep));
  }
  visiting.delete(p.name);
  visited.add(p.name);
  order.push(p);
}

for (const p of packages) visit(p);

console.log(`[build] order: ${order.map((p) => p.name).join(' -> ')}`);

for (const p of order) {
  const cwd = join(packagesDir, p.dir);
  const tsconfig = join(cwd, 'tsconfig.build.json');
  if (!existsSync(tsconfig)) {
    console.log(`[build] skip ${p.name} (no tsconfig.build.json)`);
    continue;
  }
  console.log(`[build] ${p.name}`);
  execFileSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['tsc', '-p', 'tsconfig.build.json'],
    { cwd, stdio: 'inherit' },
  );
}

console.log('[build] done');
