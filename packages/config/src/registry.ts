import type { PlainObject } from './loader';
import { applyEnvOverrides } from './loader';
import type { ConfigSource } from './provider';
import { createFileSource, createInlineSource } from './provider';

export type ConfigChangeListener = (values: PlainObject, previous: PlainObject) => void;

export interface ConfigRegistryOptions {
  sources?: ConfigSource[];
  /** 环境变量前缀；传 '' 表示不启用 */
  envPrefix?: string;
}

/**
 * 配置注册表：聚合多个源、合并、应用环境变量覆盖、并在变更时通知订阅者。
 *
 * 合并顺序：**后面的源覆盖前面的**，环境变量永远最后且优先级最高（12-factor）。
 */
export class ConfigRegistry {
  private readonly sources: ConfigSource[];
  private readonly envPrefix: string;
  private readonly listeners = new Set<ConfigChangeListener>();
  private current: PlainObject = {};
  private unwatchers: Array<() => void> = [];
  private started = false;

  constructor(options: ConfigRegistryOptions = {}) {
    this.sources = options.sources ?? [];
    this.envPrefix = options.envPrefix ?? 'NOFAULT_';
  }

  /** 首次加载 + 启动变更订阅 */
  async start(): Promise<PlainObject> {
    await this.reload();
    if (this.started) return this.current;
    this.started = true;
    for (const source of this.sources) {
      const unwatch = source.watch?.(() => {
        void this.reload();
      });
      if (typeof unwatch === 'function') this.unwatchers.push(unwatch);
    }
    return this.current;
  }

  /** 重新聚合并（如有变化）通知订阅者 */
  async reload(): Promise<PlainObject> {
    let merged: PlainObject = {};
    for (const source of this.sources) {
      const part = await source.load();
      merged = { ...merged, ...part };
    }
    if (this.envPrefix) {
      merged = applyEnvOverrides(merged, this.envPrefix);
    }
    const previous = this.current;
    const changed = JSON.stringify(previous) !== JSON.stringify(merged);
    this.current = merged;
    if (changed) {
      for (const listener of this.listeners) {
        try {
          listener(merged, previous);
        } catch (err) {
          process.stderr.write(`[config] listener threw: ${String(err)}\n`);
        }
      }
    }
    return merged;
  }

  /**
   * 当前配置。
   *
   * **不做克隆**——这个函数在 `ConfigService.get()` 里是**每次调用都走**的热路径，
   * 每次 structuredClone 全量配置会把读配置变成 O(配置大小) 的操作（实测是 v0.3.0 最大的一处开销）。
   *
   * 安全性由"整体替换"保证：`reload()` 每次生成全新对象，从不在原地修改，
   * 所以持有旧引用不会看到撕裂状态。需要副本时请用 `ConfigService.snapshot()`。
   */
  values(): PlainObject {
    return this.current;
  }

  /** 订阅变更（`@OnConfigUpdate()` 与日志/连接池等需要感知变化的组件用） */
  subscribe(listener: ConfigChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get listenerCount(): number {
    return this.listeners.size;
  }

  /** 关闭：停止所有 watcher 与定时器 */
  async close(): Promise<void> {
    for (const off of this.unwatchers) off();
    this.unwatchers = [];
    for (const source of this.sources) source.dispose?.();
    this.started = false;
  }
}

export interface BuildRegistryOptions {
  path?: string;
  values?: PlainObject;
  sources?: ConfigSource[];
  envPrefix?: string;
  ignoreEnv?: boolean;
  watch?: boolean;
}