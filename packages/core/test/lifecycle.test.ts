import { describe, expect, it } from 'vitest';
import 'reflect-metadata';
import {
  Injectable,
  Module,
  NofaultFactory,
  type BeforeApplicationShutdown,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
  type OnModuleDestroy,
  type OnModuleInit,
} from '../src/index';

describe('application lifecycle hooks', () => {
  it('calls hooks in the documented order', async () => {
    const calls: string[] = [];

    @Injectable()
    class Service
      implements
        OnModuleInit,
        OnApplicationBootstrap,
        OnModuleDestroy,
        BeforeApplicationShutdown,
        OnApplicationShutdown
    {
      onModuleInit() {
        calls.push('onModuleInit');
      }
      onApplicationBootstrap() {
        calls.push('onApplicationBootstrap');
      }
      beforeApplicationShutdown(signal?: string) {
        calls.push(`beforeApplicationShutdown:${signal ?? 'none'}`);
      }
      onModuleDestroy() {
        calls.push('onModuleDestroy');
      }
      onApplicationShutdown(signal?: string) {
        calls.push(`onApplicationShutdown:${signal ?? 'none'}`);
      }
    }

    @Module({ providers: [Service] })
    class AppModule {}

    const app = await NofaultFactory.createApplicationContext(AppModule, { quiet: true });
    expect(calls).toEqual(['onModuleInit', 'onApplicationBootstrap']);

    await app.close('SIGTERM');
    expect(calls).toEqual([
      'onModuleInit',
      'onApplicationBootstrap',
      'beforeApplicationShutdown:SIGTERM',
      'onModuleDestroy',
      'onApplicationShutdown:SIGTERM',
    ]);
  });

  it('closes only once even if called repeatedly', async () => {
    let destroyCount = 0;

    @Injectable()
    class Service implements OnModuleDestroy {
      onModuleDestroy() {
        destroyCount++;
      }
    }

    @Module({ providers: [Service] })
    class AppModule {}

    const app = await NofaultFactory.createApplicationContext(AppModule, { quiet: true });
    await app.close();
    await app.close();
    expect(destroyCount).toBe(1);
  });

  it('supports async hooks', async () => {
    const order: string[] = [];

    @Injectable()
    class AsyncService implements OnModuleInit {
      async onModuleInit() {
        await new Promise((r) => setTimeout(r, 5));
        order.push('async-init');
      }
    }

    @Module({ providers: [AsyncService] })
    class AppModule {}

    await NofaultFactory.createApplicationContext(AppModule, { quiet: true });
    expect(order).toEqual(['async-init']);
  });
});
