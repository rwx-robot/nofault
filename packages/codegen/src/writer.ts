/**
 * 落盘。
 *
 * 生成器和 IO 分开，是这条流水线里**最重要的一个边界**：
 * 生成是纯函数（可测、可 dry-run），写盘才碰文件系统。
 *
 * 覆盖策略的默认值是 `generated`：只覆盖**自己也认领过**的文件
 * （首行是我们写进去的生成标记），用户手工改过的文件一律跳过。
 * 这是唯一的合理默认——代码生成器最恶劣的行为莫过于静默覆盖用户的代码。
 */

import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { GeneratedFile } from './generate';

export type WritePolicy = 'generated' | 'skip' | 'overwrite';

export interface WriteOptions {
  /** 输出根目录 */
  outDir: string;
  /** 覆盖策略，默认 `generated` */
  policy?: WritePolicy;
  /** 只报告打算做什么，不真的写盘 */
  dryRun?: boolean;
  /** 生成标记：判断"这个文件是不是我们生成的" */
  marker?: string;
}

export interface WriteResult {
  written: string[];
  skipped: string[];
  /** 内容有变化的文件（即使没有真的写盘） */