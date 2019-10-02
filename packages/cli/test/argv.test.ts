import { describe, expect, it } from 'vitest';
import { parseArgs, stringOption, booleanOption } from '../src/argv';

describe('parseArgs', () => {
  it('collects positional arguments in order', () => {
    expect(parseArgs(['generate', 'api', 'user.api']).positional).toEqual(['generate', 'api', 'user.api']);
  });

  it('reads --key=value', () => {
    expect(parseArgs(['gen', '--out=src']).options.out).toBe('src');
  });

  it('reads --key value but never steals the next positional-looking flag', () => {
    const a = parseArgs(['gen', '--out', 'src']);
    expect(a.options.out).toBe('src');

    // 后面是 flag 时，`--force` 必须当布尔，而不是把 "--dry-run" 当成它的值
    const b = parseArgs(['gen', '--force', '--dry-run']);
    expect(b.options.force).toBe(true);
    expect(b.options['dry-run']).toBe(true);
  });

  it('treats bare flags as true', () => {
    const a = parseArgs(['gen', '--root-module']);
    expect(a.options['root-module']).toBe(true);
    expect(a.flags.has('root-module')).toBe(true);
  });

  it('supports short flag clustering', () => {
    expect(parseArgs(['-hv']).flags.has('h')).toBe(true);
    expect(parseArgs(['-hv']).flags.has('v')).toBe(true);
  });

  it('stops option parsing after --', () => {
    const a = parseArgs(['--', '--not-a-flag']);
    expect(a.positional).toEqual(['--not-a-flag']);
  });
});

describe('option helpers', () => {
  it('stringOption returns the value or undefined', () => {
    const a = parseArgs(['--out=src']);
    expect(stringOption(a, 'out')).toBe('src');
    expect(stringOption(a, 'missing')).toBeUndefined();
  });

  it('stringOption prefers provided values over the fallback', () => {
    const a = parseArgs(['--out=src']);
    expect(stringOption(a, 'out', 'default')).toBe('src');