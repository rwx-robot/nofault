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
