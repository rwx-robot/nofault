#!/usr/bin/env node
/**
 * v0.2.0 Benchmark
 *
 * 两部分：
 *  A. 路由匹配微基准（进程内，纯 CPU）：量化 Radix 树 + 参数提取的成本
 *  B. HTTP 端到端（跨进程）：nofault v0.2.0 vs 裸 node:http
 *
 * 用法：
 *   node bench.mjs [--duration=6] [--connections=32] [--warmup=1] [--rounds=3] [--report]
 */
import { request, Agent } from 'node:http';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');

function parseArgs() {
  const out = { duration: 6, connections: 32, warmup: 1, rounds: 3, report: false };
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

// ---------------------------------------------------------------- A. 路由微基准
async function routeMicroBench() {
  // 直接用编译产物，避免再拉 TS 转译器
  const { RouteTable } = await import(join(repoRoot, 'packages/rest/dist/router/route-tree.js'));

  const table = new RouteTable();
  // 构造一张有代表性的路由表：静态 + 参数 + 深层
  table.add('GET', '/api/users', 'list');
  table.add('GET', '/api/users/count', 'count');
  table.add('GET', '/api/users/:id', 'detail');
  table.add('GET', '/api/users/:id/posts/:postId', 'post');
  table.add('POST', '/api/users', 'create');
  table.add('PUT', '/api/users/:id', 'replace');
  table.add('DELETE', '/api/users/:id', 'remove');
  table.add('GET', '/api/health', 'health');
  table.add('GET', '/api/healthz/live', 'live');
  table.add('GET', '/api/healthz/ready', 'ready');

  const paths = [
    ['GET', '/api/users'],
    ['GET', '/api/users/count'],
    ['GET', '/api/users/42'],
    ['GET', '/api/users/42/posts/7'],
    ['POST', '/api/users'],
    ['GET', '/api/health'],
    ['GET', '/api/healthz/live'],
  ];

  // warmup
  for (let i = 0; i < 50_000; i++) table.match(paths[i % paths.length][0], paths[i % paths.length][1]);

  const N = 1_000_000;
  const start = process.hrtime.bigint();
  for (let i = 0; i < N; i++) {
    const [m, p] = paths[i % paths.length];
    table.match(m, p);
  }
  const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
  const ops = Math.round((N / elapsedMs) * 1000);
  console.log(`[bench] A. route match: ${ops.toLocaleString('en-US')} ops/sec (${N.toLocaleString('en-US')} matches in ${elapsedMs.toFixed(0)} ms)`);
  return { ops, samples: N, elapsedMs: Number(elapsedMs.toFixed(1)) };
}

// ---------------------------------------------------------------- B. HTTP 端到端
async function startServer(name, script, cwd) {
  const child = spawn(process.execPath, [script], {
    cwd,
    env: { ...process.env, PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stderr.on('data', (d) => process.stderr.write(`[${name}] ${d}`));
  const port = await new Promise((res, rej) => {
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

function once(port, path, agents, method = 'GET', body) {
  const agent = agents[Math.floor(Math.random() * agents.length)];
  return new Promise((res) => {
    const start = process.hrtime.bigint();
    const req = request(
      {
        host: '127.0.0.1',
        port,
        path,
        method,
        agent,
        headers: body ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } : undefined,
      },
      (response) => {
        response.on('data', () => {});
        response.on('end', () => res(Number(process.hrtime.bigint() - start) / 1e6));
      },
    );
    req.on('error', () => res(-1));
    if (body) req.write(body);
    req.end();
  });
}

async function run(port, scenario, { duration, connections, warmup }) {
  const agents = Array.from(
    { length: Math.max(1, Math.ceil(connections / 16)) },
    () => new Agent({ keepAlive: true, maxSockets: 16, maxFreeSockets: 16 }),
  );
  const warmEnd = Date.now() + warmup * 1000;
  while (Date.now() < warmEnd) await once(port, scenario.path, agents, scenario.method, scenario.body);

  const latencies = [];
  const end = Date.now() + duration * 1000;
  const started = Date.now();
  await Promise.all(
    Array.from({ length: connections }, () => (async () => {
      while (Date.now() < end) {
        const l = await once(port, scenario.path, agents, scenario.method, scenario.body);
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
    maxMs: Number((sorted[sorted.length - 1] ?? 0).toFixed(3)),
  };
}

function pickMedianRound(rounds) {
  return [...rounds].sort((a, b) => a.rps - b.rps)[Math.floor(rounds.length / 2)];
}

const SCENARIOS = [
  { name: 'GET /api/users/1 (routing + param)', path: '/api/users/1', method: 'GET' },
  {
    name: 'POST /api/users/echo (body + validation)',
    path: '/api/users/echo',
    method: 'POST',
    body: JSON.stringify({ name: 'Bench User', email: 'bench@nofa.dev', age: 30 }),
  },
];

async function main() {
  console.log(
    `[bench] duration=${opts.duration}s connections=${opts.connections} warmup=${opts.warmup}s rounds=${opts.rounds} node=${process.version} platform=${process.platform}/${process.arch}`,
  );

  const micro = await routeMicroBench();

  const baseline = await startServer('baseline', 'baseline-server.mjs', here);
  const nofault = await startServer('nofault', 'dist/main.js', join(repoRoot, 'examples/v0.2.0-rest-user-api'));

  const results = {};
  try {
    for (const sc of SCENARIOS) {
      const baseRuns = [];
      const nfRuns = [];
      for (let r = 1; r <= opts.rounds; r++) {
        process.stdout.write(`[bench] ${sc.name} round ${r}/${opts.rounds} ... `);
        const b = await run(baseline.port, sc, opts);
        const n = await run(nofault.port, sc, opts);
        baseRuns.push(b);
        nfRuns.push(n);
        console.log(`baseline=${b.rps} rps, nofault=${n.rps} rps`);
      }
      const base = pickMedianRound(baseRuns);
      const nf = pickMedianRound(nfRuns);
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
