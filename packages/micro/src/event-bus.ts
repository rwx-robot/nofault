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
  readonly name: string;
  readonly id: string;
  readonly publishedAt: number;
}

export interface SubscribeOptions {
  /** 只收一次，收到后自动退订 */
  once?: boolean;
}

/** 跨进程桥：把事件转发出去 / 收进来。换成 MQ 即可对接真实基础设施 */
export interface EventBridge {
  publish(name: string, payload: unknown, meta: EventMeta): Promise<void> | void;
  subscribe(handler: (name: string, payload: unknown, meta: EventMeta) => void): void;
}

export interface EventBusOptions {
  onError?: (err: unknown, event: EventMeta) => void;
  bridge?: EventBridge;
  /** 按注册顺序串行投递（默认并行） */
  sequential?: boolean;
}

interface Subscription {
  handler: EventHandler;
  once: boolean;
}

export class EventBus {
  private readonly topics = new Map<string, Subscription[]>();
  private readonly errors: unknown[] = [];
  private published = 0;
  private delivered = 0;

  constructor(private readonly options: EventBusOptions = {}) {
    options.bridge?.subscribe((name, payload, meta) => {
      void this.dispatch(name, payload, meta);
    });
  }

  subscribe<T>(name: string, handler: EventHandler<T>, options: SubscribeOptions = {}): () => void {
    const list = this.topics.get(name) ?? [];
    list.push({ handler: handler as EventHandler, once: options.once === true });
    this.topics.set(name, list);

    // 返回退订函数而不是要求持有 handler 引用：
    // 忘记退订是事件总线最常见的内存泄漏来源
    return () => this.unsubscribe(name, handler as EventHandler);
  }

  once<T>(name: string, handler: EventHandler<T>): () => void {
    return this.subscribe(name, handler, { once: true });
  }

  unsubscribe(name: string, handler: EventHandler): void {
    const list = this.topics.get(name);
    if (!list) return;
    const next = list.filter((s) => s.handler !== handler);
    if (next.length === 0) this.topics.delete(name);
    else this.topics.set(name, next);
  }

  /** 发布。默认等所有订阅者跑完（这样调用方能确定副作用已完成） */
  async publish<T>(name: string, payload: T): Promise<void> {
    const meta: EventMeta = {
      name,
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      publishedAt: Date.now(),
    };
    this.published += 1;
    this.options.bridge?.publish(name, payload, meta);
    await this.dispatch(name, payload, meta);
  }

  /** 不等订阅者（发出即忘）。注意：调用方无法确定副作用何时生效 */
  emit<T>(name: string, payload: T): void {
    void this.publish(name, payload);
  }
