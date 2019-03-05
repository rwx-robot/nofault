import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import type { ApiSpec } from '@nofault/dsl';
import { parseApiSource } from './api-parser';
import { parseTsSource } from './ts-parser';

export type ContractFormat = 'api' | 'ts';
