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
