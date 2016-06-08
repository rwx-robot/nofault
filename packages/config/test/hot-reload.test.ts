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