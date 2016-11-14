#!/usr/bin/env node
/**
 * v0.1.0 Benchmark：nofault hello-kernel vs 原生 node:http 基线
 *
 * 零第三方依赖：手写并发压测器（keep-alive + 固定连接池 + 固定时长）。
 * 为避免冷启动偏差，采用**多轮交替**测量，最终取各目标的中位数轮次。
 *
 * 用法：
 *   node bench.mjs [--duration=10] [--connections=64] [--warmup=2] [--rounds=3] [--report]
 */
import { request, Agent } from 'node:http';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');

function parseArgs() {
  const out = { duration: 10, connections: 64, warmup: 2, rounds: 3, report: false };
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

/**
 * 启动一个被压测的服务进程，并从其 stdout 解析出实际端口。
 *
 * 关键：**被测服务一律独立进程**，压测器独占自己的进程，
 * 否则压测器与服务端争抢 CPU，测量值会失真。
 */
async function startServer(name, script, cwd, portPattern) {
  const child = spawn(process.execPath, [script], {
    cwd,
    env: { ...process.env, PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stderr.on('data', (d) => process.stderr.write(`[${name}] ${d}`));

  const port = await new Promise((res, rej) => {
    const timer = setTimeout(() => rej(new Error(`${name} did not start in 30s`)), 30_000);
    child.stdout.on('data', (buf) => {
      const m = portPattern.exec(String(buf));
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

function startBaseline() {
  return startServer('baseline', 'baseline-server.mjs', here, /"port":(\d+)/);
}

function startNofault() {
  return startServer('nofault', 'dist/main.js', join(repoRoot, 'examples', 'v0.1.0-hello-kernel'), /"port":(\d+)/);
}

// ---------------------------------------------------------------- 压测器
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

async function run(port, { duration, connections, warmup }) {
  const agents = Array.from(
    { length: Math.max(1, Math.ceil(connections / 16)) },
    () => new Agent({ keepAlive: true, maxSockets: 16, maxFreeSockets: 16 }),
  );

  const warmEnd = Date.now() + warmup * 1000;
  while (Date.now() < warmEnd) await once(port, '/hello?name=world', agents);

  const latencies = [];
  const end = Date.now() + duration * 1000;
  const started = Date.now();
  await Promise.all(
    Array.from({ length: connections }, () => (async () => {
      while (Date.now() < end) {
        const l = await once(port, '/hello?name=world', agents);
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
    seconds: Number(elapsedSec.toFixed(2)),
    rps: Number((sorted.length / elapsedSec).toFixed(1)),
    meanMs: Number((total / Math.max(1, sorted.length)).toFixed(3)),
    p50Ms: Number(q(0.5).toFixed(3)),
    p95Ms: Number(q(0.95).toFixed(3)),
    p99Ms: Number(q(0.99).toFixed(3)),
    maxMs: Number((sorted[sorted.length - 1] ?? 0).toFixed(3)),
  };
}

/** 取 RPS 居中的那一轮，避免取到冷启动或噪声轮 */
function pickMedianRound(rounds) {
  const sorted = [...rounds].sort((a, b) => a.rps - b.rps);
  return sorted[Math.floor(sorted.length / 2)];
}

// ---------------------------------------------------------------- main
async function main() {
  console.log(
    `[bench] duration=${opts.duration}s connections=${opts.connections} warmup=${opts.warmup}s rounds=${opts.rounds} node=${process.version} platform=${process.platform}/${process.arch}`,
  );

  const baseline = await startBaseline();
  const nofault = await startNofault();
  try {
    const baseRuns = [];
    const nfRuns = [];
    for (let r = 1; r <= opts.rounds; r++) {
      process.stdout.write(`[bench] round ${r}/${opts.rounds} ... `);
      const base = await run(baseline.port, opts);
      const nf = await run(nofault.port, opts);
      baseRuns.push(base);
      nfRuns.push(nf);
      console.log(`baseline=${base.rps} rps, nofault=${nf.rps} rps`);
    }

    const base = pickMedianRound(baseRuns);
    const nf = pickMedianRound(nfRuns);
    const gap = (((base.rps - nf.rps) / base.rps) * 100).toFixed(1);

    console.table({
      'raw node:http (baseline)': {
        rps: base.rps,
        mean: base.meanMs,
        p50: base.p50Ms,
        p95: base.p95Ms,
        p99: base.p99Ms,
        max: base.maxMs,
      },
      'nofault v0.1.0': {
        rps: nf.rps,
        mean: nf.meanMs,
        p50: nf.p50Ms,
        p95: nf.p95Ms,
        p99: nf.p99Ms,
        max: nf.maxMs,
      },
    });
    console.log(`[bench] throughput gap vs baseline: ${gap}% (正数表示 nofault 更慢)`);
    console.log(`[bench] rps baseline rounds: [${baseRuns.map((r) => r.rps).join(', ')}]`);
    console.log(`[bench] rps nofault  rounds: [${nfRuns.map((r) => r.rps).join(', ')}]`);

    if (opts.report) {
      writeFileSync(
        join(here, 'results.json'),
        JSON.stringify(
          { opts, baseline: base, nofault: nf, rounds: { baseline: baseRuns, nofault: nfRuns }, gapPercent: Number(gap) },
          null,
          2,
        ),
      );
      console.log('[bench] wrote results.json');
    }
  } finally {
    nofault.child.kill('SIGTERM');
    baseline.child.kill('SIGTERM');
  }
}

await main();
