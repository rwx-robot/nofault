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