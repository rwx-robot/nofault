import { describe, expect, it } from 'vitest';
import { parseApiSource, ApiParseError } from '../src/api-parser';
import { parseTsSource, TsParseError } from '../src/ts-parser';