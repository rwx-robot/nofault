import { Scanner, TokenType } from './scanner';
import type { Token } from './scanner';
import {
  FieldSource,
  createApiSpec,
  type ApiSpec,
  type FieldSpec,
  type RouteSpec,
  type ServiceSpec,
  type TypeSpec,
} from '@nofault/dsl';
import { pascalCase } from '@nofault/dsl';

/**
 * `.api` 解析器：文本式 API DSL（手写扫描器 + 递归下降）。
 *
 * 为什么不用 ANTLR：JS 版 ANTLR 运行时体积大、生成物臃肿，
 * 而这个语法只有十来个产生式，手写完全可控，报错也能做得更友好。
 *
 * 支持的语法：
 * ```
 * syntax = "v1"
 * info ( title: "..." )
 * type ( LoginReq { Name string `json:"name"` } )
 * @server ( group: user  prefix: /v1  jwt: Auth  middleware: Log  timeout: 3s )
 * service user-api {
 *   @handler login
 *   post /user/login (LoginReq) returns (LoginResp)
 * }
 * ```
 */
export class ApiParseError extends Error {
  constructor(message: string, public readonly line: number, public readonly column: number) {
    super(`${message} (line ${line}, column ${column})`);
    this.name = 'ApiParseError';
  }
}

const HTTP_METHODS = new Set(['get', 'post', 'put', 'delete', 'patch', 'head', 'options']);

export function parseApiSource(source: string, file?: string): ApiSpec {
  return new ApiParser(source, file).parse();
}

class ApiParser {
  private readonly tokens: Token[];
  private index = 0;

  constructor(source: string, private readonly file?: string) {
    this.tokens = new Scanner(source).scan();
  }

  parse(): ApiSpec {
    const spec = createApiSpec('api', this.file);

    while (!this.isEof()) {
      const tok = this.peek();

      // 顶层关键字
      if (this.matchIdent('syntax')) {
        this.advance();
        this.expectPunct('=');
        this.advanceString();
        continue;
      }
      if (this.matchIdent('info')) {
        this.advance();
        this.skipBalancedParens();
        continue;
      }
      if (this.matchIdent('type')) {
        this.parseTypeBlock(spec);
        continue;
      }
      if (this.matchPunct('@')) {
        // @server(...) 后面必然跟 service
        const server = this.parseServerBlock();
        const service = this.parseServiceBlock();
        spec.services.push({ ...service, ...server });
        continue;
      }
      if (this.matchIdent('service')) {
        spec.services.push(this.parseServiceBlock());
        continue;
      }
      // 注释掉的内容已被扫描器吃掉；其它一律报错，避免静默忽略拼写错误
      throw new ApiParseError(`Unexpected token "${tok.value}"`, tok.line, tok.column);
    }

    if (spec.services.length === 0) {
      throw new ApiParseError('No service defined', this.peek().line, this.peek().column);
    }
    return spec;
  }

  // ---------------------------------------------------------------- type

  private parseTypeBlock(spec: ApiSpec): void {
    this.expectIdent('type');
    // `type (` 或 `type Name`
    if (this.matchPunct('(')) {
      this.advance();
      while (!this.matchPunct(')') && !this.isEof()) {
        spec.types.push(this.parseTypeDecl());
      }
      this.expectPunct(')');
      return;
    }
    spec.types.push(this.parseTypeDecl());
  }

  private parseTypeDecl(): TypeSpec {
    const nameTok = this.peek();
    if (nameTok.type !== TokenType.IDENT) {
      throw new ApiParseError(`Expected type name, got "${nameTok.value}"`, nameTok.line, nameTok.column);
    }
    this.advance();
    this.expectPunct('{');

    const fields: FieldSpec[] = [];
    while (!this.matchPunct('}') && !this.isEof()) {
      const field = this.parseField();
      if (field) fields.push(field);
    }
    this.expectPunct('}');
    return { name: nameTok.value, fields };
  }

  private parseField(): FieldSpec | undefined {
    // `Name string `json:"name"``   或   `Name string`   或   `Age int // optional`
    const nameTok = this.peek();
    if (nameTok.type !== TokenType.IDENT) {
      this.advance();
      return undefined;
    }
    // 跳过匿名嵌套结构体的情况（本版不支持）
    if (this.matchPunct('*') || this.matchPunct('[')) {
      this.skipToFieldEnd();
      return undefined;
    }
    this.advance();

    let type = 'string';
    if (this.peek().type === TokenType.IDENT) {
      type = this.mapType(this.advance().value);
    }

    // 结构体 tag：`json:"name,optional"` 或 `path:"id"`
    let key = nameTok.value;
    let optional = false;
    let source: FieldSource = FieldSource.BODY;
    const rules: string[] = [];
    if (this.peek().type === TokenType.STRING) {
      const tag = this.advance().value;
      const jsonMatch = /json:\s*"([^"]*)"/.exec(tag);
      if (jsonMatch) {
        const [name, ...opts] = jsonMatch[1]!.split(',');
        if (name && name !== '-') key = name;
        optional = opts.includes('optional') || opts.includes('omitempty');
      }
      // `.api` DSL 里路径参数用 `path:"id"` 标记；带它的字段不属于请求体，
      // 生成器会改成 `@Param()` 绑定（见 codegen callShape）
      const pathMatch = /path:\s*"([^"]*)"/.exec(tag);
      if (pathMatch) {
        const [name, ...opts] = pathMatch[1]!.split(',');
        if (name) key = name;
        source = FieldSource.PATH;
        if (opts.includes('optional') || opts.includes('omitempty')) optional = true;
        if (type === 'number') rules.push('isInt');
      }
    }

    if (type === 'string') rules.push('isString');
    if (type === 'number' || type === 'int') rules.push(type === 'int' ? 'isInt' : 'isNumber');

    return { name: nameTok.value, key, type, source, optional, rules };
  }

  private skipToFieldEnd(): void {
    let depth = 0;
    while (!this.isEof()) {
      if (this.matchPunct('{')) depth++;
      if (this.matchPunct('}')) {
        if (depth === 0) return;
        depth--;
      }
      this.advance();
    }
  }

  private mapType(raw: string): string {
    switch (raw) {
      case 'string':
        return 'string';
      case 'int':
      case 'int64':
      case 'int32':
      case 'uint':
        return 'number';
      case 'float':
      case 'float64':
      case 'float32':
      case 'double':
        return 'number';
      case 'bool':
        return 'boolean';
      default:
        return raw;
    }
  }

  // ---------------------------------------------------------------- @server

  private parseServerBlock(): Partial<ServiceSpec> {
    this.expectPunct('@');
    const kw = this.peek();
    if (kw.type !== TokenType.IDENT || kw.value !== 'server') {
      throw new ApiParseError(`Expected "@server", got "@${kw.value}"`, kw.line, kw.column);
    }
    this.advance();
    this.expectPunct('(');

    const out: Partial<ServiceSpec> = { middleware: [] };
    while (!this.matchPunct(')') && !this.isEof()) {
      const keyTok = this.peek();
      if (keyTok.type !== TokenType.IDENT) {
        throw new ApiParseError(`Expected server option, got "${keyTok.value}"`, keyTok.line, keyTok.column);
      }
      this.advance();
      this.expectPunct(':');
      const value = this.readValueUntilSeparator();

      switch (keyTok.value) {
        case 'group':
          out.group = value;
          break;
        case 'prefix':
          out.prefix = value;
          break;
        case 'jwt':
          out.jwt = value;
          break;
        case 'middleware':
          out.middleware = value.split(',').map((s) => s.trim()).filter(Boolean);
          break;
        case 'timeout':
          out.timeout = value;
          break;
        case 'maxBytes':
          out.maxBytes = Number(value);
          break;
        default:
          // 未知选项不报错：DSL 版本差异会带来新选项
          break;
      }
    }
    this.expectPunct(')');
    return out;
  }

  /**
   * 读一个值：可能是标识符、路径（含 `/`）、字符串、数字，或逗号分隔的列表。
   *
   * 难点：逗号既可能是值列表的分隔（`middleware: A,B`），
   * 也可能是选项之间的分隔（`.api` 里两者都靠换行/空白区分）。
   * 判据是"逗号后面是不是 `ident:`"——是则视为新选项。
   */
  private readValueUntilSeparator(): string {
    let out = '';
    while (!this.isEof()) {
      const tok = this.peek();
      if (tok.type === TokenType.PUNCT && (tok.value === ')' || tok.value === '}')) break;
      // 出现 `ident:` 说明进入下一个选项
      if (tok.type === TokenType.IDENT && this.isOptionKeyAhead()) break;
      if (tok.type === TokenType.PUNCT && tok.value === ',') {