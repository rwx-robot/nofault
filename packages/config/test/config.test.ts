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
