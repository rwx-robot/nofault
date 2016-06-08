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