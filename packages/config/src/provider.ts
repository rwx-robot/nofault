import { watch, type FSWatcher } from 'node:fs';
import { existsSync, readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { parse as parseYamlDocument } from 'yaml';
import { applyEnvOverrides, parseDotEnv, type PlainObject } from './loader';

/**
 * 配置源：配置的**来源**抽象。
 *
 * 有了这一层，文件、环境变量、etcd/consul/nacos 都是同一种东西，
 * 热更新也就不必为每个来源各写一遍。
 */
export interface ConfigSource {
  readonly name: string;
  /** 拉取一次配置 */
  load(): Promise<PlainObject> | PlainObject;
  /** 可选：订阅变更，返回取消订阅函数 */
  watch?(onChange: () => void): (() => void) | void;
  /** 释放资源（关闭 watcher / 定时器） */
  dispose?(): void;
}

// ------------------------------------------------------------------ 内置源

/** 内联值：测试与默认值 */
export function createInlineSource(values: PlainObject, name = 'inline'): ConfigSource {
  return { name, load: () => values };
}

export interface FileSourceOptions {
  path: string;
  /** 是否监听文件变化，默认 false */
  watch?: boolean;
  /** 防抖毫秒，默认 100（编辑器保存会触发多次 change） */
  debounceMs?: number;
}

/** 文件源：YAML / JSON / .env，可选热更新 */
export function createFileSource(options: FileSourceOptions): ConfigSource {
  const { path, watch: doWatch = false, debounceMs = 100 } = options;
  let watcher: FSWatcher | undefined;
  let timer: NodeJS.Timeout | undefined;
