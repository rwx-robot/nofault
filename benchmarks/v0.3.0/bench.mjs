#!/usr/bin/env node
/**
 * v0.3.0 Benchmark
 *
 *  A. 上下文微基准（进程内）：AsyncLocalStorage 的建立与读取成本
 *  B. HTTP 端到端：nofault v0.3.0 vs 裸 node:http
 *
 * 用法：
 *   node bench.mjs [--duration=5] [--connections=32] [--warmup=1] [--rounds=3] [--report]
 */
import { request, Agent } from 'node:http';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');

function parseArgs() {
  const out = { duration: 5, connections: 32, warmup: 1, rounds: 3, report: false };
  for (const a of process.argv.slice(2)) {
    const [k, v] = a.replace(/^--/, '').split('=');
    if (k === 'report') out.report = true;
    else if (k === 'duration') out.duration = Number(v);
    else if (k === 'connections') out.connections = Number(v);
    else if (k === 'warmup') out.warmup = Number(v);
    else if (k === 'rounds') out.rounds = Number(v);
  }
  return out;
}
const opts = parseArgs();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- A. 上下文微基准
async function contextMicroBench() {
  const { RequestContext, requestContextStore } = await import(
    join(repoRoot, 'packages/context/dist/index.js')
  );

  const N = 300_000;

  // 1) 只建上下文对象
  let start = process.hrtime.bigint();
  for (let i = 0; i < N; i++) new RequestContext();
  const createMs = Number(process.hrtime.bigint() - start) / 1e6;

  // 2) 建上下文 + 进入 ALS + 读取一次
  start = process.hrtime.bigint();
  for (let i = 0; i < N; i++) {
    requestContextStore.run(new RequestContext(), () => requestContextStore.current());
  }
  const runMs = Number(process.hrtime.bigint() - start) / 1e6;

  const createOps = Math.round((N / createMs) * 1000);
  const runOps = Math.round((N / runMs) * 1000);
  const perRunUs = (runMs * 1000) / N;

  console.log(`[bench] A1. new RequestContext():        ${createOps.toLocaleString('en-US')} ops/sec`);
  console.log(`[bench] A2. ALS run + current():         ${runOps.toLocaleString('en-US')} ops/sec (${perRunUs.toFixed(3)} us/次)`);

  return { createOps, runOps, perRunUs: Number(perRunUs.toFixed(3)) };
}

// ---------------------------------------------------------------- B. HTTP 端到端
function startServer(name, script, cwd) {
  const child = spawn(process.execPath, [script], {
    cwd,
    env: { ...process.env, PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stderr.on('data', (d) => process.stderr.write(`[${name}] ${d}`));
  const port = new Promise((res, rej) => {
    const timer = setTimeout(() => rej(new Error(`${name} did not start in 30s`)), 30_000);
    child.stdout.on('data', (buf) => {
      const m = /"port":(\d+)/.exec(String(buf));
      if (m) {
        clearTimeout(timer);
        res(Number(m[1]));
      }
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      rej(new Error(`${name} exited early with code ${code}`));
    });
  });
  return { child, port };
}

function once(port, path, agents) {
  const agent = agents[Math.floor(Math.random() * agents.length)];
  return new Promise((res) => {
    const start = process.hrtime.bigint();
    const req = request({ host: '127.0.0.1', port, path, agent }, (response) => {
      response.on('data', () => {});
      response.on('end', () => res(Number(process.hrtime.bigint() - start) / 1e6));
    });
    req.on('error', () => res(-1));
    req.end();
  });
}