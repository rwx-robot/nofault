/**
 * 任务调度：cron 表达式 + 延时队列。
 *
 * 调度器最容易写错的两处：
 *
 * 1. **错过执行要不要补**？
 *    进程重启后，错过的那些"每分钟一次"不会自己回来。
 *    默认**不补**（`catchUp: false`）——补的话，重启瞬间会一次性涌入几十个任务，
 *    把刚起来的服务再打挂。要补是显式开启的决定。
 *
 * 2. **上一轮没跑完能不能起下一轮**？
 *    默认**不能**（`overlap: false`）。允许重叠的话，一个慢任务会越积越多，
 *    最后变成"几十个同名任务同时跑"，也就是事实上的自我 DoS。
 */
export interface CronExpression {
  minutes: Set<number>;
  hours: Set<number>;
  daysOfMonth: Set<number>;
  months: Set<number>;
  daysOfWeek: Set<number>;
}

/**
 * 解析 5 段 cron：`分 时 日 月 周`
 *
 * 支持星号、步长（每 n 个单位）、区间 `a-b`、列表 `a,b,c`。
 * 星期用 0=周日（与 Unix cron 一致），并且允许 7 也表示周日——
 * 因为总有人写 7，把它当成非法输入只会让人困惑。
 *
 * 写注释时要小心：星号紧跟右斜杠会提前闭合这个块注释块，
 * 后面的代码会全变成裸标识符（TS1005 一片红）。提到步长语法时用中文描述即可。
 */
export function parseCron(expression: string): CronExpression {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`cron expression must have 5 fields, got ${parts.length}: "${expression}"`);
  }
  const [minutes, hours, daysOfMonth, months, daysOfWeek] = parts as [
    string, string, string, string, string,
  ];
  return {
    minutes: parseField(minutes, 0, 59),
    hours: parseField(hours, 0, 23),
    daysOfMonth: parseField(daysOfMonth, 1, 31),
    months: parseField(months, 1, 12),
    daysOfWeek: normalizeDow(parseField(daysOfWeek, 0, 7)),
  };
}

function parseField(field: string, min: number, max: number): Set<number> {
  const out = new Set<number>();
  for (const chunk of field.split(',')) {
    const step = chunk.includes('/') ? Number(chunk.slice(chunk.indexOf('/') + 1)) : 1;
    if (!Number.isInteger(step) || step < 1) throw new Error(`invalid step in "${chunk}"`);
    const rangePart = chunk.includes('/') ? chunk.slice(0, chunk.indexOf('/')) : chunk;

    let from = min;
    let to = max;
    if (rangePart !== '*') {
      const [lo, hi] = rangePart.split('-');
      from = Number(lo);
      to = hi === undefined ? from : Number(hi);
    }
    if (Number.isNaN(from) || Number.isNaN(to) || from < min || to > max || from > to) {
      throw new Error(`invalid cron field "${chunk}" (expected ${min}-${max})`);
    }
    for (let v = from; v <= to; v += step) out.add(v);