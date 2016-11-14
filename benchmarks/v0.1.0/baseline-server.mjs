#!/usr/bin/env node
/**
 * 基线服务：纯 `node:http`，无任何框架。
 *
 * **必须独立进程运行**——如果和压测器跑在同一个进程里，
 * 压测器会和服务端抢 CPU，基线数据会显著偏低，结论不可信。
 */
import { createServer } from 'node:http';

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  if (url.pathname === '/hello') {
    const name = url.searchParams.get('name');
    const body = JSON.stringify({