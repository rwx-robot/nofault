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

    // values() 是热路径，故意不克隆（见 registry.ts 注释）
    const live = registry.values();
    (live.a as { b: number }).b = 99;
    expect(registry.values().a).toEqual({ b: 99 });

    // 需要"不可变快照"时用 ConfigService.snapshot()
    const config = createConfigService(registry);
    const copy = config.snapshot();
    (copy.a as { b: number }).b = 7;
    expect(registry.values().a).toEqual({ b: 99 });
  });

  it('reload replaces the whole object so stale references never see torn state', async () => {
    let v = 1;
    const registry = new ConfigRegistry({ sources: [{ name: 'live', load: () => ({ v }) }], envPrefix: '' });
    await registry.start();
    const before = registry.values();
    v = 2;
    await registry.reload();
    expect(before.v).toBe(1);
    expect(registry.values().v).toBe(2);
  });

  it('notifies subscribers only when something actually changed', async () => {
    const registry = new ConfigRegistry({ sources: [createInlineSource({ v: 1 })], envPrefix: '' });
    await registry.start();
    const listener = vi.fn();
    const off = registry.subscribe(listener);

    await registry.reload();
    expect(listener).not.toHaveBeenCalled();

    // 换一个会变的源
    const mutable = createInlineSource({ v: 1 });
    let counter = 1;
    const live = { name: 'live', load: () => ({ v: ++counter }) };
    const registry2 = new ConfigRegistry({ sources: [mutable, live], envPrefix: '' });
    await registry2.start();
    const listener2 = vi.fn();
    registry2.subscribe(listener2);
    await registry2.reload();
    expect(listener2).toHaveBeenCalledTimes(1);

    off();
    expect(registry.listenerCount).toBe(0);
    await registry.close();