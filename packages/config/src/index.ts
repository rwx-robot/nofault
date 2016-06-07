/**
 * @nofault/config —— 配置：文件加载、环境变量覆盖、命名空间、热更新。
 */
export { ConfigModule, registerAs, CONFIG_VALUES, CONFIG_REGISTRY } from './config.module';
export type { ConfigModuleOptions } from './config.module';

export { ConfigService, createConfigService, ConfigError } from './config.service';
export type { ConfigValuesProvider } from './config.service';

export { ConfigRegistry, buildRegistry } from './registry';
export type { ConfigChangeListener, ConfigRegistryOptions } from './registry';

export {
  createInlineSource,
  createFileSource,
  createPollingSource,
  createEnvSource,
} from './provider';