import { describe, expect, it } from 'vitest';
import { parseApiSource, ApiParseError } from '../src/api-parser';
import { parseTsSource, TsParseError } from '../src/ts-parser';
import { Scanner, ScannerError, TokenType } from '../src/scanner';

describe('scanner', () => {
  it('records line and column for every token', () => {
    const tokens = new Scanner('type Req {\n  Name string\n}').scan();
    const nameTok = tokens.find((t) => t.value === 'Name')!;
    expect(nameTok.line).toBe(2);
    expect(nameTok.column).toBe(3);
  });

  it('skips both comment styles but keeps line numbers accurate', () => {
    const tokens = new Scanner('// hi\n/* multi\nline */\ntype').scan();
    const kw = tokens.find((t) => t.value === 'type')!;
    expect(kw.line).toBe(4);
  });

  it('treats `!:` / `?:` as punctuation so TS DTOs scan cleanly', () => {
    const tokens = new Scanner('name!: string;\nother?: number;').scan();
    expect(tokens.some((t) => t.type === TokenType.PUNCT && t.value === '!')).toBe(true);
    expect(tokens.some((t) => t.type === TokenType.PUNCT && t.value === '?')).toBe(true);
  });

  it('reports unterminated strings with a position', () => {
    expect(() => new Scanner('a = "oops').scan()).toThrow(ScannerError);
  });
});

describe('parse errors carry a position', () => {
  it('points at the offending token in .api files', () => {
    try {
      parseApiSource('type Req {\n  Name string\n');