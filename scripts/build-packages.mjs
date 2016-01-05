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