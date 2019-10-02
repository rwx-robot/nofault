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