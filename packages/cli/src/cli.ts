/**
 * nofaultctl —— 命令行入口。
 *
 * 子命令刻意保持很少：脚手架、生成、校验、看路由。
 * CLI 的价值在于**少而准**，不是一个什么都塞的瑞士军刀。
 */

import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
import { parseArgs, booleanOption, stringOption, type ParsedArgs } from './argv';
import { log } from './log';
import { scaffold } from './commands/new';
import { compileContract, generateApi, generateFromSpec } from './commands/generate';
import { writeFiles, openApiDocument, type OpenApiOptions } from '@nofault/codegen';
import { validateSpec } from '@nofault/codegen';
import { DevRunner } from './commands/dev';
import { doctor } from './commands/doctor';
import { scaffoldMcp } from './commands/mcp-new';

export const VERSION = '0.10.0';

const HELP = `
${log.bold('nofaultctl')} ${VERSION} — nofault 工程脚手架与代码生成

用法:
  nofaultctl <command> [args] [options]

命令:
  new <project>              新建工程（含示例契约，并立刻生成一遍代码）
  mcp new <project>          新建 MCP 服务器工程（stdio，JSON-RPC）
  generate api <contract>    由契约生成 controller / service / module / dto
  validate <contract>        只做契约校验，不生成
  routes <contract>          列出契约里的全部路由
  openapi <contract>         由契约生成 OpenAPI 3.0 文档
  dev                        监听源码变化并自动重启
  doctor                     检查环境（Node / tsconfig / 依赖）

选项:
  --out <dir>                输出目录，默认 src
  --templates <dir>          模板覆盖目录（放 dto.tpl / controller.tpl 等）
  --root-module              额外生成根 app.module.ts
  --with-orm                 额外生成 entity / repository 数据层骨架
  --watch, -w                监听契约变化，自动重新生成
  --force                    契约有错也继续生成；覆盖时无视生成标记
  --dry-run                  只报告要做什么，不写盘
  --openapi                  生成时顺带产出 openapi.json
  --title <t> / --version <v>  OpenAPI 文档里的标题与版本
  --cmd <command>            dev 模式要跑的命令，默认 node dist/main.js
  -h, --help                 显示帮助
  -v, --version              显示版本

示例:
  nofaultctl new user-service
  nofaultctl mcp new echo-server
  nofaultctl generate api api/user.api.ts --out src --root-module
  nofaultctl generate api api/user.api.ts --out src --with-orm --watch
  nofaultctl generate api user.api --out src --dry-run
  nofaultctl openapi api/user.api.ts --out openapi.json
  nofaultctl dev --cmd "node dist/main.js"
  nofaultctl doctor
`;

export interface CliResult {
  exitCode: number;
}

export function run(argv: string[]): CliResult {
  const args = parseArgs(argv);
  if (booleanOption(args, 'help') || args.flags.has('h') || args.positional.length === 0) {
    process.stdout.write(`${HELP}\n`);
    return { exitCode: 0 };
  }
  if (booleanOption(args, 'version') || args.flags.has('v')) {
    process.stdout.write(`${VERSION}\n`);
    return { exitCode: 0 };
  }

  const [command, sub] = args.positional;
  try {
    return dispatch(command!, sub, args);
  } catch (err) {
    log.error(err instanceof Error ? err.message : String(err));
    return { exitCode: 1 };
  }
}

function dispatch(command: string, sub: string | undefined, args: ParsedArgs): CliResult {
  switch (command) {
    case 'new':
      return newCommand(args);
    case 'mcp':
      return mcpCommand(sub, args);
    case 'g':
    case 'gen':
    case 'generate':
      return generateCommand(sub, args);
    case 'validate':
      return validateCommand(sub, args);
    case 'routes':
      return routesCommand(sub, args);
    case 'openapi':
      return openApiCommand(sub, args);
    case 'dev':
      return devCommand(args);
    case 'doctor':
      return doctorCommand();
    default: