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
      this.pos = end + CLOSE.length;

      // 消费块要到收尾标签（会把 body 传出来），否则是普通插值
      const block = this.tryBlock(inner, this.ctx);
      if (block !== null) {
        out += block;
        continue;
      }
      const value = lookup(this.ctx, inner);
      out += stringify(value);
    }
    return out;
  }

  /** 识别并消费一个块标签，返回渲染结果；不是块则返回 null */
  private tryBlock(tag: string, ctx: TemplateContext): string | null {
    if (tag.startsWith('#each ')) {
      const list = lookup(ctx, tag.slice('#each '.length).trim());
      const body = this.readBodyWithElse('each').body;
      if (!Array.isArray(list)) {
        if (list === undefined || list === null || list === false) return '';
        throw new TemplateError(`#each expects an array, got ${typeof list}`);
      }
      return list.map((item) => renderTemplate(body, { ...ctx, ...asObject(item), this: item })).join('');
    }

    if (tag.startsWith('#if ')) {
      const cond = lookup(ctx, tag.slice('#if '.length).trim());
      const { body, elseBody } = this.readBodyWithElse('if');
      return truthy(cond) ? renderTemplate(body, ctx) : renderTemplate(elseBody, ctx);
    }

    if (tag.startsWith('#unless ')) {
      const cond = lookup(ctx, tag.slice('#unless '.length).trim());
      const body = this.readBodyWithElse('unless').body;
      return truthy(cond) ? '' : renderTemplate(body, ctx);
    }

    return null;
  }

  /**
   * 读到配对的 `{{/name}}`，返回块内容。
   *
   * 关键点是**嵌套块要原样保留**：body 里仍然带着 `{{#each inner}}` 这样的原文，
   * 等外层 `renderTemplate(body, ctx)` 递归时再处理。若在此时就把内层标签吃掉，
   * 嵌套列表永远拿不到正确的上下文。
   */
  private readBodyWithElse(name: string): { body: string; elseBody: string } {
    let body = '';
    let elseBody = '';
    let inElse = false;
    let depth = 1;