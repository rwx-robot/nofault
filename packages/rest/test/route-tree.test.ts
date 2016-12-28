import { describe, expect, it } from 'vitest';
import { RouteTable, RouteTree, RouteConflictError } from '../src/router/route-tree';

describe('RouteTree', () => {
  it('matches static paths', () => {
    const t = new RouteTree<string>();
    t.add('/users', 'list');
    t.add('/users/new', 'new');
    expect(t.match('/users')?.handler).toBe('list');
    expect(t.match('/users/new')?.handler).toBe('new');
    expect(t.match('/users/other')).toBeUndefined();
  });

  it('compresses common prefixes (radix behaviour)', () => {
    const t = new RouteTree<string>();
    t.add('/user', 'a');
    t.add('/users', 'b');
    t.add('/userx', 'c');
    expect(t.match('/user')?.handler).toBe('a');
    expect(t.match('/users')?.handler).toBe('b');
    expect(t.match('/userx')?.handler).toBe('c');
  });

  it('extracts path params', () => {
    const t = new RouteTree<string>();
    t.add('/users/:id', 'get');
    t.add('/users/:id/posts/:postId', 'post');
    expect(t.match('/users/42')?.params).toEqual({ id: '42' });
    expect(t.match('/users/42/posts/7')?.params).toEqual({ id: '42', postId: '7' });
  });

  it('prefers static segments over params', () => {
    const t = new RouteTree<string>();
    t.add('/users/:id', 'byId');
    t.add('/users/me', 'me');
    expect(t.match('/users/me')?.handler).toBe('me');
    expect(t.match('/users/42')?.handler).toBe('byId');
  });

  it('supports wildcard segments', () => {
    const t = new RouteTree<string>();
    t.add('/static/*', 'any');
    expect(t.match('/static/a/b/c')?.handler).toBe('any');
    expect(t.match('/static/a/b/c')?.params.wildcard).toBe('a/b/c');
  });

  it('decodes url-encoded params', () => {
    const t = new RouteTree<string>();
    t.add('/search/:q', 'q');
    expect(t.match('/search/hello%20world')?.params.q).toBe('hello world');
  });

  it('throws on duplicate registration', () => {
    const t = new RouteTree<string>();
    t.add('/a', 'a');
    expect(() => t.add('/a', 'b')).toThrow(RouteConflictError);
  });

  it('throws when two different param names collide', () => {
    const t = new RouteTree<string>();
    t.add('/x/:id', 'a');
    expect(() => t.add('/x/:name', 'b')).toThrow(RouteConflictError);
  });

  it('normalizes trailing slashes', () => {
    const t = new RouteTree<string>();
    t.add('/a/', 'a');
    expect(t.match('/a')?.handler).toBe('a');
    expect(t.match('/a/')?.handler).toBe('a');
  });
});

describe('RouteTable', () => {
  it('keeps one tree per method', () => {
    const table = new RouteTable<string>();
    table.add('GET', '/users', 'list');
    table.add('POST', '/users', 'create');
    expect(table.match('GET', '/users')?.handler).toBe('list');
    expect(table.match('POST', '/users')?.handler).toBe('create');
    expect(table.match('DELETE', '/users')).toBeUndefined();
    expect(table.size).toBe(2);
  });

  it('falls back to GET for HEAD', () => {
    const table = new RouteTable<string>();
    table.add('GET', '/ping', 'pong');
    expect(table.match('HEAD', '/ping')?.handler).toBe('pong');
  });

  it('reports allowed methods for 405 responses', () => {
    const table = new RouteTable<string>();
    table.add('GET', '/users/:id', 'get');
    table.add('PUT', '/users/:id', 'put');
    expect(table.allowedMethods('/users/1')).toEqual(['GET', 'HEAD', 'PUT']);
  });

  it('lists registered routes for introspection', () => {
    const table = new RouteTable<string>();
    table.add('GET', '/b', 'b');
    table.add('GET', '/a', 'a');
    expect(table.listRoutes().map((r) => r.pattern)).toEqual(['/a', '/b']);
  });
});
