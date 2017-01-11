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
      throw new RouteConflictError(pattern, existing);
    }
    this.patterns.set(normalized, pattern);

    let cur = this.root;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]!;

      // 通配段：`*` 用默认参数名 wildcard，`*name` 可自定义（如 `/static/*rest`）
      if (seg.startsWith('*')) {
        const name = seg.length > 1 ? seg.slice(1) : WILDCARD_PARAM;
        if (!isIdentifier(name)) {
          throw new RouteConflictError(pattern, `<invalid wildcard name "${name}">`);
        }
        if (i !== segments.length - 1) {
          /**
           * 通配段会吃掉剩余全部路径，它后面的任何子路由**永远不可能命中**。
           *
           * 这类"注册成功但永远 404"是最难排查的一类问题：路由表里看得到，
           * 请求却打不到。宁可在注册期就报错，也不要留一个静默失效的路由。
           */
          throw new RouteConflictError(pattern, '<unreachable: segments after wildcard>');
        }
        if (cur.wildcardChild && cur.wildcardChild.paramName !== name) {
          throw new RouteConflictError(pattern, `<*${cur.wildcardChild.paramName}>`);
        }
        cur.wildcardChild ??= {
          edge: seg,
          type: SegmentType.WILDCARD,
          children: new Map(),
          paramName: name,
        };
        cur = cur.wildcardChild;
        continue;
      }

      if (seg.startsWith(':')) {
        const name = seg.slice(1);
        if (cur.paramChild && cur.paramChild.paramName !== name) {
          throw new RouteConflictError(pattern, `<:${cur.paramChild.paramName}>`);
        }
        cur.paramChild ??= {
          edge: seg,
          type: SegmentType.PARAM,
          children: new Map(),
          paramName: name,
        };
        cur = cur.paramChild;
        continue;
      }
      cur = this.insertStatic(cur, seg);
    }

    if (cur.handler !== undefined) {
      throw new RouteConflictError(pattern, cur.pattern ?? normalized);
    }
    cur.handler = handler;
    cur.pattern = pattern;
  }

  private insertStatic(node: RouteNode<T>, segment: string): RouteNode<T> {
    const key = segment[0]!;
    const child = node.children.get(key);

    if (!child) {
      const created: RouteNode<T> = { edge: segment, type: SegmentType.STATIC, children: new Map() };
      node.children.set(key, created);
      return created;
    }

    const common = commonPrefixLength(child.edge, segment);

    if (common === child.edge.length) {
      // child.edge 是 segment 的前缀：继续向下
      const rest = segment.slice(common);
      if (rest === '') return child;
      return this.insertStatic(child, rest);
    }

    if (common === 0) {
      // 首字符相同但没有公共前缀 —— 理论上不会发生（首字符即公共前缀 ≥1）
      const created: RouteNode<T> = { edge: segment, type: SegmentType.STATIC, children: new Map() };
      node.children.set(key, created);
      return created;
    }

    // 需要分裂：把 child 压到新的中间节点下面
    const mid: RouteNode<T> = {
      edge: child.edge.slice(0, common),
      type: SegmentType.STATIC,
      children: new Map(),
    };
    child.edge = child.edge.slice(common);
    mid.children.set(child.edge[0]!, child);
    node.children.set(key, mid);

    const rest = segment.slice(common);
    if (rest === '') return mid;
    return this.insertStatic(mid, rest);
  }

  /** 匹配路径；未命中返回 undefined */
  match(path: string): RouteMatch<T> | undefined {
    const segments = splitPath(path);
    const params: Record<string, string> = {};
    const found = this.walk(this.root, segments, 0, params);
    if (!found) return undefined;
    return { handler: found.handler!, params, pattern: found.pattern ?? path };
  }

  private walk(
    node: RouteNode<T>,
    segments: string[],
    index: number,
    params: Record<string, string>,
  ): RouteNode<T> | undefined {
    if (index === segments.length) {
      return node.handler !== undefined ? node : undefined;
    }

    const seg = segments[index]!;

    // 1) 静态优先
    const child = node.children.get(seg[0]!);
    if (child && seg.startsWith(child.edge)) {
      const rest = seg.slice(child.edge.length);
      const nextSegments = rest === '' ? segments : withReplacedSegment(segments, index, rest);
      const nextIndex = rest === '' ? index + 1 : index;
      const res = this.walk(child, nextSegments, nextIndex, params);
      if (res) return res;
    }

    // 2) 参数段
    if (node.paramChild) {
      const prev = params[node.paramChild.paramName!];
      params[node.paramChild.paramName!] = decodeURIComponent(seg);
      const res = this.walk(node.paramChild, segments, index + 1, params);
      if (res) return res;
      restoreParam(params, node.paramChild.paramName!, prev);
    }

    // 3) 通配段：吃掉剩余全部
    if (node.wildcardChild) {
      const wc = node.wildcardChild;
      if (wc.handler !== undefined) {
        params[wc.paramName ?? WILDCARD_PARAM] = segments.slice(index).map(decodeURIComponent).join('/');
        return wc;
      }
    }

    return undefined;
  }

  /** 已注册的路由模式（调试与文档生成用） */
  listPatterns(): string[] {
    return [...this.patterns.values()];
  }

  get size(): number {
    return this.patterns.size;
  }
}

function withReplacedSegment(segments: string[], index: number, value: string): string[] {
  const copy = segments.slice();
  copy[index] = value;
  return copy;
}

function restoreParam(params: Record<string, string>, key: string, prev: string | undefined): void {
  if (prev === undefined) delete params[key];
  else params[key] = prev;
}

/**
 * 多方法路由表：`RouteTable` = method → RouteTree。
 *
 * 与通行实现一致：**按 method 分树**，而不是在一棵树上再判断 method。
 */
export class RouteTable<T> {
  private readonly trees = new Map<string, RouteTree<T>>();
  private readonly allowed = new Map<string, Set<string>>();

  add(method: string, pattern: string, handler: T): void {
    const m = method.toUpperCase();
    let tree = this.trees.get(m);
    if (!tree) {
      tree = new RouteTree<T>();
      this.trees.set(m, tree);
    }
    tree.add(pattern, handler);

    const set = this.allowed.get(pattern) ?? new Set<string>();
    set.add(m);
    this.allowed.set(pattern, set);

    // HEAD 请求回落到 GET
    if (m === 'GET') {
      const headSet = this.allowed.get(pattern) ?? new Set<string>();
      headSet.add('HEAD');
      this.allowed.set(pattern, headSet);
    }
  }

  match(method: string, path: string): RouteMatch<T> | undefined {
    const m = method.toUpperCase();
    const tree = this.trees.get(m) ?? (m === 'HEAD' ? this.trees.get('GET') : undefined);
    return tree?.match(path);
  }

  /**
   * 路径存在、但当前方法未注册时，返回允许的方法列表（用于 405 + Allow 头）。
   *
   * 用**真实匹配**而不是"形状匹配"：否则 `/users/count` 会被 `/users/:id`
   * 误判为命中，导致 Allow 里出现一堆其实并不存在的方法。
   */
  allowedMethods(path: string): string[] {
    const out = new Set<string>();
    for (const [method, tree] of this.trees) {
      if (tree.match(path)) out.add(method);
    }