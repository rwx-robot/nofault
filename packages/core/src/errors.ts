import type { InjectionToken } from './interfaces/type.interface';
import { tokenToString } from './interfaces/type.interface';

/** 依赖解析失败 */
export class UnknownDependencyError extends Error {
  constructor(token: InjectionToken, context?: string) {
    const where = context ? ` in ${context}` : '';
    super(
      `nofault can't resolve dependencies of the provider \`${tokenToString(token)}\`${where}. ` +
        `Please make sure the provider is declared in a module, or the module exporting it is imported.`,
    );
    this.name = 'UnknownDependencyError';
  }
}

/** 循环依赖 */
export class CircularDependencyError extends Error {
  constructor(chain: string[]) {