import { describe, expect, it } from 'vitest';
import { parseTsSource, TsParseError } from '../src/ts-parser';
import { parseContract, detectFormat } from '../src/index';
import { FieldSource } from '@nofault/dsl';

const CONTRACT = `
import { Api, Prefix, Group, Jwt, Timeout, Middleware, Get, Post, Handler } from '@nofault/dsl';
import { Body, IsString, MinLength, IsEmail, Optional, MaxLength } from '@nofault/dsl';

export class LoginReq {
  @Body('username') @IsString() @MinLength(3) @MaxLength(32)
  username!: string;

  @Body('password') @IsString() @MinLength(8)
  password!: string;
}

export class LoginResp {
  @Body('token') @IsString()
  token!: string;

  @Body('name') @IsString() @Optional()
  name?: string;
}

export class PageReq {
  @Query('page') @IsInt()
  page!: number;
}

@Api('user')
@Prefix('/v1')
@Group('user')
@Jwt('Auth')
@Middleware('AuthInterceptor', 'Log')
@Timeout('3s')
export class UserService {
  @Get('/ping')
  @Handler('ping')
  ping(): void {}

  @Post('/login')
  login(req: LoginReq): LoginResp {
    throw new Error('not implemented');
  }

  @Get('/list')
  list(req: PageReq): LoginResp[] {
    throw new Error('not implemented');
  }
}
`;

describe('parseTsSource', () => {
  const spec = parseTsSource(CONTRACT, 'user.api.ts');

  it('derives the spec name from the file name', () => {
    expect(spec.name).toBe('user');
  });

  it('collects DTO classes as types (not services)', () => {
    const names = spec.types.map((t) => t.name).sort();
    expect(names).toEqual(['LoginReq', 'LoginResp', 'PageReq']);
  });

  it('parses fields with source, key and rules', () => {
    const req = spec.types.find((t) => t.name === 'LoginReq')!;
    expect(req.fields).toHaveLength(2);

    expect(req.fields[0]).toMatchObject({
      name: 'username',
      key: 'username',
      type: 'string',
      source: FieldSource.BODY,
    });
    expect(req.fields[0]!.rules).toEqual(['isString', 'minLength:3', 'maxLength:32']);
  });

  it('honours explicit keys that differ from the property name', () => {
    const page = spec.types.find((t) => t.name === 'PageReq')!;
    expect(page.fields[0]).toMatchObject({ source: FieldSource.QUERY, key: 'page', type: 'number' });
    expect(page.fields[0]!.rules).toContain('isInt');
  });

  it('marks @Optional() properties optional', () => {
    const resp = spec.types.find((t) => t.name === 'LoginResp')!;
    expect(resp.fields.find((f) => f.name === 'name')!.optional).toBe(true);
    expect(resp.fields.find((f) => f.name === 'token')!.optional).toBe(false);
  });

  it('parses service-level decorators', () => {
    const svc = spec.services[0]!;
    expect(svc).toMatchObject({
      name: 'user',
      prefix: '/v1',
      group: 'user',
      jwt: 'Auth',
      timeout: '3s',
    });
    expect(svc.middleware).toEqual(['AuthInterceptor', 'Log']);
  });

  it('parses routes including handler override and array return types', () => {
    const svc = spec.services[0]!;
    expect(svc.routes).toHaveLength(3);

    expect(svc.routes[0]).toMatchObject({ handler: 'ping', method: 'GET', path: '/ping' });

    const login = svc.routes[1]!;
    expect(login).toMatchObject({
      handler: 'login',
      method: 'POST',
      path: '/login',
      requestType: 'LoginReq',
      responseType: 'LoginResp',
    });

    const list = svc.routes[2]!;
    expect(list).toMatchObject({ handler: 'list', method: 'GET', path: '/list', requestType: 'PageReq' });
    expect(list.responseType).toContain('LoginResp');
  });

  it('ignores import statements and comments', () => {
    const src = `
      // a comment
      import { Api, Get } from '@nofault/dsl';   /* block */
      @Api('x')
      export class XService {
        @Get('/y')
        y(): void {}