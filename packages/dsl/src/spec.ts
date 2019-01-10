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
  name: string;
  fields: FieldSpec[];
  comment?: string;
}

export interface RouteSpec {
  /** 处理器名，如 `login` */
  handler: string;
  method: string;
  path: string;
  /** 请求类型名（可选：无 body 的路由可以没有） */
  requestType?: string;
  /** 响应类型名 */
  responseType?: string;
  /** 路由级覆盖：是否鉴权 */
  auth?: boolean;
  /** 路由级中间件 */
  middleware?: string[];
  comment?: string;
}

export interface ServiceSpec {
  /** 服务名，如 `user` */
  name: string;
  /** 路由前缀，如 `/v1` */
  prefix?: string;
  /** 分组（决定生成目录），如 `user` */
  group: string;
  /** 鉴权方式，如 `Auth`；为空表示不鉴权 */
  jwt?: string;
  /** 服务级中间件 */
  middleware: string[];
  /** 超时，如 `3s` */
  timeout?: string;
  /** 请求体大小上限（字节） */
  maxBytes?: number;
  routes: RouteSpec[];
  comment?: string;
}

export interface ApiSpec {
  /** 契约来源文件路径（便于报错定位） */
  readonly file?: string;
  /** 契约名（默认取文件名） */
  name: string;
  types: TypeSpec[];
  services: ServiceSpec[];
}

export function createApiSpec(name: string, file?: string): ApiSpec {
  return { name, file, types: [], services: [] };
}

/** 按名字找类型（找不到返回 undefined，调用方决定如何报错） */
export function findType(spec: ApiSpec, name: string): TypeSpec | undefined {