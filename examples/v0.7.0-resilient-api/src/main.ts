import 'reflect-metadata';
import { Module } from '@nofault/core';
import { createLogger, LogLevel } from '@nofault/logger';
import { RestApplication, bodyParser, requestContext } from '@nofault/rest';
import { rateLimit, bulkhead } from '@nofault/resilience';
import { FaultyController, dependency } from './faulty.controller';
