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
  public readonly exports = new Set<InjectionToken>();
  public readonly isGlobal: boolean;
  /** Provider 原始定义，实例化阶段使用 */
  public readonly providerDefs: Provider[] = [];
  /** 本模块声明的控制器（供 Web 层扫描） */
  public readonly controllers: Array<Type<unknown>> = [];

  constructor(
    public readonly token: Type<unknown>,
    public readonly raw: Type<unknown> | DynamicModule,
  ) {
    this.isGlobal = (raw as DynamicModule)?.global === true;
  }

  get name(): string {
    return tokenToString(this.token);
  }

  addProvider(def: Provider, wrapper: InstanceWrapper): void {
    const token = getProviderToken(def);
    if (!this.providerDefs.includes(def)) this.providerDefs.push(def);
    this.providers.set(token, wrapper);
  }

  hasProvider(token: InjectionToken): boolean {
    return this.providers.has(token);
  }

  addImport(ref: ModuleRef): void {
    this.imports.add(ref);
  }

  addExport(token: InjectionToken): void {
    this.exports.add(token);
  }