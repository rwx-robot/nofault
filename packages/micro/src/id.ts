/**
 * 分布式 ID：Snowflake。
 *
 * 布局（共 63 位，最高位恒为 0）：
 * ```
 * 0 | 41 位毫秒时间戳 | 5 位数据中心 | 5 位机器 | 12 位序列号
 * ```
 *
 * 为什么不用自增主键：多实例各有各的计数器，合表必然撞。
 * 为什么不用 UUID：无序。无序主键让 B+ 树的插入变成随机写，
 * 数据量一大，写入性能会掉一个数量级。
 *
 * 两个必须处理对的细节：
 * 1. **时钟回拨** —— 服务器对时可能往回调。不处理就会发出重复 ID，
 *    而 ID 重复是那种"上线三个月后才在某个对账任务里炸掉"的问题
 * 2. **序列号溢出** —— 同一毫秒内的请求超过 4096 个，必须等到下一毫秒，
 *    不能回绕（回绕同样产生重复）
 */
export interface SnowflakeOptions {
  /** 机器 ID，0~31 */
  workerId?: number;
  /** 数据中心 ID，0~31 */
  datacenterId?: number;
  /** 起始时间戳（毫秒）。调大它可以延长可用年限 */
  epoch?: number;
  /**
   * 时钟回拨容忍（毫秒）。
   * 小幅度回拨（NTP 微调）直接等过去；超过这个数就抛错——
   * 说明有人改了系统时间，此时产出的 ID 不可信。
   */
  clockRollbackToleranceMs?: number;
}

/** 默认 epoch：2020-01-01T00:00:00Z */
export const DEFAULT_EPOCH = 1577836800000;

const WORKER_BITS = 5n;
const DATACENTER_BITS = 5n;
const SEQUENCE_BITS = 12n;