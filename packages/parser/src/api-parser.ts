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
