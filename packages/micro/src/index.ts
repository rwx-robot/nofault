/**
 * @nofault/micro —— 微服务全家桶（v0.9.0）。
 *
 * 前面八个版本交付了能力，这一版负责**把它们接起来**，
 * 并补上微服务还缺的几块：分布式 ID、分布式锁、定时任务、事件总线。
 *
 * 一句话概括每件的必要性：
 *   没有 ID 生成器   → 多实例各有计数器，合表必撞
 *   没有分布式锁     → 定时任务在多实例上跑 N 遍
 *   没有 EVENT BUS   → 模块之间直接互相 import，最后变成一坨
 *   没有 BOOTSTRAP   → 五十行样板代码，且顺序错了就会出问题
 */
export { Snowflake, ClockMovedBackError, DEFAULT_EPOCH } from './id';
export type { SnowflakeOptions, SnowflakeParts } from './id';

export { DistributedLock, MemoryLockBackend, LockAcquisitionError } from './lock';
export type { LockBackend, LockHandle, LockOptions } from './lock';

export { Scheduler, parseCron, matchesCron } from './scheduler';
export type { CronExpression, CronJobOptions, JobHandler, JobOptions, SchedulerOptions } from './scheduler';

export { EventBus } from './event-bus';
export type { EventBridge, EventBusOptions, EventHandler, EventMeta, SubscribeOptions } from './event-bus';

export { Microservice, ShutdownTimeoutError } from './microservice';