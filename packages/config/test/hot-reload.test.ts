import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ConfigRegistry,
  createConfigService,
  createFileSource,
  createInlineSource,
  createPollingSource,
  buildRegistry,
} from '../src/index';

function tempFile(name: string, content: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'nofault-cfg-'));
  const file = join(dir, name);
  writeFileSync(file, content, 'utf8');
  return file;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('ConfigRegistry', () => {
  it('merges sources in order, later wins', async () => {
    const registry = new ConfigRegistry({
      sources: [createInlineSource({ a: 1, b: 1 }), createInlineSource({ b: 2 })],
      envPrefix: '',
    });
    const values = await registry.start();
    expect(values).toEqual({ a: 1, b: 2 });
  });

  it('applies env overrides last', async () => {
    const registry = new ConfigRegistry({
      sources: [createInlineSource({ server: { port: 3000 } })],
      envPrefix: 'TEST_',
    });
    process.env.TEST_SERVER__PORT = '8080';
    const values = await registry.start();
    expect(values.server).toEqual({ port: 8080 });
    delete process.env.TEST_SERVER__PORT;
  });

  it('values() is the live object; ConfigService.snapshot() is the defensive copy', async () => {
    const registry = new ConfigRegistry({ sources: [createInlineSource({ a: { b: 1 } })], envPrefix: '' });
    await registry.start();
