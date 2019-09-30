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
      log.error(`unknown command "${command}"`);
      process.stdout.write(`${HELP}\n`);
      return { exitCode: 1 };
  }
}

// --------------------------------------------------------------------- 命令

function newCommand(args: ParsedArgs): CliResult {
  const name = args.positional[1];
  if (!name) throw new Error('missing project name: nofaultctl new <project>');

  const dir = stringOption(args, 'dir', name);
  scaffold(name, { dir });

  // 立刻按示例契约生成一遍，让工程开箱可跑
  if (!booleanOption(args, 'skip-generate')) {
    const result = generateFromSpec(compileContract(resolve(dir, 'api', contractFileName(name))), {
      templates: stringOption(args, 'templates'),
      rootModule: true,
    });
    const outDir = resolve(dir, stringOption(args, 'out', 'src'));
    writeFiles(result.files, { outDir, policy: 'generated' });
    log.success(`${result.files.length} file(s) generated`);
  }

  log.success(`project "${name}" ready at ${resolve(dir)}`);
  log.info(log.dim(`next:  cd ${resolve(dir)} && npm install && npm run dev`));
  return { exitCode: 0 };
}

function generateCommand(sub: string | undefined, args: ParsedArgs): CliResult {
  if (sub !== 'api') throw new Error('usage: nofaultctl generate api <contract>');
  const contract = args.positional.slice(2)[0] ?? stringOption(args, 'contract');
  if (!contract) throw new Error('missing contract file');

  const spec = compileContract(contract);
  // 先跑一遍校验：契约有错就在此失败，不会走到写盘
  generateFromSpec(spec, {
    templates: stringOption(args, 'templates'),
    rootModule: booleanOption(args, 'root-module'),
    withOrm: booleanOption(args, 'with-orm'),
    force: booleanOption(args, 'force'),
  });

  void generateApi({
    contract,
    out: stringOption(args, 'out', 'src'),
    templates: stringOption(args, 'templates'),
    rootModule: booleanOption(args, 'root-module'),
    withOrm: booleanOption(args, 'with-orm'),
    watch: booleanOption(args, 'watch') || args.flags.has('w'),
    force: booleanOption(args, 'force'),
    dryRun: booleanOption(args, 'dry-run'),
  });
  return { exitCode: 0 };
}

function validateCommand(sub: string | undefined, args: ParsedArgs): CliResult {
  const contract = sub ?? args.positional[1];
  if (!contract) throw new Error('missing contract file');

  const spec = compileContract(contract);
  const diagnostics = validateSpec(spec);
  if (diagnostics.length === 0) {
    log.success(`${contract}: ${spec.types.length} type(s), ${spec.services.length} service(s), no problems`);
    return { exitCode: 0 };
  }
  for (const d of diagnostics) {
    (d.severity === 'error' ? log.error : log.warn)(`${d.at}: ${d.message}`);
  }
  return { exitCode: diagnostics.some((d) => d.severity === 'error') ? 1 : 0 };
}

function routesCommand(sub: string | undefined, args: ParsedArgs): CliResult {
  const contract = sub ?? args.positional[1];
  if (!contract) throw new Error('missing contract file');

  const spec = compileContract(contract);
  for (const service of spec.services) {
    log.info(log.bold(`service ${service.name}`) + log.dim(`  prefix=${service.prefix ?? '/'} group=${service.group}`));
    for (const route of service.routes) {
      const req = route.requestType ?? '-';
      const res = route.responseType ?? 'void';
      log.info(`  ${route.method.padEnd(6)} ${route.path.padEnd(28)} ${route.handler}(${req}) -> ${res}`);
    }
  }
  return { exitCode: 0 };
}

function contractFileName(name: string): string {
  // 与 commands/new.ts 里的契约文件名保持一致
  const kebab = name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[_\s]+/g, '-')
    .toLowerCase();
  return `${kebab}.api.ts`;
}

function openApiCommand(sub: string | undefined, args: ParsedArgs): CliResult {
  const contract = sub ?? args.positional[1];
  if (!contract) throw new Error('missing contract file');

  const spec = compileContract(contract);
  const options: OpenApiOptions = {
    title: stringOption(args, 'title'),