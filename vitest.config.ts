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
  plugins: [
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        target: 'es2022',
        parser: { syntax: 'typescript', decorators: true, dynamicImport: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/*/test/**/*.test.ts', 'tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      include: ['packages/*/src/**/*.ts'],
    },
    testTimeout: 15_000,
  },
  resolve: {
    alias: {
      '@nofault/core': resolve(__dirname, 'packages/core/src/index.ts'),
      '@nofault/config': resolve(__dirname, 'packages/config/src/index.ts'),
      '@nofault/logger': resolve(__dirname, 'packages/logger/src/index.ts'),
      '@nofault/http': resolve(__dirname, 'packages/http/src/index.ts'),
      '@nofault/rest': resolve(__dirname, 'packages/rest/src/index.ts'),
      '@nofault/context': resolve(__dirname, 'packages/context/src/index.ts'),
      '@nofault/dsl': resolve(__dirname, 'packages/dsl/src/index.ts'),
      '@nofault/parser': resolve(__dirname, 'packages/parser/src/index.ts'),
      '@nofault/codegen': resolve(__dirname, 'packages/codegen/src/index.ts'),
      '@nofault/cli': resolve(__dirname, 'packages/cli/src/index.ts'),
      '@nofault/orm': resolve(__dirname, 'packages/orm/src/index.ts'),
      '@nofault/cache': resolve(__dirname, 'packages/cache/src/index.ts'),
      '@nofault/rpc': resolve(__dirname, 'packages/rpc/src/index.ts'),
      '@nofault/resilience': resolve(__dirname, 'packages/resilience/src/index.ts'),
      '@nofault/telemetry': resolve(__dirname, 'packages/telemetry/src/index.ts'),
      '@nofault/micro': resolve(__dirname, 'packages/micro/src/index.ts'),
      '@nofault/security': resolve(__dirname, 'packages/security/src/index.ts'),
    },
  },
});
