import 'reflect-metadata';
import { PARAM_TYPES_METADATA, PROVIDER_METADATA, PROPERTY_TYPE_METADATA } from '../constants';
import { Scope } from '../interfaces/type.interface';
import type { InjectionToken } from '../interfaces/type.interface';
import { tokenToString } from '../interfaces/type.interface';

interface InjectableOptions {
  scope?: Scope;
}

/**
 * 标记一个类可以被 IoC 容器实例化与注入。
 *
 * @example
 * ```ts
 * @Injectable()
 * export class UserService {}
 * ```
 */
export function Injectable(options: InjectableOptions = {}): ClassDecorator {
  return (target) => {
    Reflect.defineMetadata(PROVIDER_METADATA.SCOPE, options.scope ?? Scope.SINGLETON, target);
  };
}

export function readScope(target: Function): Scope {
  return (Reflect.getMetadata(PROVIDER_METADATA.SCOPE, target) as Scope | undefined) ?? Scope.SINGLETON;
}

/**
 * 构造函数参数注入：显式指定某个位置参数的令牌。
 *
 * 典型场景：依赖是接口（抽象类）、字符串令牌，或 TS 无法发射 `design:paramtypes`（如循环依赖）。
 *
 * @example
 * ```ts
 * @Injectable()
 * export class UserService {
 *   constructor(@Inject('DB_CONFIG') private readonly config: DbConfig) {}