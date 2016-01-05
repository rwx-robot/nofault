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
