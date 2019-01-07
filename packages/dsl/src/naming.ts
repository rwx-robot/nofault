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
    .join('');
}

export function camelCase(input: string): string {
  const p = pascalCase(input);
  return p.length === 0 ? p : p[0]!.toLowerCase() + p.slice(1);
}

export function kebabCase(input: string): string {
  return splitWords(input)
    .map((w) => w.toLowerCase())
    .join('-');
}

export function snakeCase(input: string): string {
  return splitWords(input)
    .map((w) => w.toLowerCase())
    .join('_');
}

/** 单数化（极其保守：只处理常见复数形式，拿不准就原样返回） */
export function singularize(input: string): string {
  if (/ies$/i.test(input)) return input.slice(0, -3) + 'y';
  if (/(ch|sh|ss|x|z)es$/i.test(input)) return input.slice(0, -2);
  if (/s$/i.test(input) && !/ss$/i.test(input)) return input.slice(0, -1);
  return input;
}

/**
 * 由路由路径推导 handler 名。
 *
 * `/user/list` → `list`；`/user/:id` → `userDetail`（`:id` 视为详情）
 */
export function handlerNameFromPath(method: string, path: string): string {
  const segments = path
    .split('/')
    .filter((s) => s.length > 0)
    .map((s) => (s.startsWith(':') ? `by${pascalCase(s.slice(1))}` : s));

  if (segments.length === 0) return camelCase(method.toLowerCase());
  const last = segments[segments.length - 1]!;
  if (/^(by|of)/.test(last) || last.toLowerCase() !== last) {
    // 形如 /user/:id：用资源名 + 后缀
    const resource = segments[0] ?? 'item';
    return camelCase(`${singularize(resource)}-detail`);
  }
  return camelCase(last);
}

/** 生成 TypeScript 类型名（去掉 Req/Resp 之外的修饰，首字母大写） */
export function typeName(input: string): string {
  return pascalCase(input);
}
