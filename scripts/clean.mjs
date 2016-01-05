#!/usr/bin/env node
/** 清理各包的构建产物与 tsbuildinfo */
import { readdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';