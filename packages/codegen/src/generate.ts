/**
 * 代码生成器：ApiSpec → 一组文件内容。
 *
 * 设计要点：
 * 1. **纯函数**：不写磁盘、不读全局状态，只做 spec → string 的变换。
 *    写盘单独放在 `writer.ts`，这样测试不需要临时目录，也可以做"dry run"。
 * 2. **契约驱动**：所有元信息来自 Spec，生成器不做业务猜测。
 * 3. **生成代码必须能编译**：这是硬要求，集成测试会真的 `tsc` 一遍。
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  FieldSource,
  type ApiSpec,
  type FieldSpec,
  type RouteSpec,
  type ServiceSpec,
  type TypeSpec,
} from '@nofault/dsl';
import { camelCase, kebabCase, pascalCase } from '@nofault/dsl';
import { renderTemplate } from './template';
import { DEFAULT_TEMPLATES } from './default-templates';

export type GeneratedKind =
  | 'dto'
  | 'service'
  | 'controller'
  | 'module'
  | 'app-module'
  | 'entity'
  | 'repository';

export interface GeneratedFile {
  /** 相对输出根目录的路径 */
  path: string;
  content: string;
  kind: GeneratedKind;
}

export interface TemplateOverrides {