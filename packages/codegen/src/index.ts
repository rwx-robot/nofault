/**
 * @nofault/codegen —— 由契约生成代码（v0.4.0）。
 *
 * 流水线：`契约文本 → parser → ApiSpec → validate → generate → write`
 * 生成器本身不碰 IO，`generate()` 是纯函数，写盘交给 `writeFiles()`。
 */
export { generate } from './generate';
export type { GeneratedFile, GeneratedKind, GenerateOptions, GenerateResult, TemplateOverrides } from './generate';

export { validateSpec, assertValidSpec, SpecValidationError } from './validate';
export type { Diagnostic, DiagnosticSeverity } from './validate';

export { generateDataLayer } from './data-generator';
export type { DataLayerOptions } from './data-generator';
export { watchFile, debounce } from './watch';
export type { WatchOptions, WatchHandle } from './watch';

export { openApiDocument } from './openapi';
export type {
  OpenApiDocument,
  OpenApiInfo,
  OpenApiOperation,
  OpenApiOptions,
  OpenApiParameter,
  OpenApiSchema,
} from './openapi';

export { writeFiles } from './writer';
export type { WriteOptions, WritePolicy, WriteResult } from './writer';

export { renderTemplate, lookup, TemplateError } from './template';
export type { TemplateContext } from './template';

export { DEFAULT_TEMPLATES, TEMPLATE_NAMES } from './default-templates';
