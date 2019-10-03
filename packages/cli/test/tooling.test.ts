/**
 * v0.10.0 工具链测试。
 *
 * 重点在"生成物对不对"而不是"函数有没有抛错"：
 * - OpenAPI 的路径参数是否转成 `{id}`（写成 `:id` 工具就解析不了）
 * - 必填字段是否进 required，没有必填时是否**省略**该键（空数组语义相反）
 * - doctor 能否识别出"装饰器元数据没开"这个最常见的坑
 */
import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FieldSource, type ApiSpec, type RouteSpec, type ServiceSpec, type TypeSpec } from '@nofault/dsl';
import { openApiDocument } from '@nofault/codegen';
import { doctor } from '../src/commands/doctor';

function field(name: string, type: string, source: FieldSource = FieldSource.BODY, optional = false) {
  return { name, key: name, type, source, optional, rules: [] };
}

function service(routes: RouteSpec[], overrides: Partial<ServiceSpec> = {}): ServiceSpec {
  return { name: 'user-api', group: 'user', prefix: '/api', middleware: [], routes, ...overrides };
}

function spec(services: ServiceSpec[], types: TypeSpec[]): ApiSpec {
  return { name: 'demo', types, services };
}

const User: TypeSpec = {
  name: 'User',
  fields: [field('id', 'number'), field('name', 'string'), field('bio', 'string', FieldSource.BODY, true)],
};

const GetUserReq: TypeSpec = {
  name: 'GetUserReq',
  fields: [field('id', 'number', FieldSource.PATH), field('verbose', 'boolean', FieldSource.QUERY, true)],
};