import { describe, expect, it } from 'vitest';
import { parseTsSource, TsParseError } from '../src/ts-parser';
import { parseContract, detectFormat } from '../src/index';
import { FieldSource } from '@nofault/dsl';

const CONTRACT = `
import { Api, Prefix, Group, Jwt, Timeout, Middleware, Get, Post, Handler } from '@nofault/dsl';