import { describe, expect, it } from 'vitest';
import { parseApiSource, ApiParseError } from '../src/api-parser';
import { FieldSource } from '@nofault/dsl';

const SAMPLE = `
syntax = "v1"

info (
  title: "user api"
)

type (
  LoginReq {
    Username string \`json:"username"\`
    Password string \`json:"password"\`
  }
)

type LoginResp {
  Token string \`json:"token"\`
  Name  string \`json:"name"\`
  Age   int    \`json:"age,optional"\`
}

@server (
  group:      user
  prefix:     /v1
  jwt:        Auth
  middleware: AuthInterceptor,Log
  timeout:    3s
)
service user-api {
  @handler ping
  get /ping

  @handler login
  post /user/login (LoginReq) returns (LoginResp)
}

service health-api {
  @handler health
  get /health
}
`;

describe('parseApiSource', () => {
  const spec = parseApiSource(SAMPLE, 'user.api');

  it('parses types with json tags', () => {
    const req = spec.types.find((t) => t.name === 'LoginReq')!;
    expect(req.fields).toHaveLength(2);
    expect(req.fields[0]).toMatchObject({
      name: 'Username',
      key: 'username',
      type: 'string',
      source: FieldSource.BODY,
    });