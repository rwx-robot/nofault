import { describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileTransport, LogLevel, Logger, MemoryTransport, createLogger } from '../src/index';

function tmpdir_(): string {
  return mkdtempSync(join(tmpdir(), 'nofault-log-'));
}

describe('FileTransport', () => {
  it('appends lines to the file', async () => {
    const dir = tmpdir_();
    const file = join(dir, 'app.log');
    const t = new FileTransport({ filePath: file });
    t.write('line one', { timestamp: '', level: LogLevel.INFO, levelName: 'info', message: 'line one' });
    t.write('line two', { timestamp: '', level: LogLevel.INFO, levelName: 'info', message: 'line two' });
    await t.flush();
    expect(readFileSync(file, 'utf8')).toBe('line one\nline two\n');
  });

  it('creates missing directories', () => {
    const dir = tmpdir_();
    const file = join(dir, 'nested', 'deep', 'app.log');
    new FileTransport({ filePath: file });
    expect(existsSync(file)).toBe(true);