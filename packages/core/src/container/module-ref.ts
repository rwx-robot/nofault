import type { DynamicModule, Provider } from '../interfaces/module.interface';
import { getProviderToken } from '../interfaces/module.interface';
import type { InjectionToken, Type } from '../interfaces/type.interface';
import { tokenToString } from '../interfaces/type.interface';
import type { InstanceWrapper } from './instance-wrapper';

/**
 * 模块容器：对应一个 `@Module()` 类。
 *
 * 保存该模块声明的 Provider、导入的模块、导出的令牌。
 */
export class ModuleRef {
  public readonly providers = new Map<InjectionToken, InstanceWrapper>();
  public readonly imports = new Set<ModuleRef>();