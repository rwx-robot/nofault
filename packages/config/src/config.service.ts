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