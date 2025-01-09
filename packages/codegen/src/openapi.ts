/**
 * 由 ApiSpec 生成 OpenAPI 3.0 文档。
 *
 * 为什么要这个：契约已经写了一遍，再手写一份 API 文档必然漂移——
 * 而**漂移的文档比没有文档更糟**，因为它会误导人。
 * 由同一份契约生成，才可能保证"文档说的就是代码做的"。
 *
 * 和生成器一样：`openApiDocument()` 是纯函数，写盘交给调用方。
 */
import type { ApiSpec, FieldSpec, RouteSpec, ServiceSpec, TypeSpec } from '@nofault/dsl';

export interface OpenApiDocument {
  openapi: '3.0.3';
  info: OpenApiInfo;
  servers: Array<{ url: string; description?: string }>;
  paths: Record<string, Record<string, OpenApiOperation>>;
  components: { schemas: Record<string, OpenApiSchema> };
  tags?: Array<{ name: string; description?: string }>;
}

export interface OpenApiInfo {
  title: string;
  version: string;
  description?: string;
}

export interface OpenApiOperation {
  operationId: string;
  summary?: string;
  tags: string[];
  parameters: OpenApiParameter[];
  requestBody?: { required: true; content: Record<string, { schema: OpenApiSchema }> };
  responses: Record<string, { description: string; content?: Record<string, { schema: OpenApiSchema }> }>;
}

export interface OpenApiParameter {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required: boolean;
  schema: OpenApiSchema;
  description?: string;
}

export interface OpenApiSchema {
  type?: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
  format?: string;
  items?: OpenApiSchema;
  properties?: Record<string, OpenApiSchema>;
  required?: string[];
  nullable?: boolean;
  enum?: string[];
}

export interface OpenApiOptions {
  title?: string;
  version?: string;
  description?: string;
  /** 服务地址。默认 `/` */
  serverUrl?: string;
}

/** 契约里的类型名 → 传输用的名字。与生成器保持一致：都用传输键 */
function propertyName(field: FieldSpec): string {
  return field.key || field.name;
}

function scalarSchema(type: string): OpenApiSchema {
  const base = type.replace(/\[\]$/, '').trim();
  switch (base) {
    case 'number':
    case 'int':
    case 'float':
      return { type: 'number' };
    case 'boolean':
      return { type: 'boolean' };
    case 'Date':
    case 'date':
      return { type: 'string', format: 'date-time' };
    default:
      return { type: 'string' };
  }
}

/** 数组类型写成 `T[]`；其余走 scalar 或 $ref */
function refOrScalar(type: string, known: Set<string>): OpenApiSchema {
  const trimmed = type.trim();
  if (trimmed.endsWith('[]')) {
    return { type: 'array', items: refOrScalar(trimmed.slice(0, -2), known) };
  }
  if (known.has(trimmed)) return { $ref: `#/components/schemas/${trimmed}` } as OpenApiSchema;
  return scalarSchema(trimmed);
}

function objectSchema(type: TypeSpec, known: Set<string>): OpenApiSchema {
  const properties: Record<string, OpenApiSchema> = {};
  const required: string[] = [];

  for (const field of type.fields) {
    const name = propertyName(field);
    properties[name] = refOrScalar(field.type, known);
    if (!field.optional) required.push(name);
  }

  return {
    type: 'object',
    properties,
    // 没有必填字段就别写 `required: []` —— 空数组在部分工具里会被当成"全部必填"
    ...(required.length > 0 ? { required } : {}),
  };
}

/** 路径参数要按来源拆出来：`:id` 走 path，其余走 query */
function parametersFor(route: RouteSpec, types: Map<string, TypeSpec>): OpenApiParameter[] {
  if (!route.requestType) return [];
  const type = types.get(route.requestType);
  if (!type) return [];

  const out: OpenApiParameter[] = [];
  for (const field of type.fields) {
    const name = propertyName(field);
    if (field.source === 'path') {
      out.push({ name, in: 'path', required: true, schema: refOrScalar(field.type, new Set()) });
    } else if (field.source === 'query') {
      out.push({
        name,
        in: 'query',
        required: !field.optional,
        schema: refOrScalar(field.type, new Set()),
      });
    }
  }
  return out;
}

function operation(
  route: RouteSpec,
  service: ServiceSpec,
  types: Map<string, TypeSpec>,
  known: Set<string>,
): OpenApiOperation {
  const method = route.method.toLowerCase();
  const hasBody = route.requestType !== undefined && method !== 'get' && method !== 'delete';

  return {
    operationId: route.handler,
    ...(route.comment ? { summary: route.comment } : {}),
    tags: [service.name],
    parameters: parametersFor(route, types),
    ...(hasBody && route.requestType
      ? {
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: `#/components/schemas/${route.requestType}` } as OpenApiSchema } },
          },
        }
      : {}),
    responses: {
      ...(route.responseType
        ? {
            '200': {
              description: 'OK',
              content: {
                'application/json': {
                  schema: refOrScalar(route.responseType, known),
                },
              },
            },
          }
        : { '204': { description: 'No Content' } }),
      '422': { description: 'Validation failed' },
    },
  };
}

export function openApiDocument(spec: ApiSpec, options: OpenApiOptions = {}): OpenApiDocument {
  const types = new Map<string, TypeSpec>(spec.types.map((t) => [t.name, t]));
  const known = new Set(types.keys());

  const paths: Record<string, Record<string, OpenApiOperation>> = {};
  for (const service of spec.services) {
    const prefix = normalizePrefix(service.prefix);
    for (const route of service.routes) {
      const full = `${prefix}/${service.group}${route.path}`.replace(/\/{2,}/g, '/');
      // OpenAPI 用 `{id}` 而不是 `:id`
      const path = full.replace(/:([A-Za-z_][\w]*)/g, '{$1}');
      (paths[path] ??= {})[route.method.toLowerCase()] = operation(route, service, types, known);
    }
  }

  const schemas: Record<string, OpenApiSchema> = {};
  for (const type of spec.types) schemas[type.name] = objectSchema(type, known);

  return {
    openapi: '3.0.3',
    info: {
      title: options.title ?? spec.name,
      version: options.version ?? '1.0.0',