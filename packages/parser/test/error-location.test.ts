import { describe, expect, it } from 'vitest';
import { parseApiSource, ApiParseError } from '../src/api-parser';
import { parseTsSource, TsParseError } from '../src/ts-parser';
import { Scanner, ScannerError, TokenType } from '../src/scanner';

describe('scanner', () => {
  it('records line and column for every token', () => {
    const tokens = new Scanner('type Req {\n  Name string\n}').scan();
    const nameTok = tokens.find((t) => t.value === 'Name')!;