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