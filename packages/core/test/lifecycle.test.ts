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
