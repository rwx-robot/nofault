/**
 * @nofault/parser —— 契约解析器（v0.4.0）。
 *
 * 两种输入 → 同一个 `ApiSpec`：
 * - `parseApiSource()` 解析 `.api` 文本 DSL
 * - `parseTsSource()`  解析 TypeScript 契约文件（`.api.ts`）
 *
 * 两者都**不执行用户代码**，只是词法 + 递归下降，安全且快。
 */
export { Scanner, ScannerError } from './scanner';
export type { Token } from './scanner';
export { TokenType } from './scanner';

export { parseApiSource, ApiParseError } from './api-parser';
export { parseTsSource, TsParseError } from './ts-parser';

export { parseContract, parseContractFile, detectFormat } from './parse-contract';
export type { ContractFormat } from './parse-contract';
