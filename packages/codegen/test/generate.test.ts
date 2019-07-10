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
