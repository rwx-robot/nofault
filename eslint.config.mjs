import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', '**/*.d.ts'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
      // 装饰器元数据拿到的目标类型在 TS 里只能表达为 `Function`
      // （`Reflect.getMetadata` 的签名就是如此），把它当成"不安全"并不合理
      '@typescript-eslint/no-unsafe-function-type': 'off',
    },
  },
  {
    // 构建/压测脚本的输出就是给人看的界面，禁 console 等于不让说话
    files: ['scripts/**/*.mjs', 'benchmarks/**/*.mjs'],
    rules: { 'no-console': 'off' },
  },
  {
    // CLI 入口是 CJS 薄壳（`bin` 必须在任何打包器之外可执行），require 是唯一选择
    files: ['packages/*/bin/**/*.js'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    // 示例与测试放宽限制
    files: ['examples/**/*.ts', 'tests/**/*.ts', '**/*.test.ts'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
