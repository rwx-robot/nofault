import { Global, Module } from '@nofault/core';
import type { DynamicModule, ValueProvider } from '@nofault/core';
import { ConfigService, createConfigService } from './config.service';
import { buildRegistry } from './registry';
import type { ConfigSource } from './provider';
import { applyEnvOverrides, loadConfigFile, type PlainObject } from './loader';

export interface ConfigModuleOptions {
  /** 配置文件路径（json/yaml/env） */
  path?: string;
  /** 直接内联的配置对象 */
  values?: PlainObject;
  /** 额外配置源（远程配置中心等）；合并时后者覆盖前者 */
  sources?: ConfigSource[];
  /** 环境变量前缀，默认 `NOFAULT_` */
  envPrefix?: string;
  /** 是否禁用环境变量覆盖，默认 false */
  ignoreEnv?: boolean;
  /** 是否注册为全局模块，默认 true */
  isGlobal?: boolean;
  /** 是否监听配置变化（仅 `forRootAsync` 生效） */
  watch?: boolean;
}

/** 配置对象本身的注入令牌（未包装） */
export const CONFIG_VALUES = Symbol('NOFAULT_CONFIG_VALUES');
/** 配置注册表的注入令牌（需要热更新能力时注入它） */
export const CONFIG_REGISTRY = Symbol('NOFAULT_CONFIG_REGISTRY');

@Global()
@Module({})
export class ConfigModule {
  /**
   * 同步注册配置模块（不支持热更新）。
   *
   * @example
   * ```ts
   * @Module({ imports: [ConfigModule.forRoot({ path: 'config.yaml' })] })
   * export class AppModule {}
   * ```
   */
  static forRoot(options: ConfigModuleOptions = {}): DynamicModule {
    const values = ConfigModule.loadValues(options);
    const service = createConfigService(values);

    const providers: ValueProvider[] = [
      { provide: CONFIG_VALUES, useValue: values },
      { provide: ConfigService, useValue: service },
    ];

    return {
      module: ConfigModule,
      global: options.isGlobal ?? true,
      providers,
      exports: [ConfigService, CONFIG_VALUES],
    };
  }

  /**
   * 异步注册：完成首次加载后再返回模块定义，**支持热更新**。
   *
   * 内核的模块扫描器会 `await` 动态模块，所以直接放进 `imports` 即可。
   *
   * @example
   * ```ts
   * @Module({ imports: [ConfigModule.forRootAsync({ path: 'config.yaml', watch: true })] })
   * export class AppModule {}
   * ```
   */
  static async forRootAsync(options: ConfigModuleOptions = {}): Promise<DynamicModule> {
    const registry = buildRegistry({ ...options, watch: options.watch ?? true });
    await registry.start();
    const service = createConfigService(registry);

    const providers: ValueProvider[] = [
      { provide: CONFIG_REGISTRY, useValue: registry },
      { provide: CONFIG_VALUES, useValue: registry.values() },
      { provide: ConfigService, useValue: service },
    ];

    return {
      module: ConfigModule,
      global: options.isGlobal ?? true,
      providers,
      exports: [ConfigService, CONFIG_REGISTRY, CONFIG_VALUES],
    };
  }

  /** 只加载、不注册，供脚本与测试使用 */
  static loadValues(options: ConfigModuleOptions = {}): PlainObject {
    let values: PlainObject = { ...(options.values ?? {}) };
    if (options.path) {
      values = { ...values, ...loadConfigFile(options.path) };
    }
    if (!options.ignoreEnv) {
      const prefix = options.envPrefix ?? 'NOFAULT_';
      values = applyEnvOverrides(values, prefix);
    }
    return values;
  }
}

/**