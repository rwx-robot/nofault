import 'reflect-metadata';
import { MODULE_METADATA } from '../constants';
import type { ModuleMetadata } from '../interfaces/module.interface';
import type { Type } from '../interfaces/type.interface';

/**
 * 声明一个 nofault 模块。
 *
 * @example
 * ```ts
 * @Module({
 *   imports: [UserModule],
 *   providers: [UserService],
 *   exports: [UserService],
 * })
 * export class AppModule {}
 * ```
 */
export function Module(metadata: ModuleMetadata = {}): ClassDecorator {
  return (target) => {
    const imports = metadata.imports ?? [];
    const providers = metadata.providers ?? [];
    const exports = metadata.exports ?? [];

    Reflect.defineMetadata(MODULE_METADATA.IMPORTS, imports, target);
    Reflect.defineMetadata(MODULE_METADATA.PROVIDERS, providers, target);
    Reflect.defineMetadata(MODULE_METADATA.EXPORTS, exports, target);
    Reflect.defineMetadata(MODULE_METADATA.CONTROLLERS, metadata.controllers ?? [], target);
  };
}

/** 标记为全局模块：注册后任何模块都能直接注入其导出，无需显式 import */
export function Global(): ClassDecorator {
  return (target) => {
    Reflect.defineMetadata(MODULE_METADATA.GLOBAL, true, target);
  };
}

/** 读取模块元数据（供扫描器使用） */
export function readModuleMetadata(target: Type<unknown>): Required<ModuleMetadata> {
  return {
    imports: Reflect.getMetadata(MODULE_METADATA.IMPORTS, target) ?? [],
    providers: Reflect.getMetadata(MODULE_METADATA.PROVIDERS, target) ?? [],
    exports: Reflect.getMetadata(MODULE_METADATA.EXPORTS, target) ?? [],
    controllers: Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, target) ?? [],
  };