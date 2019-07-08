/**
 * 内置默认模板。
 *
 * 故意做成**字符串常量而不是外部文件**：包发布时不需要处理资源目录解析
 * （vitest、tsc 产物、pnpm 软链下都容易踩坑），
 * 同时又保留了可覆盖性——把同名 `.tpl` 放进模板目录即可整体替换。
 *
 * 两条约定：
 * 1. `{{#each …}}` 里的 `body` 是 TS 侧**预先渲染好的整段**，模板只负责文件骨架，
 *    这样缩进永远不会失控；
 * 2. 短列表（imports / 装饰器 / 数组字面量）一律用 `…Csv` 预拼好的字符串，
 *    不给模板引擎加"最后一个元素"这类逻辑——那属于 TS 该干的活。
 */

export const DEFAULT_TEMPLATES: Record<string, string> = {
  dto: `{{#if header}}{{ header }}{{/if}}
{{#if imports}}{{ imports }}
{{/if}}{{#if comment}}/**
 * {{ comment }}
 */
{{/if}}export class {{ className }} {
{{#each fields}}{{ this.body }}{{/each}}}
`,

  service: `{{#if header}}{{ header }}{{/if}}
{{#if imports}}{{ imports }}
{{/if}}import { Injectable } from '@nofault/core';

@Injectable()
export class {{ className }} {
{{#each methods}}{{ this.body }}{{/each}}}
`,

  controller: `{{#if header}}{{ header }}{{/if}}
{{#if imports}}{{ imports }}
{{/if}}{{#if classDecorators}}{{ classDecorators }}
{{/if}}@Controller({ path: '{{ path }}'{{#if middlewareCsv}}, middleware: [{{ middlewareCsv }}]{{/if}} })
export class {{ className }} {
  constructor(private readonly service: {{ serviceClass }}) {}
