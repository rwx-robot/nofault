/**
 * v0.8.0 端到端：每个请求一个 Span，子调用挂在同一条 trace 上，指标落到 Prometheus 文本。
 *
 * 重点验证"数据真的记对了"：
 * 1. 父子 Span 共享 traceId（能拼出调用树）
 * 2. 失败请求被记为 500（而不是默认的 200）
 * 3. Prometheus 输出能被解析（桶是累积的）
 */
import { afterAll, describe, expect, it } from 'vitest';
import 'reflect-metadata';
import { Module } from '@nofault/core';
import { Controller, Get, RestApplication } from '@nofault/rest';
import { InMemoryExporter, MetricRegistry, Tracer, observability } from '@nofault/telemetry';

const exporter = new InMemoryExporter();
const tracer = new Tracer(exporter, () => true, 1);
const registry = new MetricRegistry();

@Controller('/api')
class ApiController {
  @Get('/work')
  async work(): Promise<{ ok: true }> {
    await tracer.trace('child-work', async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    return { ok: true };
  }

  @Get('/boom')
  async boom(): Promise<never> {
    throw new Error('nope');
  }
}

@Module({ controllers: [ApiController] })
class AppModule {}

let app: RestApplication;
let base: string;

afterAll(async () => {
  await app?.close();
});

describe('observability over http', () => {
  it('creates a server span with a nested child on the same trace', async () => {