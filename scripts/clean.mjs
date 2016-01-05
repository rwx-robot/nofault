#!/usr/bin/env node
/** 清理各包的构建产物与 tsbuildinfo */
import { readdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packagesDir = join(root, 'packages');

for (const dir of readdirSync(packagesDir, { withFileTypes: true })) {
  if (!dir.isDirectory()) continue;
  const dist = join(packagesDir, dir.name, 'dist');
  if (existsSync(dist)) {
    rmSync(dist, { recursive: true, force: true });
    console.log(`[clean] removed ${dir.name}/dist`);
  }