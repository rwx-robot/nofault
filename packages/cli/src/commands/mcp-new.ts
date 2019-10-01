/**
 * `nofaultctl mcp new <project>` —— 一键生成可跑的 MCP 服务器工程。
 *
 * 设计与 `commands/new.ts` 同源（生成一个立刻能跑的工程，而不是一堆 TODO）：
 * 1. 写出工程骨架（package.json / tsconfig / main.ts）
 * 2. 写出示例 tool（echo）+ 典型 MCP 客户端配置片段
 * 3. 依赖里加 `@nofault/mcp`，但不锁具体子版本（用 workspace 协议之外的常见写法）
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pascalCase, kebabCase } from '@nofault/dsl';
import { log } from '../log';

export interface McpNewOptions {
  /** 目标目录（默认等于项目名） */
  dir?: string;
}

export interface McpNewResult {
  dir: string;
  files: string[];
}

export function scaffoldMcp(name: string, options: McpNewOptions = {}): McpNewResult {
  const dir = resolve(options.dir ?? name);
  if (existsSync(dir) && readdirSync(dir).length > 0) {
    throw new Error(`directory already exists and is not empty: ${dir}`);
  }

  const files: string[] = [];
  const emit = (rel: string, content: string): void => {
    const abs = join(dir, rel);
    mkdirSync(pathDir(abs), { recursive: true });
    writeFileSync(abs, content, 'utf8');
    files.push(rel);
  };

  emit('package.json', packageJson(name));
  emit('tsconfig.json', tsconfig());
  emit('.gitignore', gitignore());
  emit('README.md', readme(name));
  emit('src/main.ts', mainTs(name));
  emit('src/tools.ts', toolsTs(name));

  log.step(`scaffolded ${files.length} file(s) into ${dir}`);
  return { dir, files };
}

function pathDir(abs: string): string {
  const i = abs.lastIndexOf('/');
  return i < 0 ? abs : abs.slice(0, i);
}

function packageJson(name: string): string {
  return `${JSON.stringify(
    {
      name: kebabCase(name),
      version: '0.1.0',
      private: true,
      description: `${pascalCase(name)} MCP server (stdio, JSON-RPC)`,
      type: 'module',
      scripts: {
        build: 'tsc -p tsconfig.json',
        start: 'node dist/main.js',
      },
      dependencies: {
        '@nofault/mcp': '^1.0.0',
      },
      devDependencies: {
        typescript: '^5.6.0',
        '@types/node': '^22.7.0',
      },
    },
    null,
    2,
  )}\n`;
}

function tsconfig(): string {
  return `${JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        strict: true,
        skipLibCheck: true,
        esModuleInterop: true,
        outDir: 'dist',
        rootDir: 'src',
      },
      include: ['src/**/*.ts'],
    },
    null,
    2,
  )}\n`;
}

function gitignore(): string {
  return ['node_modules/', 'dist/', ''].join('\n');
}

function readme(name: string): string {
  return `# ${pascalCase(name)} MCP 服务器

由 \`nofaultctl mcp new ${name}\` 生成。

## 用法

\`\`\`bash
npm install
npm run build
npm start
# stdio 上换行分隔 JSON-RPC，把这一行加到 MCP 客户端的配置里：
#   { "command": "node", "args": ["$(pwd)/dist/main.js"] }