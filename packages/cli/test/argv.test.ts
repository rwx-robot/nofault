import { describe, expect, it } from 'vitest';
import { parseArgs, stringOption, booleanOption } from '../src/argv';

describe('parseArgs', () => {
  it('collects positional arguments in order', () => {
    expect(parseArgs(['generate', 'api', 'user.api']).positional).toEqual(['generate', 'api', 'user.api']);
  });

  it('reads --key=value', () => {
    expect(parseArgs(['gen', '--out=src']).options.out).toBe('src');