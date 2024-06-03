/**
 * 事件总线：进程内的发布订阅，外加一个可插拔的跨进程桥。
 *
 * 三条纪律：
 *
 * 1. **一个订阅者抛错不能影响其他订阅者** ——
 *    否则某个模块的 bug 会让整条事件链断了，而且没人知道为什么
 * 2. **订阅者的异常不能被静默吞掉** ——
 *    交给 `onError`，默认是打日志。吞掉的话，事件"看起来发出去了，
 *    什么都没发生"，是最难查的一类 bug
 * 3. **默认并行投递要小心** —— 并行下多个订阅者同时改同一份数据会互相覆盖。
 *    需要顺序保证时用 `sequential: true`
 */
export type EventHandler<T = unknown> = (
  payload: T,
  meta: EventMeta,
) => Promise<void> | void;

export interface EventMeta {