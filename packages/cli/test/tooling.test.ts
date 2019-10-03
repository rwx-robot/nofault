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

describe('openapi generation', () => {
  const doc = openApiDocument(
    spec(
      [
        service([
          { handler: 'getUser', method: 'GET', path: '/users/:id', requestType: 'GetUserReq', responseType: 'User' },
          { handler: 'createUser', method: 'POST', path: '/users', requestType: 'User', responseType: 'User' },
          { handler: 'deleteUser', method: 'DELETE', path: '/users/:id', requestType: 'GetUserReq' },
        ]),
      ],
      [User, GetUserReq],
    ),
    { title: 'Demo API', version: '2.1.0' },
  );

  it('renders path params with braces, not colons', () => {
    // `:id` 在 OpenAPI 里是非法的；Swagger UI / codegen 都会解析失败
    expect(Object.keys(doc.paths)).toContain('/api/user/users/{id}');
    expect(Object.keys(doc.paths)).not.toContain('/api/user/users/:id');
  });

  it('marks path params as required and in:path', () => {
    const operation = doc.paths['/api/user/users/{id}']!.get!;
    const id = operation.parameters.find((p) => p.name === 'id');
    expect(id).toMatchObject({ in: 'path', required: true, schema: { type: 'number' } });
  });

  it('splits query params out of the body', () => {
    const operation = doc.paths['/api/user/users/{id}']!.get!;
    const verbose = operation.parameters.find((p) => p.name === 'verbose');
    expect(verbose).toMatchObject({ in: 'query', required: false, schema: { type: 'boolean' } });
    // GET 不该有 requestBody
    expect(operation.requestBody).toBeUndefined();
  });

  it('puts required fields in required and omits the key when nothing is required', () => {
    const user = doc.components.schemas.User!;
    expect(user.required).toEqual(['id', 'name']);
    expect(user.properties!).toHaveProperty('bio');

    const optionalOnly: TypeSpec = {
      name: 'Loose',
      fields: [field('a', 'string', FieldSource.BODY, true)],
    };
    const looseDoc = openApiDocument(spec([], [optionalOnly]));
    // 空 required 数组在部分工具里会被当成"全部必填"，所以整个键要省掉
    expect(looseDoc.components.schemas.Loose!.required).toBeUndefined();
  });

  it('references known types and inlines arrays of them', () => {
    const listDoc = openApiDocument(
      spec(
        [service([{ handler: 'list', method: 'GET', path: '/users', responseType: 'User[]' }])],
        [User],
      ),
    );
    const schema = listDoc.paths['/api/user/users']!.get!.responses['200']!.content![
      'application/json'
    ]!.schema;
    expect(schema).toEqual({ type: 'array', items: { $ref: '#/components/schemas/User' } });
  });

  it('uses 204 for void responses and always documents 422', () => {
    const operation = doc.paths['/api/user/users/{id}']!.delete!;
    expect(operation.responses['204']).toEqual({ description: 'No Content' });
    expect(operation.responses['422']).toBeDefined();
  });

  it('carries the info block through', () => {
    expect(doc.openapi).toBe('3.0.3');
    expect(doc.info).toEqual({ title: 'Demo API', version: '2.1.0' });
  });
});

describe('doctor', () => {
  function project(files: Record<string, string>, deps: string[] = []): string {
    const dir = mkdtempSync(join(tmpdir(), 'nf-doctor-'));
    for (const [name, content] of Object.entries(files)) {
      const path = join(dir, name);
      mkdirSync(join(path, '..'), { recursive: true });
      writeFileSync(path, content);
    }
    for (const dep of deps) mkdirSync(join(dir, 'node_modules', dep), { recursive: true });
    return dir;
  }

  it('fails when decorator metadata is off', () => {
    // 这是本项目最常见的一类"跑不起来"：@Inject / @Column 拿不到类型，
    // 而报错信息完全指不到 tsconfig
    const dir = project({
      'package.json': JSON.stringify({ type: 'module' }),
      'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2022' } }),
      'src/main.ts': '',
    });
    const report = doctor(dir);
    const check = report.checks.find((c) => c.name === 'emitDecoratorMetadata');
    expect(check?.status).toBe('fail');
    expect(check?.hint).toContain('emitDecoratorMetadata');
    expect(report.ok).toBe(false);
  });

  it('passes a correctly configured project', () => {
    const dir = project({
      'package.json': JSON.stringify({ type: 'module' }),
      'tsconfig.json': JSON.stringify({
        // 故意带注释：tsconfig 允许注释，解析器必须容错
        compilerOptions: {
          /* 装饰器元数据 */