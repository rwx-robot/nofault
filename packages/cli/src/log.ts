/**
 * 终端输出。
 *
 * 唯一值得注意的是**颜色开关**：CI、管道、日志采集里 ANSI 转义是噪声，
 * 所以 `NO_COLOR`（社区约定）或输出不是 TTY 时一律退化为纯文本。
 */

const COLORS = { red: '31', green: '32', yellow: '33', dim: '2', bold: '1' } as const;
type Color = keyof typeof COLORS;

function enabled(): boolean {
  return !process.env.NO_COLOR && Boolean(process.stdout.isTTY);
}

function paint(text: string, color: Color): string {
  if (!enabled()) return text;
  return `\u001b[${COLORS[color]}m${text}\u001b[0m`;
}

export const log = {
  info(message: string): void {
    process.stdout.write(`${message}\n`);
  },
  success(message: string): void {
    process.stdout.write(`${paint('✓', 'green')} ${message}\n`);
  },
  warn(message: string): void {
    process.stdout.write(`${paint('!', 'yellow')} ${message}\n`);
  },
  error(message: string): void {
    process.stderr.write(`${paint('✗', 'red')} ${message}\n`);
  },
  step(message: string): void {
    process.stdout.write(`${paint('›', 'dim')} ${message}\n`);
  },
  dim(message: string): string {
    return paint(message, 'dim');
  },
  bold(message: string): string {
    return paint(message, 'bold');
  },
  /** 供需要自定义标记的场景（如 doctor 的状态列）直接取色 */
  green(message: string): string {
    return paint(message, 'green');
  },
  yellow(message: string): string {
    return paint(message, 'yellow');
  },
  red(message: string): string {
    return paint(message, 'red');
  },
};

/** 生成 > 写盘之后的汇总，几个命令共用 */
export function printSummary(summary: { written: string[]; skipped: string[]; changed: string[] }, cwd: string): void {
  for (const f of summary.written) log.success(`write  ${f}`);
  if (summary.skipped.length > 0) {
    log.info(log.dim(`skip   ${summary.skipped.length} unchanged${summary.skipped.length === 1 ? '' : ' file(s)'}`));
  }
  log.success(`${summary.changed.length} file(s) generated into ${cwd}`);
}
