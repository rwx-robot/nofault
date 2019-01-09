/**
 * API 契约的中间表示（Spec）。
 *
 * 这是 v0.4.0 的枢纽：**两种输入（TS 契约 / `.api` 文件）→ 同一个 Spec → 代码生成器**。
 * 生成器和输入格式解耦，以后加 OpenAPI、proto 输入也只是多一个 parser。
 */

/** 字段来源（对应 HTTP 请求的哪个部分） */
export enum FieldSource {
  BODY = 'body',
  PATH = 'path',
  QUERY = 'query',
  HEADER = 'header',
  FORM = 'form',
}

export interface FieldSpec {
  name: string;
  /** 传输时的键名（默认与 name 相同） */
  key: string;
  /** TS 类型文本，如 `string` / `number` / `User[]` */
  type: string;
  source: FieldSource;
  optional: boolean;
  /** 校验规则，如 `['isString', 'minLength:3']` */
  rules: string[];
  /** 注释（生成代码时保留） */
  comment?: string;
}

export interface TypeSpec {