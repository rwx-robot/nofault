import type { IncomingMessage, ServerResponse } from 'node:http';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';

/**
 * 请求/响应包装。