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

  const read = (): PlainObject => {
    if (!existsSync(path)) throw new Error(`Config file not found: ${path}`);
    const raw = readFileSync(path, 'utf8');
    const ext = extname(path).toLowerCase();
    if (ext === '.json') return JSON.parse(raw) as PlainObject;
    if (ext === '.env') return parseDotEnv(raw);
    if (ext === '.yaml' || ext === '.yml') return (parseYamlDocument(raw) ?? {}) as PlainObject;
    return raw.trimStart().startsWith('{')
      ? (JSON.parse(raw) as PlainObject)
      : ((parseYamlDocument(raw) ?? {}) as PlainObject);
  };

  return {
    name: `file:${resolve(path)}`,
    load: read,
    watch(onChange) {
      if (!doWatch) return;
      watcher = watch(path, () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => onChange(), debounceMs);
      });
      return () => {
        watcher?.close();
        watcher = undefined;
      };
    },
    dispose() {
      if (timer) clearTimeout(timer);
      watcher?.close();
    },
  };
}

export interface PollingSourceOptions {
  name: string;
  /** 拉取远程配置；抛错时保留上一次的值（远程抖动不能打挂应用） */
  fetch: () => Promise<PlainObject> | PlainObject;
  /** 轮询间隔，默认 30s */
  intervalMs?: number;
}

/**
 * 轮询源：远程配置中心（etcd / consul / nacos / 自研）的统一入口。
 *
 * 之所以做成"给一个 fetch 函数"而不是内置 etcd 客户端：
 * 远程源**不该**成为框架的强依赖，接入方式交给使用者决定。
 */
export function createPollingSource(options: PollingSourceOptions): ConfigSource {
  const { name, fetch, intervalMs = 30_000 } = options;
  let timer: NodeJS.Timeout | undefined;
  let last: PlainObject = {};

  return {
    name,