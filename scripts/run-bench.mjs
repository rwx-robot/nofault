#!/usr/bin/env node
/**
 * 运行某个版本的 benchmark，并把结果写入该版本的 REPORT.md。
 *
 * 用法：
 *   pnpm bench v0.1.0
 *   node scripts/run-bench.mjs v0.1.0 --duration=10 --connections=64
 */