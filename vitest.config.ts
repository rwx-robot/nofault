import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
import swc from 'unplugin-swc';

/**
 * 测试配置要点：
 * 1. 用 **swc** 而不是 esbuild 做 TS 转换 —— esbuild 不支持 `emitDecoratorMetadata`，
 *    而 nofault 的构造函数注入依赖 `design:paramtypes` 元数据，这是硬性要求。
 * 2. alias 直接指向各包 src，跑测试无需先 build。
 */
export default defineConfig({