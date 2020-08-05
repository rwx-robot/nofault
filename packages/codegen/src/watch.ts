/**
 * 契约文件监听（v0.5.0）。
 *
 * 编辑器保存文件往往触发**多次** change，还可能先写临时文件再 rename，
 * 所以这里做了两件事：
 * 1. 防抖：短时间内的多次事件只触发一次重新生成
 * 2. 只认真正的内容变化（内容没变就不重复生成，避免无意义的输出）
 */
import { watch } from 'node:fs';

export interface WatchOptions {