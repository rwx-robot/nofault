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
  });

  it('returns a deep copy from snapshot()', () => {
    const cfg = createConfigService({ a: { b: 1 } });
    const snap = cfg.snapshot<{ a: { b: number } }>();
    snap.a.b = 2;
    expect(cfg.get<number>('a.b')).toBe(1);
  });
});

describe('loader', () => {
  it('parses .env files', () => {
    expect(parseDotEnv('A=1\n# comment\nB=hello\n')).toEqual({ A: '1', B: 'hello' });
  });

  it('applies env overrides with double-underscore nesting', () => {
    const cfg = applyEnvOverrides({ server: { port: 3000 } }, 'NOFAULT_', {
      NOFAULT_SERVER__PORT: '8080',
      NOFAULT_NAME: 'demo',
      UNRELATED: 'x',
    });
    expect(cfg).toEqual({ server: { port: 8080 }, name: 'demo' });
  });

  it('keeps single underscores as part of the key', () => {
    // 与注释一致的语义：单下划线属于键名本身，不做层级分隔——
    // 否则 `NOFAULT_MAX_IDLE` 会被错误地劈成 max.idle，和 yaml 里的 `max_idle` 对不上
    const cfg = applyEnvOverrides({ pool: { max_idle: 4 } }, 'NOFAULT_', {
      NOFAULT_POOL__MAX_IDLE: '8',
    });
    expect(cfg).toEqual({ pool: { max_idle: 8 } });
  });

  it('loads yaml files', () => {
    const file = writeTemp('config.yaml', 'server:\n  port: 4000\n  host: 127.0.0.1\n');
    const mod = ConfigModule.loadValues({ path: file, ignoreEnv: true });
    expect(mod).toEqual({ server: { port: 4000, host: '127.0.0.1' } });
  });

  it('loads json files', () => {
    const file = writeTemp('config.json', JSON.stringify({ db: { pool: 10 } }));
    expect(ConfigModule.loadValues({ path: file, ignoreEnv: true })).toEqual({ db: { pool: 10 } });
  });

  it('throws a clear error when the file does not exist', () => {
    expect(() => ConfigModule.loadValues({ path: '/definitely/not/here.yaml' })).toThrow(/Config file not found/);
  });
});

describe('ConfigModule integration', () => {
  it('makes ConfigService injectable as a global module', async () => {
    const file = writeTemp('app.yaml', 'greeting: hi\n');

    @Injectable()
    class Greeter {
      constructor(readonly config: ConfigService) {}
      hello() {
        return this.config.get<string>('greeting', 'default');