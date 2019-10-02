/**
 * @nofault/cli —— nofaultctl 的程序化入口（v0.4.0）。
 *
 * `bin/nofaultctl.js` 只是一个薄壳，真正逻辑在这里，方便被其它工具调用。
 */
export { run, VERSION } from './cli';
export { parseArgs, booleanOption, stringOption } from './argv';
export type { ParsedArgs } from './argv';
export { log } from './log';
export { scaffold } from './commands/new';
export { scaffoldMcp } from './commands/mcp-new';
export type { McpNewOptions, McpNewResult } from './commands/mcp-new';
export { compileContract, generateFromSpec, generateApi } from './commands/generate';
export type { GenerateApiOptions, GenerateApiResult } from './commands/generate';
