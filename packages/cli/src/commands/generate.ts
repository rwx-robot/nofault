/**
 * `nofaultctl generate api <contract>` —— 契约 → 代码。
 *
 * 链路：`parser → Spec → validate → generate → write`
 *
 * 顺序有讲究：**先校验再生成**。
 * 校验失败时一个文件都不写，否则用户会拿到半套代码，
 * 编译错报指向生成物，而真正要改的是契约。
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ApiSpec } from '@nofault/dsl';
import { generate, generateDataLayer, writeFiles, validateSpec, watchFile } from '@nofault/codegen';
import type { GeneratedFile, WritePolicy } from '@nofault/codegen';
import { parseContractFile } from '@nofault/parser';
import { log, printSummary } from '../log';

export interface GenerateApiOptions {
  /** 契约文件路径 */
  contract: string;
  /** 输出根目录，默认 `src` */
  out?: string;
  /** 模板覆盖目录 */
  templates?: string;
  /** 是否额外生成根模块 */