/**
 * @nofault/codegen —— 由契约生成代码（v0.4.0）。
 *
 * 流水线：`契约文本 → parser → ApiSpec → validate → generate → write`
 * 生成器本身不碰 IO，`generate()` 是纯函数，写盘交给 `writeFiles()`。
 */
export { generate } from './generate';
export type { GeneratedFile, GeneratedKind, GenerateOptions, GenerateResult, TemplateOverrides } from './generate';