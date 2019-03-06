/**
 * 通用扫描器（词法分析）。
 *
 * `.api` 与 TypeScript 契约文件的词法高度相似（标识符、字符串、数字、注释），
 * 因此共用一套扫描器，只是关键字集合不同。
 *
 * 每个 token 都带**行列号**——解析器报出的语法错误必须能定位到具体位置，
 * 否则用户面对"解析失败"四个字完全无从下手。
 */

export enum TokenType {
  IDENT = 'ident',
  STRING = 'string',
  NUMBER = 'number',
  PUNCT = 'punct',
  EOF = 'eof',
}