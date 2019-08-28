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
