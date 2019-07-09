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
  dto?: string;
  service?: string;
  controller?: string;
  module?: string;
  'app-module'?: string;
}

export interface GenerateOptions {
  /** 模板覆盖目录：存在 `<dir>/<name>.tpl` 就优先用它 */
  templatesDir?: string;
  /** 是否额外生成根 `app.module.ts` */
  rootModule?: boolean;
  /** 每个文件顶部的注释（用于打"此文件由生成器产生"的标记） */
  header?: string | false;
  /** 尚未支持的校验规则如何处理：`comment`（注释掉）或 `throw` */
  unknownRule?: 'comment' | 'throw';
}

export interface GenerateResult {
  files: GeneratedFile[];
  /** 生成过程中的非致命提示，例如"规则 X 不支持" */
  warnings: string[];
}

const METHOD_NO_BODY = new Set(['GET', 'HEAD', 'DELETE', 'OPTIONS']);

const RULE_TO_DECORATOR: Record<string, (rest: string) => { name: string; args: string[] } | undefined> = {
  isString: () => ({ name: 'IsString', args: [] }),
  isInt: () => ({ name: 'IsInt', args: [] }),
  isNumber: () => ({ name: 'IsNumber', args: [] }),
  isBoolean: () => ({ name: 'IsBoolean', args: [] }),
  isEmail: () => ({ name: 'IsEmail', args: [] }),
  isNotEmpty: () => ({ name: 'IsNotEmpty', args: [] }),
  minLength: (rest) => ({ name: 'MinLength', args: [rest] }),
  maxLength: (rest) => ({ name: 'MaxLength', args: [rest] }),
  min: (rest) => ({ name: 'Min', args: [rest] }),
  max: (rest) => ({ name: 'Max', args: [rest] }),
};

/** 只生成没有语法错的 TypeScript —— 规则值必须是字面量白名单，避免注入模板 */
