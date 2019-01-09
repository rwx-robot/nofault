/**
 * 命名转换工具。
 *
 * 代码生成的成败一半在命名：`user_api` → `UserApi`、`/user/list` → `userList`。
 * 这些规则集中在这里，避免每个模板各写一套导致风格飘移。
 */

/** 拆词：支持 `-` `_` 分隔与 camelCase / PascalCase 边界 */
export function splitWords(input: string): string[] {
  return input
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^a-zA-Z0-9]+/)
    .filter((w) => w.length > 0);
}

export function pascalCase(input: string): string {
  return splitWords(input)
    .map((w) => w[0]!.toUpperCase() + w.slice(1).toLowerCase())