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