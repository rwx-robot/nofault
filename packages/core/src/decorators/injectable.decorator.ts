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
 * }
 * ```
 */
export function Inject<T>(token: InjectionToken<T>): ParameterDecorator & PropertyDecorator {
  return (target: object, propertyKey: string | symbol | undefined, index?: number) => {
    if (typeof index === 'number') {
      // 构造函数参数注入
      const deps: Array<InjectionToken | undefined> =
        Reflect.getMetadata(PROVIDER_METADATA.DEPENDENCIES, target) ?? [];
      deps[index] = token;
      Reflect.defineMetadata(PROVIDER_METADATA.DEPENDENCIES, deps, target);
      return;
    }
    if (propertyKey !== undefined) {
      // 属性注入
      const key = `nofault:property:inject:${tokenToString(propertyKey)}`;
      Reflect.defineMetadata(key, token, target.constructor);
      const props: Array<string | symbol> =
        Reflect.getMetadata('nofault:property:inject:keys', target.constructor) ?? [];
      if (!props.includes(propertyKey)) {
        props.push(propertyKey);
        Reflect.defineMetadata('nofault:property:inject:keys', props, target.constructor);
      }
    }
  };
}

/** 标记依赖可选：找不到时不抛错，注入 undefined */
export function Optional(): ParameterDecorator & PropertyDecorator {
  return (target: object, propertyKey: string | symbol | undefined, index?: number) => {
    if (typeof index === 'number') {
      const optionals: number[] = Reflect.getMetadata('nofault:optional:params', target) ?? [];
      optionals.push(index);
      Reflect.defineMetadata('nofault:optional:params', optionals, target);
      return;
    }
    if (propertyKey !== undefined) {
      const optionals: Array<string | symbol> =
        Reflect.getMetadata('nofault:optional:props', target.constructor) ?? [];
      optionals.push(propertyKey);
      Reflect.defineMetadata('nofault:optional:props', optionals, target.constructor);
    }
  };
}

/** 读取构造函数参数类型（由 TS 发射的元数据） */
export function readParamTypes(target: object): InjectionToken[] {
  return (Reflect.getMetadata(PARAM_TYPES_METADATA, target) as InjectionToken[] | undefined) ?? [];
}

/** 读取 `@Inject` 显式覆盖的构造参数令牌 */
export function readDependencyOverrides(target: object): Array<InjectionToken | undefined> {
  return (Reflect.getMetadata(PROVIDER_METADATA.DEPENDENCIES, target) as Array<InjectionToken | undefined>) ?? [];
}

export function readOptionalParams(target: object): number[] {
  return (Reflect.getMetadata('nofault:optional:params', target) as number[] | undefined) ?? [];
}

/** 读取属性注入清单：[[propertyKey, token, optional], ...] */
export function readPropertyInjections(
  target: Function,
): Array<{ key: string | symbol; token: InjectionToken; optional: boolean }> {
  const keys: Array<string | symbol> = Reflect.getMetadata('nofault:property:inject:keys', target) ?? [];
  const optionals: Array<string | symbol> = Reflect.getMetadata('nofault:optional:props', target) ?? [];