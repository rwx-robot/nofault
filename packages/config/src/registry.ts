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