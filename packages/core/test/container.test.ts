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

    @Injectable()
    class Public {}

    @Module({ providers: [Internal, Public], exports: [Public] })
    class LibModule {}

    @Module({ imports: [LibModule] })
    class AppModule {}

    const app = await NofaultFactory.createApplicationContext(AppModule, { quiet: true });
    expect(await app.get(Public)).toBeInstanceOf(Public);
    // `app.get()` 是全局查找（调试便利），可见性约束用 `select(module)` 表达
    expect(await app.get(Internal)).toBeInstanceOf(Internal);
    await expect(app.select(AppModule).get(Internal)).rejects.toThrow();
  });

  it('resolves providers from global modules without explicit import', async () => {
    @Injectable()
    class GlobalService {}

    @Global()
    @Module({ providers: [GlobalService], exports: [GlobalService] })
    class CoreModule {}

    @Module({ imports: [CoreModule] })
    class FeatureModule {}

    @Module({ imports: [FeatureModule] })
    class AppModule {}

    const app = await NofaultFactory.createApplicationContext(AppModule, { quiet: true });
    expect(await app.get(GlobalService)).toBeInstanceOf(GlobalService);
  });

  it('injects undefined for optional dependencies that are missing', async () => {
    @Injectable()
    class WithOptional {
      constructor(@Optional() readonly missing: unknown) {}
    }

    @Module({ providers: [WithOptional] })
    class AppModule {}

    const app = await NofaultFactory.createApplicationContext(AppModule, { quiet: true });
    expect((await app.get(WithOptional)).missing).toBeUndefined();
  });

  it('throws UnknownDependencyError with a helpful message', async () => {
    @Injectable()
    class Missing {}

    @Injectable()
    class NeedsMissing {
      constructor(readonly m: Missing) {}
    }

    @Module({ providers: [NeedsMissing] })
    class AppModule {}

    await expect(
      NofaultFactory.createApplicationContext(AppModule, { quiet: true }),
    ).rejects.toThrow(UnknownDependencyError);
  });

  it('detects circular dependencies instead of hanging or stack-overflowing', async () => {
    @Injectable()
    class NodeA {
      constructor(@Inject('CB') readonly b: unknown) {}
    }

    @Injectable()
    class NodeB {
      constructor(@Inject('CA') readonly a: unknown) {}
    }

    @Module({
      providers: [
        { provide: 'CA', useClass: NodeA },
        { provide: 'CB', useClass: NodeB },
      ],
    })
    class AppModule {}

    await expect(
      NofaultFactory.createApplicationContext(AppModule, { quiet: true }),
    ).rejects.toThrow(CircularDependencyError);
  });

  it('supports property injection', async () => {
    @Injectable()
    class Dep2 {
      readonly id = 'dep2';
    }

    @Injectable()
    class Holder {
      @Inject(Dep2) readonly dep!: Dep2;
    }

    @Module({ providers: [Dep2, Holder] })
    class AppModule {}

    const app = await NofaultFactory.createApplicationContext(AppModule, { quiet: true });
    expect((await app.get(Holder)).dep.id).toBe('dep2');
  });
});
