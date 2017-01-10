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