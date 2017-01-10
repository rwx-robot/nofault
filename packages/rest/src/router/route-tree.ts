/**
 * Radix 路由树（压缩前缀树）。
 *
 * 设计参考业界 Radix 路由实现的两个关键点：
 * 1. **每个 HTTP method 一棵树** —— 避免运行时再判断 method，匹配更快
 * 2. **静态段 / 参数段 / 通配段 分槽存放** —— 匹配顺序即优先级：静态 > 参数 > 通配
 *
 * 与通行实现的差异：多数实现用未压缩的分段 trie，这里对静态段做了**前缀压缩**，
 * 减少树的深度与内存占用。
 */

export enum SegmentType {
  STATIC = 'static',
  PARAM = 'param',
  WILDCARD = 'wildcard',
}

export interface RouteMatch<T> {
  handler: T;
  /** 路径参数，如 `{ id: '42' }` */
  params: Record<string, string>;
  /** 注册时的原始路径模板，如 `/users/:id` */
  pattern: string;
}

interface RouteNode<T> {
  /** 本节点代表的一段路径文本（静态节点不含 `/`；参数节点为参数名） */
  edge: string;
  type: SegmentType;
  /** 静态子节点，按 edge 首字符索引 */
  children: Map<string, RouteNode<T>>;
  /** 参数子节点（同名参数只允许一个） */
  paramChild?: RouteNode<T>;
  /** 通配子节点 */
  wildcardChild?: RouteNode<T>;
  handler?: T;
  /** 完整路径模板，仅终结节点有值 */
  pattern?: string;
  /** 参数名（仅参数节点） */
  paramName?: string;
}

export class RouteConflictError extends Error {
  constructor(pattern: string, existing: string) {
    super(
      `Route conflict: cannot register "${pattern}", ` +
        `it collides with the already registered "${existing}".`,
    );
    this.name = 'RouteConflictError';
  }
}

/** 未命名的通配段 `*` 默认落在这个参数名下（保持既有行为） */
const WILDCARD_PARAM = 'wildcard';

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function isIdentifier(name: string): boolean {
  return IDENTIFIER.test(name);
}

function splitPath(path: string): string[] {
  return path.split('/').filter((s) => s.length > 0);
}

function commonPrefixLength(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i++;
  return i;
}

/**
 * 单棵路由树（一个 HTTP method 对应一棵）。
 */
export class RouteTree<T> {
  private readonly root: RouteNode<T> = {
    edge: '',
    type: SegmentType.STATIC,
    children: new Map(),
  };

  private readonly patterns = new Map<string, string>();

  /** 注册路由 */
  add(pattern: string, handler: T): void {
    const segments = splitPath(pattern);

    // 归一化后的模板，用于冲突检测与去重
    const normalized = '/' + segments.join('/');
    const existing = this.patterns.get(normalized);
    if (existing !== undefined) {