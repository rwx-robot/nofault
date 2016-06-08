import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ConfigModule,
  ConfigService,
  createConfigService,
  applyEnvOverrides,
  parseDotEnv,
  registerAs,
} from '../src/index';

import { Injectable, Module, NofaultFactory, Inject } from '@nofault/core';

function writeTemp(name: string, content: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'nofault-cfg-'));
  const file = join(dir, name);
  writeFileSync(file, content, 'utf8');
  return file;
}

describe('ConfigService', () => {
  it('reads nested values by dot path', () => {
    const cfg = createConfigService({ server: { port: 3000, host: '0.0.0.0' } });
    expect(cfg.get<number>('server.port')).toBe(3000);
    expect(cfg.get('server.missing', 'fallback')).toBe('fallback');
    expect(cfg.has('server.host')).toBe(true);
    expect(() => cfg.getOrThrow('nope')).toThrow();