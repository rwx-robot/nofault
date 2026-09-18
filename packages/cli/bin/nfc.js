#!/usr/bin/env node
'use strict';
// `nfc` —— `nofaultctl` 的短别名；与 `nofaultctl` 共用同一份实现，仅入口不同
// 子命令命名不变（`nfc new` / `nfc mcp new` / `nfc generate` / `nfc dev` 等）
const { run } = require('../dist/cli.js');
process.exitCode = run(process.argv.slice(2)).exitCode;