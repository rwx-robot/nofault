import { describe, expect, it } from 'vitest';
import 'reflect-metadata';
import {
  Global,
  Injectable,
  Inject,
  Module,
  NofaultFactory,
  Optional,
  Scope,
  UnknownDependencyError,
  CircularDependencyError,
} from '../src/index';

describe('@nofault/core IoC container', () => {
  it('resolves a simple class provider by type', async () => {
    @Injectable()
    class Repo {
      find() {
        return ['a', 'b'];
      }
    }

    @Injectable()
    class Service {
      constructor(readonly repo: Repo) {}
    }

    @Module({ providers: [Repo, Service] })
    class AppModule {}

    const app = await NofaultFactory.createApplicationContext(AppModule, { quiet: true });
    const service = await app.get(Service);
    expect(service).toBeInstanceOf(Service);
    expect(service.repo).toBeInstanceOf(Repo);
    expect(service.repo.find()).toEqual(['a', 'b']);
  });

  it('reuses singleton instances and creates new ones for transient', async () => {
    @Injectable({ scope: Scope.TRANSIENT })
    class Transient {}

    @Injectable()
    class Singleton {}

    @Module({ providers: [Transient, Singleton] })
    class AppModule {}

    const app = await NofaultFactory.createApplicationContext(AppModule, { quiet: true });
    const s1 = await app.get(Singleton);
    const s2 = await app.get(Singleton);
    expect(s1).toBe(s2);

    const t1 = await app.get(Transient);
    const t2 = await app.get(Transient);
    expect(t1).not.toBe(t2);
  });

  it('supports value / factory / existing providers', async () => {
    const TOKEN = 'CONFIG_TOKEN';

    @Injectable()
    class Consumer {
      constructor(@Inject(TOKEN) readonly value: string) {}
    }

    @Module({
      providers: [
        { provide: TOKEN, useValue: 'hello' },
        { provide: 'DOUBLED', useFactory: () => 42 },
        { provide: 'ALIAS', useExisting: TOKEN },
        Consumer,
      ],
    })
    class AppModule {}

    const app = await NofaultFactory.createApplicationContext(AppModule, { quiet: true });
    expect(await app.get(TOKEN)).toBe('hello');
    expect(await app.get('DOUBLED')).toBe(42);
    expect(await app.get('ALIAS')).toBe('hello');
    expect((await app.get(Consumer)).value).toBe('hello');
  });

  it('injects factory dependencies declared via inject[]', async () => {
    @Injectable()
    class Dep {
      readonly n = 10;
    }

    @Module({
      providers: [
        Dep,
        {
          provide: 'SUM',
          useFactory: (dep: Dep) => dep.n + 1,
          inject: [Dep],
        },
      ],
    })
    class AppModule {}

    const app = await NofaultFactory.createApplicationContext(AppModule, { quiet: true });
    expect(await app.get('SUM')).toBe(11);
  });

  it('honours module imports / exports visibility', async () => {
    @Injectable()
    class Internal {}