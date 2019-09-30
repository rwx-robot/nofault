/**
 * 命令行参数解析。
 *
 * 不引第三方库的原因：CLI 的参数需求很固定（子命令 + `--k=v` / `-f` 布尔开关），
 * 用 yargs/commander 要为此多装两个依赖，却换不来任何我们真正需要的能力。
 */

export interface ParsedArgs {
  /** 位置参数 */
  positional: string[];
  /** `--name value` / `--name=value` */
  options: Record<string, string | boolean>;
  /** `--help` 之类 */
  flags: Set<string>;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const options: Record<string, string | boolean> = {};
  const flags = new Set<string>();

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
