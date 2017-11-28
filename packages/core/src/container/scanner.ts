import { readModuleMetadata } from '../decorators/module.decorator';
import type { DynamicModule } from '../interfaces/module.interface';
import { isDynamicModule } from '../interfaces/module.interface';
import type { InjectionToken, Type } from '../interfaces/type.interface';
import { tokenToString } from '../interfaces/type.interface';
import type { NofaultContainer } from './container';
import type { ModuleRef } from './module-ref';

/**
 * 模块扫描器：从根模块出发，深度优先遍历整张模块图。
 *
 * 处理三类模块定义：
 * 1. 普通类模块 `@Module()`
 * 2. 动态模块 `SomeModule.forRoot()`（同步）
 * 3. 动态模块（异步，返回 Promise）
 */
export class ModuleScanner {
  constructor(private readonly container: NofaultContainer) {}

  async scan(root: Type<unknown> | DynamicModule | Promise<DynamicModule>): Promise<ModuleRef> {
    const resolved = await root;