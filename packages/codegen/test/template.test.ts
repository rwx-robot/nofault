import { describe, expect, it } from 'vitest';
import { renderTemplate, lookup, TemplateError } from '../src/template';

describe('renderTemplate', () => {
  it('interpolates plain values', () => {
    expect(renderTemplate('hi {{ name }}!', { name: 'bob' })).toBe('hi bob!');
  });

  it('resolves dotted paths', () => {
    const ctx = { user: { profile: { age: 3 } } };
    expect(renderTemplate('{{ user.profile.age }}', ctx)).toBe('3');
  });

  it('renders missing values as empty string instead of "undefined"', () => {
    // 模板里缺字段非常常见；输出 "undefined" 会生成出语法正确但语义错误的代码
    expect(renderTemplate('a{{ missing }}b', {})).toBe('ab');
  });

  it('loops with #each and exposes the item as `this`', () => {
    const out = renderTemplate('{{#each items}}{{ this }};{{/each}}', { items: ['a', 'b'] });
    expect(out).toBe('a;b;');
  });

  it('loops over objects and exposes their keys directly', () => {
    const out = renderTemplate('{{#each rows}}{{ name }}={{ age }}|{{/each}}', {
      rows: [