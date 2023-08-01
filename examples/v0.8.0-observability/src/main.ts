import 'reflect-metadata';
import { Module } from '@nofault/core';
import { createLogger, LogLevel } from '@nofault/logger';
import { Controller, Get, Param, RestApplication, bodyParser, requestContext } from '@nofault/rest';
import { observability } from '@nofault/telemetry';
import { registry, tracer } from './telemetry.setup';
import { OpsController } from './ops.controller';

const logger = createLogger({ context: 'observability', level: LogLevel.INFO });

@Controller('/api')
class DemoController {
  @Get('/work/:ms')
  async work(@Param('ms') ms: number): Promise<{ waited: number }> {
    const delay = Math.min(2000, Math.max(0, Number(ms) || 0));
    // 子 Span：一次业务操作内部还能再拆
    await tracer.trace('simulated-work', async (span) => {
      span?.setAttributes({ delayMs: delay });
      await new Promise((resolve) => setTimeout(resolve, delay));