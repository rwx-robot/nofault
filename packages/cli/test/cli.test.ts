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

export class PageReq {
  @Query('page') @IsInt()
  page!: number;
}

@Api('user')
@Prefix('/api')
export class UserService {
  @Get('/ping')
  @Handler('ping')
  ping(): GreetResp { throw new Error('x'); }

  @Post('/greet')
  greet(req: GreetReq): GreetResp { throw new Error('x'); }

  @Get('/page')
  page(req: PageReq): GreetResp { throw new Error('x'); }
}
`;

describe('scaffold', () => {
  it('creates a project layout including a sample contract', () => {
    const dir = projectPath('my-service');
    const r = scaffold('my-service', { dir });
    expect(r.files).toContain('src/main.ts');
    expect(r.files).toContain('src/app.module.ts');
    expect(r.files).toContain('api/my-service.api.ts');
    expect(r.files).toContain('package.json');
    expect(existsSync(join(dir, 'tsconfig.json'))).toBe(true);
  });

  it('refuses to overwrite an existing directory', () => {
    const dir = projectPath('my-service');
    scaffold('my-service', { dir });
    writeFileSync(join(dir, 'package.json'), 'hand written\n');
    // 已存在内容时宁可失败：脚手架覆盖用户代码是不可接受的
    expect(() => scaffold('my-service', { dir })).toThrow(/already exists/);
  });

  it('kebab-cases the project name everywhere', () => {
    const dir = projectPath('UserService');
    scaffold('UserService', { dir });
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    expect(pkg.name).toBe('user-service');
    expect(pkg.scripts.generate).toContain('api/user-service.api.ts');
  });
});

describe('nofaultctl commands', () => {
  it('prints help and exits 0 with no args', () => {
    expect(run([]).exitCode).toBe(0);
    expect(run(['--help']).exitCode).toBe(0);