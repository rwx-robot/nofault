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