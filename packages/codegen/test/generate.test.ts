import { describe, expect, it } from 'vitest';
import { FieldSource, type ApiSpec, type ServiceSpec, type TypeSpec } from '@nofault/dsl';
import { generate, validateSpec, assertValidSpec, SpecValidationError } from '../src/index';

function type(name: string, fields: TypeSpec['fields'] = [{ name: 'a', key: 'a', type: 'string', source: FieldSource.BODY, optional: false, rules: [] }]): TypeSpec {
  return { name, fields };
}

function service(partial: Partial<ServiceSpec> = {}): ServiceSpec {
  return {
    name: 'user',
    group: 'user',
    middleware: [],
    routes: [{ handler: 'ping', method: 'GET', path: '/ping' }],
    ...partial,
  };
}

function spec(services: ServiceSpec[], types: TypeSpec[] = []): ApiSpec {
  return { name: 'demo', types, services };
}

describe('validateSpec', () => {
  it('accepts a minimal valid spec', () => {
    expect(validateSpec(spec([service()]))).toHaveLength(0);
  });

  it('flags an empty spec', () => {
    const diags = validateSpec(spec([]));
    expect(diags.some((d) => d.severity === 'error' && d.message.includes('no service'))).toBe(true);
  });

  it('flags duplicate routes with the conflicting handler named', () => {
    const diags = validateSpec(
      spec([
        service({
          routes: [
            { handler: 'a', method: 'GET', path: '/x' },
            { handler: 'b', method: 'GET', path: '/x' },
          ],
        }),
      ]),
    );
    const err = diags.find((d) => d.message.includes('duplicate route'))!;
    expect(err.severity).toBe('error');
    // 报错要说清"和谁重复"，否则用户得自己找
    expect(err.message).toContain('a');
  });

  it('flags a request type that does not exist', () => {
    const diags = validateSpec(spec([service({ routes: [{ handler: 'a', method: 'POST', path: '/x', requestType: 'Nope' }] })]));
    expect(diags.some((d) => d.message.includes('unknown request type'))).toBe(true);
  });

  it('flags paths and prefixes without a leading slash', () => {
    const relative = validateSpec(spec([service({ routes: [{ handler: 'a', method: 'GET', path: 'x' }] })]));
    expect(relative.some((d) => d.message.includes('must start with'))).toBe(true);

    const badPrefix = validateSpec(spec([service({ prefix: 'v1' })]));
    expect(badPrefix.some((d) => d.message.includes('must start with'))).toBe(true);
  });

  it('flags unknown HTTP methods', () => {
    const diags = validateSpec(spec([service({ routes: [{ handler: 'a', method: 'FETCH', path: '/x' }] })]));
    expect(diags.some((d) => d.message.includes('unknown HTTP method'))).toBe(true);
  });

  it('flags duplicate type names and fields', () => {
    const diags = validateSpec(spec([service()], [type('A'), type('A')]));
    expect(diags.some((d) => d.message.includes('duplicate type name'))).toBe(true);
  });

  it('warns but does not fail on a service without routes', () => {
    const diags = validateSpec(spec([service({ routes: [] })]));
    const w = diags.find((d) => d.message.includes('no routes'))!;
    expect(w.severity).toBe('warning');
    expect(() => assertValidSpec(spec([service({ routes: [] })]))).not.toThrow();
  });

  it('throws a SpecValidationError listing every error at once', () => {
    // 一次报完所有问题，而不是修一个再报下一个 —— 契约文件通常一次错好几处
    try {
      assertValidSpec(
        spec([
          service({
            routes: [
              { handler: 'a', method: 'GET', path: 'x' },
              { handler: 'b', method: 'GET', path: '/x', requestType: 'Missing' },
            ],
          }),
        ]),
      );
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(SpecValidationError);
      expect((err as SpecValidationError).diagnostics.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('generate', () => {
  const spec_ = spec(
    [
      service({
        prefix: '/v1',
        jwt: 'Auth',
        middleware: ['Log'],
        routes: [
          { handler: 'ping', method: 'GET', path: '/ping', responseType: 'PingResp' },
          { handler: 'login', method: 'POST', path: '/login', requestType: 'LoginReq', responseType: 'LoginResp' },
        ],
      }),
    ],
    [
      { name: 'PingResp', fields: [{ name: 'msg', key: 'msg', type: 'string', source: FieldSource.BODY, optional: false, rules: ['isString'] }] },
      {
        name: 'LoginReq',
        fields: [
          { name: 'username', key: 'username', type: 'string', source: FieldSource.BODY, optional: false, rules: ['isString', 'minLength:3'] },
          { name: 'password', key: 'password', type: 'string', source: FieldSource.BODY, optional: false, rules: ['isString'] },
          { name: 'remember', key: 'remember', type: 'boolean', source: FieldSource.BODY, optional: true, rules: [] },
        ],
      },
      { name: 'LoginResp', fields: [{ name: 'token', key: 'token', type: 'string', source: FieldSource.BODY, optional: false, rules: [] }] },
    ],
  );

  it('emits one file per dto, plus controller / service / module', () => {
    const { files } = generate(spec_);
    const paths = files.map((f) => f.path).sort();
    expect(paths).toEqual([
      'dto/login-req.dto.ts',
      'dto/login-resp.dto.ts',
      'dto/ping-resp.dto.ts',
      'user/user.controller.ts',
      'user/user.module.ts',
      'user/user.service.ts',
    ]);
  });

  it('renders dto fields with validation decorators and imports', () => {
    const { files } = generate(spec_);
    const dto = files.find((f) => f.path === 'dto/login-req.dto.ts')!.content;
    expect(dto).toContain("import { IsOptional, IsString, MinLength } from '@nofault/rest';");
    expect(dto).toContain('@IsString()');
    expect(dto).toContain('@MinLength(3)');
    expect(dto).toContain('username!: string;');
    // 可选字段用 IsOptional 表达，而不是 `?:` —— 见 generate.ts propName 的注释
    expect(dto).toContain('@IsOptional()');
    expect(dto).not.toContain('remember?:');
  });

  it('routes every method to the service and keeps GET on Query', () => {
    const { files } = generate(spec_);
    const ctrl = files.find((f) => f.path === 'user/user.controller.ts')!.content;
    expect(ctrl).toContain("@Controller({ path: '/v1/user', middleware: ['Log'] })");
    expect(ctrl).toContain("@Get('/ping')");
    expect(ctrl).toContain('ping(): Promise<PingResp>');
    expect(ctrl).toContain('@Post(\'/login\')');
    // GET 也必须校验（走 query），否则分页参数是裸字符串、没有下界检查
    expect(ctrl).toContain('@Validate(LoginReq)');
    expect(ctrl).toContain('login(@Body() loginReq: LoginReq)');
    expect(ctrl).toContain('return this.service.login(loginReq);');
  });

  it('generates service methods that throw until implemented', () => {
    const { files } = generate(spec_);
    const svc = files.find((f) => f.path === 'user/user.service.ts')!.content;
    expect(svc).toContain('@Injectable()');
    expect(svc).toContain('async ping(): Promise<PingResp>');
    expect(svc).toContain("throw new Error('not implemented: ping');");
  });

  it('wires the module', () => {
    const { files } = generate(spec_);
    const mod = files.find((f) => f.path === 'user/user.module.ts')!.content;
    expect(mod).toContain('controllers: [UserController]');
    expect(mod).toContain('providers: [UserService]');
  });

  it('generates an app module on request and de-duplicates modules', () => {
    const { files } = generate(spec_, { rootModule: true });