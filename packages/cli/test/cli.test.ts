import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { run, scaffold, scaffoldMcp, generateApi, VERSION } from '../src/index';

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'nfcli-'));
}

/** 子目录一定不存在 —— scaffold 见到非空目录应当拒绝 */
function projectPath(name: string): string {
  return join(tmp(), name);
}

const CONTRACT = `
import { Api, Prefix, Get, Post, Handler, Body, Query, IsString, IsInt, MinLength } from '@nofault/dsl';

export class GreetReq {
  @Body('name') @IsString() @MinLength(1)
  name!: string;
}

export class GreetResp {
  @Body('text') @IsString()
  text!: string;
}