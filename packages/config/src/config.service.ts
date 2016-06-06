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