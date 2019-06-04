/**
 * 契约校验：把"生成出半成品代码"挡在生成之前。
 *
 * 生成器**不对 Spec 做任何假设**——但解析器产出的东西可能来自人手写的文本，
 * 里面可能有重复路由、引用了不存在的类型、路径没写斜杠等。
 * 这些若不拦下来，错误会一路流到用户编译项目时才报，排查成本极高。
 *
 * 每个诊断都带**位置信息**（哪个服务、哪个字段），因为"spec 有问题"这种话毫无用处。
 */

import type { ApiSpec, FieldSpec, ServiceSpec, TypeSpec } from '@nofault/dsl';
import { camelCase } from '@nofault/dsl';

export type DiagnosticSeverity = 'error' | 'warning';

export interface Diagnostic {
  severity: DiagnosticSeverity;
  /** 出错位置，如 `service user > route login` */
  at: string;
  message: string;
}

export class SpecValidationError extends Error {
  constructor(public readonly diagnostics: Diagnostic[]) {
    super(
      `Invalid API spec (${diagnostics.length} problem${diagnostics.length === 1 ? '' : 's'}):\n` +
        diagnostics.map((d) => `  - [${d.severity}] ${d.at}: ${d.message}`).join('\n'),
    );
    this.name = 'SpecValidationError';
  }
}

const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS', 'ALL']);
const VALID_RULES = new Set([
  'isString',
  'isInt',
  'isNumber',
  'isBoolean',
  'isEmail',
  'isNotEmpty',
  'minLength',
  'maxLength',
  'min',
  'max',
]);

export function validateSpec(spec: ApiSpec): Diagnostic[] {
  const diags: Diagnostic[] = [];

  if (spec.services.length === 0) {
    diags.push({ severity: 'error', at: spec.name, message: 'no service defined' });
  }

  const typeNames = new Set<string>();
  for (const type of spec.types) {
    if (typeNames.has(type.name)) {
      diags.push({ severity: 'error', at: `type ${type.name}`, message: 'duplicate type name' });
    }
    typeNames.add(type.name);