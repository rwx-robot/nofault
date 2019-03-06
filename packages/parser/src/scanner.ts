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

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
}

export class ScannerError extends Error {
  constructor(message: string, line: number, column: number) {
    super(`${message} (line ${line}, column ${column})`);
    this.name = 'ScannerError';
  }
}

// 注意 `!` 必须在这里：TS 契约里用 `prop!: string` 关闭 strictPropertyInitialization，
// 这是写 DTO 最常见的写法，不支持等于解析器不可用。
const PUNCT_CHARS = new Set([
  '{', '}', '(', ')', '[', ']', ':', ';', ',', '=', '*', '-', '/', '@', '`',
  '<', '>', '?', '|', '&', '.', '!', '+', '%', '~', '^',
]);

export class Scanner {
  private pos = 0;
  private line = 1;
  private column = 1;
  private readonly tokens: Token[] = [];

  constructor(private readonly source: string) {}

  scan(): Token[] {
    while (this.pos < this.source.length) {
      const ch = this.source[this.pos]!;

      // 空白
      if (ch === '\n') {
        this.advance();
        this.line++;
        this.column = 1;
        continue;
      }
      if (ch === ' ' || ch === '\t' || ch === '\r') {
        this.advance();
        continue;
      }

      // 注释
      if (ch === '/' && this.source[this.pos + 1] === '/') {
        while (this.pos < this.source.length && this.source[this.pos] !== '\n') this.advance();
        continue;
      }
      if (ch === '/' && this.source[this.pos + 1] === '*') {
        this.advance();
        this.advance();
        while (this.pos < this.source.length && !(this.source[this.pos] === '*' && this.source[this.pos + 1] === '/')) {
          if (this.source[this.pos] === '\n') {
            this.line++;
            this.column = 1;
          }
          this.advance();
        }
        this.advance();
        this.advance();
        continue;
      }

      // 字符串
      if (ch === '"' || ch === "'") {
        this.tokens.push(this.readString(ch));
        continue;
      }

      // 反引号（Go struct tag）整段作为一个 string
      if (ch === '`') {
        this.tokens.push(this.readBacktick());
        continue;
      }

      // 数字
      if (isDigit(ch) || (ch === '-' && isDigit(this.source[this.pos + 1] ?? ''))) {
        this.tokens.push(this.readNumber());
        continue;
      }

      // 标识符 / 关键字
      if (isIdentStart(ch)) {
        this.tokens.push(this.readIdent());
        continue;
      }

      if (PUNCT_CHARS.has(ch)) {
        const startLine = this.line;
        const startColumn = this.column;
        this.advance();
        this.tokens.push({ type: TokenType.PUNCT, value: ch, line: startLine, column: startColumn });
        continue;
      }

      throw new ScannerError(`Unexpected character "${ch}"`, this.line, this.column);
    }