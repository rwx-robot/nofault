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
    super(`Circular dependency detected: ${chain.join(' -> ')}`);
    this.name = 'CircularDependencyError';
  }
}

/**
 * 请求级（REQUEST 作用域）Provider 在没有上下文的情况下被解析。