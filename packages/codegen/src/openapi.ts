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