import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import type { Middleware } from '../pipeline';
import { RestContext } from '../http/context';
import { BadRequestException, NotFoundException } from '../errors/http-exception';

/**