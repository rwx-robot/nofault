import type { PlainObject } from './loader';

export class ConfigError extends Error {
  constructor(key: string) {
    super(`Configuration key \`${key}\` is required but missing.`);
    this.name = 'ConfigError';
  }
}

/** 取值来源：既可以是静态对象，也可以是会热更新的 registry */
export interface ConfigValuesProvider {
  values(): PlainObject;
  reload?(): Promise<PlainObject>;
  subscribe?(listener: (values: PlainObject, previous: PlainObject) => void): () => void;
}

class StaticProvider implements ConfigValuesProvider {
  constructor(private readonly store: PlainObject) {}
  values(): PlainObject {
    return this.store;
  }
}

function toProvider(store: PlainObject | ConfigValuesProvider): ConfigValuesProvider {
  if (typeof (store as ConfigValuesProvider).values === 'function') {
    return store as ConfigValuesProvider;
  }
  return new StaticProvider(store as PlainObject);
}

/**
 * 配置服务：按键路径读取配置。
 *
 * 构造参数可以是**静态对象**，也可以是 `ConfigRegistry`（热更新）。
 * 读取时总是取当前快照，因此热更新对业务代码是透明的。
 *
 * @example
 * ```ts
 * const port = config.get<number>('server.port', 3000);
 * config.subscribe((next) => log.info('config changed'));
 * ```
 */
export class ConfigService {
  private readonly provider: ConfigValuesProvider;

  constructor(store: PlainObject | ConfigValuesProvider) {
    this.provider = toProvider(store);
  }

  /** 取值（无默认值时可能为 undefined） */
  get<T>(path: string): T | undefined;
  /** 取值，缺失则使用默认值 */
  get<T>(path: string, defaultValue: T): T;
  get<T>(path: string, defaultValue?: T): T | undefined {
    const value = this.read(path);
    return (value === undefined ? defaultValue : value) as T | undefined;
  }

  /** 取值，缺失即抛错（用于必填项） */
  getOrThrow<T>(path: string): T {
    const value = this.read(path);
    if (value === undefined || value === null) throw new ConfigError(path);
    return value as T;
  }

  has(path: string): boolean {
    return this.read(path) !== undefined;
  }

  /** 返回全量配置（只读副本，防止误改） */
  snapshot<T extends PlainObject = PlainObject>(): T {
    return structuredClone(this.provider.values()) as T;
  }

  /** 主动触发一次重新加载（静态配置是 no-op） */
  async reload(): Promise<void> {
    await this.provider.reload?.();
  }

  /** 订阅配置变更（静态配置下永不触发） */
  subscribe(listener: (values: PlainObject, previous: PlainObject) => void): () => void {
    if (!this.provider.subscribe) return () => undefined;