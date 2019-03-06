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