/**
 * 极简模板引擎（mustache 风格子集）。
 *
 * 只支持三件事：
 * - `{{ path }}` 取值（支持 `a.b.c` 形式的路径）
 * - `{{#if path}} … {{else}} … {{/if}}`
 * - `{{#each items}} … {{/each}}`（块内上下文为当前元素）
 *
 * **为什么不引入完整模板引擎**：代码生成需要的逻辑极少，
 * 引入一个依赖换来的是更大的攻击面和更难预测的报错。
 * 复杂逻辑应该在 TS 里算好再塞进上下文，而不是在模板里写表达式。
 *
 * **为什么不用 TS 模板字符串直接拼**：那样模板就不能被使用者覆盖了。
 * 生成器内置一套默认模板（`templates/*.tpl`），用户放一份同名文件即可整体替换。
 */

export type TemplateContext = Record<string, unknown>;

export class TemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TemplateError';
  }
}

const OPEN = '{{';
const CLOSE = '}}';

export function renderTemplate(source: string, context: TemplateContext): string {
  return new TemplateRenderer(source, context).render();
}

class TemplateRenderer {
  private pos = 0;

  constructor(
    private readonly src: string,
    private readonly ctx: TemplateContext,
  ) {}

  render(): string {
    let out = '';
    while (this.pos < this.src.length) {
      const next = this.src.indexOf(OPEN, this.pos);
      if (next < 0) {
        out += this.src.slice(this.pos);
        break;
      }
      out += this.src.slice(this.pos, next);
      this.pos = next + OPEN.length;

      const end = this.src.indexOf(CLOSE, this.pos);
      if (end < 0) throw new TemplateError('Unclosed template tag');
      const inner = this.src.slice(this.pos, end).trim();