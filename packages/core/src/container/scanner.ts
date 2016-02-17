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
    return this.scanModule(resolved);
  }

  private async scanModule(raw: Type<unknown> | DynamicModule): Promise<ModuleRef> {
    const ref = this.container.registerModule(raw);
    const meta = isDynamicModule(raw)
      ? {
          imports: raw.imports ?? [],
          providers: raw.providers ?? [],
          exports: raw.exports ?? [],
          controllers: raw.controllers ?? [],
        }
      : readModuleMetadata(raw as Type<unknown>);

    // 1) 先注册导出的令牌，保证子模块解析时能命中
    for (const exp of meta.exports) {
      ref.addExport(exp as InjectionToken);
    }

    // 2) 递归扫描导入的模块
    for (const imp of meta.imports) {
      const child = await this.scanModule((await imp) as Type<unknown> | DynamicModule);
      ref.addImport(child);
    }

    // 3) 注册本模块 Provider
    for (const p of meta.providers) {
      ref.providerDefs.push(p);
    }
