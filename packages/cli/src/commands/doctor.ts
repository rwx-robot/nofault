/**
 * `nofaultctl doctor` —— 环境自检。
 *
 * 存在的理由：绝大多数"跑不起来"都不是框架的问题，
 * 而是 Node 版本太低、装饰器元数据没开、依赖没装。
 * 这些检查全都是**静态**的（读文件、读配置），不联网、不执行用户代码，
 * 所以可以随便跑，放在 CI 里也安全。
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

export type CheckStatus = 'ok' | 'warn' | 'fail';

export interface Check {
  name: string;
  status: CheckStatus;
  message: string;
  /** 给出可执行的修复建议，而不是只说"不对" */
  hint?: string;
}

export interface DoctorReport {
  checks: Check[];
  ok: boolean;
  warnings: number;
  failures: number;
}

const MIN_NODE_MAJOR = 20;

export function doctor(cwd: string = process.cwd()): DoctorReport {
  const checks: Check[] = [
    checkNodeVersion(),
    checkPackageJson(cwd),
    checkDecoratorMetadata(cwd),
    checkExperimentalDecorators(cwd),
    checkReflectMetadata(cwd),
    checkSourceLayout(cwd),
  ];

  const failures = checks.filter((c) => c.status === 'fail').length;
  const warnings = checks.filter((c) => c.status === 'warn').length;
  return { checks, ok: failures === 0, failures, warnings };
}

function checkNodeVersion(): Check {
  const major = Number(process.versions.node.split('.')[0]);
  return {
    name: 'node version',
    status: major >= MIN_NODE_MAJOR ? 'ok' : 'fail',
    message: `Node ${process.versions.node}`,
    hint: major >= MIN_NODE_MAJOR ? undefined : `需要 Node >= ${MIN_NODE_MAJOR}，当前 ${major}`,
  };
}

function checkPackageJson(cwd: string): Check {
  const path = join(cwd, 'package.json');
  if (!existsSync(path)) {
    return { name: 'package.json', status: 'fail', message: '缺失', hint: '在項目根目录运行 npm init' };
  }
  try {
    const pkg = JSON.parse(readFileSync(path, 'utf8')) as { type?: string };
    // 本项目全部包都是 ESM；type 不对会在运行时报"Cannot use import statement"
    return {
      name: 'package.json',
      status: pkg.type === 'module' ? 'ok' : 'warn',
      message: `type=${pkg.type ?? 'commonjs'}`,
      hint: pkg.type === 'module' ? undefined : '建议设置 "type": "module"',
    };
  } catch (err) {
    return { name: 'package.json', status: 'fail', message: `无法解析：${String(err)}` };
  }
}

/**
 * 读取 tsconfig 并**解析 extends 链**。
 *
 * 不解析会大面积误报：绝大多数工程的 tsconfig 都是
 * `extends: "../../tsconfig.base.json"`，装饰器元数据写在基配置里，
 * 只检查子文件就会把"配置正确"报成"未开启"。
 * 这种假阴性比漏检更糟——它会让人直接不信任这个工具。
 */
function readTsConfig(cwd: string): Record<string, unknown> | undefined {
  return readTsConfigFile(join(cwd, 'tsconfig.json'), new Set());
}

function readTsConfigFile(path: string, seen: Set<string>): Record<string, unknown> | undefined {
  if (!existsSync(path)) return undefined;
  // 循环继承（a extends b，b extends a）必须能停下来
  if (seen.has(path)) return undefined;
  seen.add(path);

  let parsed: Record<string, unknown>;
  try {
    // tsconfig 允许注释与尾逗号，这里做最小容错
    const cleaned = readFileSync(path, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')