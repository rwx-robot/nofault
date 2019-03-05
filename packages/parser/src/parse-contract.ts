import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import type { ApiSpec } from '@nofault/dsl';
import { parseApiSource } from './api-parser';
import { parseTsSource } from './ts-parser';

export type ContractFormat = 'api' | 'ts';

/** 按内容嗅探格式：以 `syntax` 开头且无 `class` 关键字 → .api；否则按扩展名 */
export function detectFormat(source: string, file?: string): ContractFormat {
  if (file) {
    const ext = extname(file).toLowerCase();
    if (ext === '.api') return 'api';