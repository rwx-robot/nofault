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

/**
 * TypeScript 契约文件（`.api.ts`）解析器。
 *
 * **不执行用户代码**——只做词法 + 轻量语法分析，因此安全、快速、无副作用。
 * （TypeScript Compiler API 能提供完整类型信息，但会带来几十 MB 依赖；
 *   契约文件的形状是固定的，扫描器足够。需要更严格的类型分析时再换。）
 *
 * 支持：
 * ```ts
 * @Api('user') @Prefix('/v1') @Group('user') @Jwt('Auth') @Timeout('3s')
 * export class UserService {
 *   @Post('/login') @Handler('login')
 *   login(req: LoginReq): LoginResp { throw new Error('todo'); }
 * }
 *
 * export class LoginReq {
 *   @Body('username') @IsString() @MinLength(3)
 *   username!: string;
 * }
 * ```
 */
export class TsParseError extends Error {
  constructor(message: string, public readonly line: number, public readonly column: number) {
    super(`${message} (line ${line}, column ${column})`);
    this.name = 'TsParseError';
  }
}

interface Decorator {
  name: string;
  args: string[];
}

const METHOD_DECORATORS = new Set(['Get', 'Post', 'Put', 'Delete', 'Patch', 'Head', 'Options']);
const FIELD_SOURCE_DECORATORS: Record<string, FieldSource> = {
  Body: FieldSource.BODY,
  Path: FieldSource.PATH,
  Query: FieldSource.QUERY,
  Header: FieldSource.HEADER,
  Form: FieldSource.FORM,
};
const RULE_DECORATORS: Record<string, (args: string[]) => string> = {
  IsString: () => 'isString',
  IsInt: () => 'isInt',
  IsNumber: () => 'isNumber',
  IsBoolean: () => 'isBoolean',
  IsEmail: () => 'isEmail',
  IsNotEmpty: () => 'isNotEmpty',
  MinLength: (a) => `minLength:${a[0] ?? 0}`,
  MaxLength: (a) => `maxLength:${a[0] ?? 0}`,
  Min: (a) => `min:${a[0] ?? 0}`,
  Max: (a) => `max:${a[0] ?? 0}`,
  Rule: (a) => a[0] ?? '',
};

export function parseTsSource(source: string, file?: string): ApiSpec {
  return new TsParser(source, file).parse();
}

class TsParser {
  private readonly tokens: Token[];
  private index = 0;
  private pending: Decorator[] = [];

  constructor(source: string, private readonly file?: string) {
    this.tokens = new Scanner(source).scan();
  }

  parse(): ApiSpec {
    const name = (this.file ?? 'api').replace(/^.*[\\/]/, '').replace(/\.api\.ts$|\.ts$/, '');
    const spec = createApiSpec(name, this.file);

    while (!this.isEof()) {
      const tok = this.peek();

      if (this.matchPunct('@')) {
        this.pending.push(this.readDecorator());
        continue;
      }
      if (tok.type === TokenType.IDENT && (tok.value === 'export' || tok.value === 'declare' || tok.value === 'default')) {
        this.advance();
        continue;
      }
      if (tok.type === TokenType.IDENT && tok.value === 'class') {
        this.parseClass(spec);
        continue;
      }
      if (tok.type === TokenType.IDENT && (tok.value === 'import' || tok.value === 'from')) {
        this.skipStatement();
        continue;
      }
      this.advance();
    }

    if (spec.services.length === 0) {
      throw new TsParseError('No API service class found (missing @Api / route decorators)', 1, 1);
    }
    return spec;
  }

  private parseClass(spec: ApiSpec): void {
    const decorators = this.pending;
    this.pending = [];
    this.expectIdent('class');

    const nameTok = this.peek();
    if (nameTok.type !== TokenType.IDENT) {
      throw new TsParseError(`Expected class name, got "${nameTok.value}"`, nameTok.line, nameTok.column);
    }
    this.advance();

    // 跳过 `extends X` / `implements Y`
    while (!this.matchPunct('{') && !this.isEof()) this.advance();
    this.expectPunct('{');

    const isService = decorators.some(
      (d) => d.name === 'Api' || METHOD_DECORATORS.has(d.name) || d.name === 'Group' || d.name === 'Prefix',
    ) || this.classHasRouteDecorators();

    if (isService) {
      spec.services.push(this.parseServiceBody(nameTok.value, decorators));
    } else {
      spec.types.push(this.parseTypeBody(nameTok.value, decorators));
    }
  }

  /** 预扫一眼：类名之后若有 @Get/@Post 之类，就是服务类 */
  private classHasRouteDecorators(): boolean {
    let depth = 0;
    for (let i = this.index; i < this.tokens.length; i++) {
      const t = this.tokens[i]!;
      if (t.type === TokenType.PUNCT && t.value === '{') depth++;
      if (t.type === TokenType.PUNCT && t.value === '}') {
        if (depth === 0) break;
        depth--;
      }
      if (t.type === TokenType.PUNCT && t.value === '@') {
        const next = this.tokens[i + 1];
        if (next?.type === TokenType.IDENT && METHOD_DECORATORS.has(next.value)) return true;
      }
    }
    return false;
  }

  // ---------------------------------------------------------------- 类型

  private parseTypeBody(name: string, decorators: Decorator[]): TypeSpec {
    void decorators;
    const fields: FieldSpec[] = [];
    let depth = 1;

    while (depth > 0 && !this.isEof()) {
      const tok = this.peek();

      if (this.matchPunct('@')) {
        this.pending.push(this.readDecorator());
        continue;
      }
      if (this.matchPunct('{')) {
        depth++;
        this.advance();
        continue;
      }
      if (this.matchPunct('}')) {
        depth--;
        this.advance();
        continue;
      }
      if (this.matchPunct(';')) {
        this.advance();
        continue;
      }
      if (tok.type === TokenType.IDENT && tok.value === 'constructor') {
        this.skipStatement();
        continue;
      }
      if (tok.type === TokenType.IDENT) {
        const field = this.parseProperty();
        if (field) fields.push(field);
        continue;
      }
      this.advance();
    }

    return { name, fields };
  }

  private parseProperty(): FieldSpec | undefined {
    const decorators = this.pending;
    this.pending = [];

    const nameTok = this.peek();
    this.advance();

    // 跳过 `!` `?` `:`
    let optional = false;
    let sawColon = false;
    while (!this.isEof() && !this.matchPunct(';')) {
      if (this.matchPunct('?')) optional = true;
      if (this.matchPunct(':')) sawColon = true;
      if (sawColon) break;
      this.advance();
    }

    let type = 'string';
    if (sawColon) {
      this.advance(); // ':'
      type = this.readTypeText();
    }

    const source = sourceFrom(decorators);
    const rules = rulesFrom(decorators);
    const key = explicitKey(decorators) ?? nameTok.value;

    return { name: nameTok.value, key, type, source, optional, rules };
  }

  private readTypeText(): string {
    let out = '';
    let angle = 0;
    while (!this.isEof() && !this.matchPunct(';')) {
      const tok = this.peek();
      if (tok.type === TokenType.PUNCT && tok.value === '<') angle++;
      if (tok.type === TokenType.PUNCT && tok.value === '>') angle--;
      if (tok.type === TokenType.PUNCT && (tok.value === '=' || tok.value === '{')) break;
      if (tok.type === TokenType.PUNCT && tok.value === ',' && angle === 0) break;
      out += tok.value;
      this.advance();
    }
    return out.trim();
  }

  // ---------------------------------------------------------------- 服务

  private parseServiceBody(name: string, decorators: Decorator[]): ServiceSpec {
    const service: ServiceSpec = {
      name,
      group: name.replace(/(Service|Api)$/, '').toLowerCase(),
      middleware: [],
      routes: [],
    };

    for (const d of decorators) {
      switch (d.name) {
        case 'Api':
          service.name = d.args[0] ?? service.name;
          break;
        case 'Prefix':
          service.prefix = d.args[0];
          break;
        case 'Group':
          service.group = d.args[0] ?? service.group;
          break;
        case 'Jwt':
          service.jwt = d.args[0];
          break;
        case 'Timeout':
          service.timeout = d.args[0];
          break;
        case 'MaxBytes':
          service.maxBytes = Number(d.args[0]);
          break;
        case 'Middleware':
          service.middleware = d.args.flatMap((a) => a.split(',').map((s) => s.trim())).filter(Boolean);
          break;
        default:
          break;
      }
    }

    let depth = 1;
    while (depth > 0 && !this.isEof()) {
      const tok = this.peek();

      if (this.matchPunct('@')) {
        this.pending.push(this.readDecorator());
        continue;
      }
      if (this.matchPunct('{')) {
        depth++;
        this.advance();
        continue;
      }
      if (this.matchPunct('}')) {
        depth--;
        this.advance();
        continue;
      }
      if (tok.type === TokenType.IDENT && this.isMethodStart()) {
        const route = this.parseMethod();
        if (route) service.routes.push(route);
        continue;
      }
      this.advance();
    }

    return service;
  }

  /** 标识符后紧跟 `(` 或 `<` 视为方法（泛型方法） */
  private isMethodStart(): boolean {
    let i = this.index + 1;
    while (i < this.tokens.length) {
      const t = this.tokens[i]!;
      if (t.type === TokenType.PUNCT && t.value === '(') return true;
      if (t.type === TokenType.PUNCT && t.value === '<') {
        i++;
        continue;
      }
      if (t.type === TokenType.IDENT) {
        i++;
        continue;
      }
      return false;
    }
    return false;
  }

  private parseMethod(): RouteSpec | undefined {
    const decorators = this.pending;
    this.pending = [];

    const methodTok = this.peek();
    this.advance();

    const routeDec = decorators.find((d) => METHOD_DECORATORS.has(d.name));
    if (!routeDec) {
      this.skipMethodTail();
      return undefined;