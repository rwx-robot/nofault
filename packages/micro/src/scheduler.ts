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