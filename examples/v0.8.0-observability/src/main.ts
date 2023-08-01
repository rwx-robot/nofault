import 'reflect-metadata';
import { Module } from '@nofault/core';
import { createLogger, LogLevel } from '@nofault/logger';
import { Controller, Get, Param, RestApplication, bodyParser, requestContext } from '@nofault/rest';
import { observability } from '@nofault/telemetry';
import { registry, tracer } from './telemetry.setup';
import { OpsController } from './ops.controller';

const logger = createLogger({ context: 'observability', level: LogLevel.INFO });
