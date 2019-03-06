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