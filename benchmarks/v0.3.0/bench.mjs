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

async function run(port, path, { duration, connections, warmup }) {
  const agents = Array.from(
    { length: Math.max(1, Math.ceil(connections / 16)) },
    () => new Agent({ keepAlive: true, maxSockets: 16, maxFreeSockets: 16 }),
  );
  const warmEnd = Date.now() + warmup * 1000;
  while (Date.now() < warmEnd) await once(port, path, agents);

  const latencies = [];
  const end = Date.now() + duration * 1000;
  const started = Date.now();
  await Promise.all(
    Array.from({ length: connections }, () => (async () => {
      while (Date.now() < end) {
        const l = await once(port, path, agents);
        if (l >= 0) latencies.push(l);
      }
    })()),
  );
  const elapsed = (Date.now() - started) / 1000;
  for (const a of agents) a.destroy();
  return summarize(latencies, elapsed);
}

function summarize(latencies, elapsedSec) {
  const sorted = [...latencies].sort((a, b) => a - b);
  const q = (p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : 0);
  const total = sorted.reduce((s, v) => s + v, 0);
  return {
    requests: sorted.length,
    rps: Number((sorted.length / elapsedSec).toFixed(1)),
    meanMs: Number((total / Math.max(1, sorted.length)).toFixed(3)),
    p50Ms: Number(q(0.5).toFixed(3)),
    p95Ms: Number(q(0.95).toFixed(3)),
    p99Ms: Number(q(0.99).toFixed(3)),
  };
}

const median = (rounds) => [...rounds].sort((a, b) => a.rps - b.rps)[Math.floor(rounds.length / 2)];

const SCENARIOS = [
  { name: 'GET config (路由+上下文)', path: '/api/runtime/config' },
  { name: 'GET context (上下文+REQUEST作用域)', path: '/api/runtime/context' },
];

async function main() {
  console.log(
    `[bench] duration=${opts.duration}s connections=${opts.connections} warmup=${opts.warmup}s rounds=${opts.rounds} node=${process.version} platform=${process.platform}/${process.arch}`,
  );

  const micro = await contextMicroBench();

  const baseline = startServer('baseline', 'baseline-server.mjs', here);
  const nofault = startServer('nofault', 'dist/main.js', join(repoRoot, 'examples/v0.3.0-runtime-basics'));

  const results = {};
  try {
    const [basePort, nfPort] = await Promise.all([baseline.port, nofault.port]);
    // 等就绪探针通过再压，避免把启动过程算进去
    for (let i = 0; i < 50; i++) {
      const r = await fetch(`http://127.0.0.1:${nfPort}/readyz`).catch(() => null);
      if (r && r.ok) break;
      await sleep(100);
    }

    for (const sc of SCENARIOS) {
      const baseRuns = [];
      const nfRuns = [];
      for (let r = 1; r <= opts.rounds; r++) {
        process.stdout.write(`[bench] ${sc.name} round ${r}/${opts.rounds} ... `);
        const b = await run(basePort, sc.path, opts);
        const n = await run(nfPort, sc.path, opts);
        baseRuns.push(b);
        nfRuns.push(n);
        console.log(`baseline=${b.rps} rps, nofault=${n.rps} rps`);
      }
      const base = median(baseRuns);
      const nf = median(nfRuns);
      const gap = (((base.rps - nf.rps) / base.rps) * 100).toFixed(1);
      results[sc.name] = { baseline: base, nofault: nf, gapPercent: Number(gap) };
      console.table({
        [`baseline · ${sc.name}`]: { rps: base.rps, mean: base.meanMs, p50: base.p50Ms, p95: base.p95Ms, p99: base.p99Ms },
        [`nofault · ${sc.name}`]: { rps: nf.rps, mean: nf.meanMs, p50: nf.p50Ms, p95: nf.p95Ms, p99: nf.p99Ms },
      });
      console.log(`[bench] gap for "${sc.name}": ${gap}% (正数表示 nofault 更慢)`);
    }
  } finally {
    nofault.child.kill('SIGTERM');
    baseline.child.kill('SIGTERM');
  }

  if (opts.report) {
    writeFileSync(join(here, 'results.json'), JSON.stringify({ opts, micro, results }, null, 2));
    console.log('[bench] wrote results.json');
  }
}

await main();
