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
  }
  if (out.size === 0) throw new Error(`cron field "${field}" matches nothing`);
  return out;
}

function normalizeDow(values: Set<number>): Set<number> {
  const out = new Set<number>();
  for (const v of values) out.add(v % 7);
  return out;
}

/** cron 是否在这一刻应该触发 */
export function matchesCron(cron: CronExpression, date: Date): boolean {
  if (!cron.months.has(date.getMonth() + 1)) return false;
  if (!cron.hours.has(date.getHours())) return false;
  if (!cron.minutes.has(date.getMinutes())) return false;

  const hasDom = cron.daysOfMonth.size < 31;
  const hasDow = cron.daysOfWeek.size < 7;
  const domOk = cron.daysOfMonth.has(date.getDate());
  const dowOk = cron.daysOfWeek.has(date.getDay());

  // Unix cron 的语义：日与周都给了的话是 **或** 关系。
  // 实现成"与"的话，`0 0 1 * 0`（每月 1 号或每周日）永远不会触发
  if (hasDom && hasDow) return domOk || dowOk;
  if (hasDom) return domOk;
  if (hasDow) return dowOk;
  return true;
}

export interface JobOptions {
  name?: string;
  /** 允许上一轮没跑完就起下一轮。默认 false */
  overlap?: boolean;
}

export interface CronJobOptions extends JobOptions {
  /** 是否在恢复.Utc após跳过时补跑错过的次数。默认 false，且最多补 `maxCatchUp` 次 */
  catchUp?: boolean;
  maxCatchUp?: number;
}

export type JobHandler = (signal: { aborted: boolean }) => Promise<void> | void;

interface ScheduledJob {
  readonly name: string;
  readonly cron?: CronExpression;
  readonly intervalMs?: number;
  readonly everyMs?: number;
  readonly handler: JobHandler;
  readonly options: CronJobOptions;
  nextRunAt: number;
  running: boolean;
}

export interface SchedulerOptions {
  /** 轮询间隔。调度精度不可能高于它，默认 1s */
  tickMs?: number;
  onError?: (err: unknown, job: string) => void;
}

export class Scheduler {
  private readonly jobs: ScheduledJob[] = [];
  private timer?: NodeJS.Timeout;
  private stopped = true;

  constructor(private readonly options: SchedulerOptions = {}) {}

  /** 按 cron 表达式注册 */
  cron(expression: string, handler: JobHandler, options: CronJobOptions = {}): string {
    const cron = parseCron(expression);
    const name = options.name ?? expression;
    this.jobs.push({
      name,
      cron,
      handler,
      options,
      nextRunAt: this.nextMatch(cron),
      running: false,
    });
    return name;
  }

  /** 固定间隔（上一次**开始**后多久再跑一次） */
  every(intervalMs: number, handler: JobHandler, options: JobOptions = {}): string {
    const name = options.name ?? `every-${intervalMs}ms`;
    this.jobs.push({
      name,
      everyMs: intervalMs,
      handler,
      options,
      nextRunAt: Date.now() + intervalMs,
      running: false,
    });
    return name;
  }

  /** 固定速率（上一次**结束**后多久再跑一次）——不会因为任务慢而堆积 */
  fixedDelay(delayMs: number, handler: JobHandler, options: JobOptions = {}): string {
    const name = options.name ?? `delay-${delayMs}ms`;
    this.jobs.push({
      name,
      intervalMs: delayMs,
      handler,
      options,
      nextRunAt: Date.now() + delayMs,
      running: false,
    });
    return name;
  }

  /** 延时一次执行，返回取消函数 */
  after(delayMs: number, handler: JobHandler): () => void {
    const timer = setTimeout(() => {
      void this.safeRun(handler, 'delayed');
    }, delayMs);
    timer.unref?.();
    return () => clearTimeout(timer);
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.timer = setInterval(() => this.tick(), this.options.tickMs ?? 1000);
    this.timer.unref?.();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  list(): Array<{ name: string; nextRunAt: number; running: boolean }> {
    return this.jobs.map((j) => ({ name: j.name, nextRunAt: j.nextRunAt, running: j.running }));
  }

  private tick(): void {
    const now = Date.now();
    for (const job of this.jobs) {
      if (job.nextRunAt > now) continue;
      // 上一轮还在跑且不允许重叠 -> 跳过这一拍。
      // 注意：这里必须把 nextRunAt 往后推，否则下一拍还会再判断一次，
      // 变成"每 1 秒检查一次、每次都跳过"的空转
      if (job.running && job.options.overlap !== true) {
        job.nextRunAt = this.advanceAfterSkip(job, now);
        continue;
      }
      void this.runJob(job, now);
    }
  }

  private async runJob(job: ScheduledJob, now: number): Promise<void> {
    job.running = true;
    const startedAt = Date.now();
    try {
      await this.safeRun(job.handler, job.name);
    } finally {
      job.running = false;
      const finished = Date.now();
      if (job.cron) {
        job.nextRunAt = this.nextMatch(job.cron, finished);
      } else if (job.intervalMs) {
        // fixedDelay：从结束时刻起算，任务慢也不会堆积
        job.nextRunAt = finished + job.intervalMs;
      } else if (job.everyMs) {
        job.nextRunAt = startedAt + job.everyMs;
        // 补跑：进程卡住/任务太慢导致错过了多个周期时，立刻连着跑下一次
        if (job.nextRunAt <= finished) job.nextRunAt = finished + job.everyMs;
      }
      void now;