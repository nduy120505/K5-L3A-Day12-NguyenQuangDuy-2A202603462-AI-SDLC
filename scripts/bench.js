// Benchmark (Ticket-04 §1): node scripts/bench.js --seed 42 --duration 30 --out bench.json [--headless]
// Starts the static server, opens Chromium (Playwright) in a 1280×720 window with vsync / frame-rate limit off,
// loads the standard bench scene (index.html?bench=1) and writes the frame statistics.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PROCESS_START = performance.timeOrigin; // ms epoch when this process started
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function args(argv) {
  const o = { seed: 42, duration: 30, out: 'bench.json', headless: false, port: 5174 };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--headless') { o.headless = true; continue; }
    const v = argv[++i];
    if (v === undefined) throw new Error(`missing value for ${k}`);
    if (k === '--seed') o.seed = parseInt(v, 10);
    else if (k === '--duration') o.duration = parseFloat(v);
    else if (k === '--out') o.out = v;
    else if (k === '--port') o.port = parseInt(v, 10);
    else throw new Error(`unknown argument: ${k}`);
  }
  return o;
}

async function main() {
  const o = args(process.argv.slice(2));
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    throw new Error('playwright not installed: run `npm install && npx playwright install chromium`');
  }
  const server = spawn(process.execPath, [path.join(ROOT, 'scripts/serve.js'), String(o.port)], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((res, rej) => {
    server.stdout.once('data', res);
    server.once('exit', (c) => rej(new Error(`server exited ${c}`)));
  });
  const browser = await chromium.launch({
    headless: o.headless,
    args: ['--window-size=1280,720', '--disable-gpu-vsync', '--disable-frame-rate-limit', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'],
  });
  let result;
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    await page.goto(`http://localhost:${o.port}/?bench=1&seed=${o.seed}&duration=${o.duration}`);
    await page.waitForFunction(() => window.__benchFirstFrameEpoch, null, { timeout: 60000 });
    const first = await page.evaluate(() => window.__benchFirstFrameEpoch);
    // wait without polling the page during the measured window (polling would disturb frame times)
    await new Promise((r) => setTimeout(r, (3 + o.duration) * 1000));
    const deadline = Date.now() + 30000;
    while (!(result = await page.evaluate(() => window.__benchResult))) {
      if (errors.length) throw new Error(`page error: ${errors[0]}`);
      if (Date.now() > deadline) throw new Error('benchmark did not finish');
      await new Promise((r) => setTimeout(r, 250));
    }
    const m = await cdp.send('Performance.getMetrics');
    const peakHeap = m.metrics.find((x) => x.name === 'JSHeapTotalSize')?.value ?? 0;
    result.load_ms = Math.round(first - PROCESS_START);
    result.peak_js_heap_mb = Math.round(peakHeap / 1048576); // JS heap reserved at the end of the run
  } finally {
    await browser.close();
    server.kill();
  }
  const out = {
    contract_version: '1.3',
    avg_fps: result.avg_fps,
    p1_low_fps: result.p1_low_fps,
    frame_ms_p95: result.frame_ms_p95,
    frames: result.frames,
    load_ms: result.load_ms,
    peak_mem_mb: null,
    peak_mem_note: 'Web build: process RSS of the browser is not exposed to the page; peak JS heap (CDP) reported in peak_js_heap_mb instead.',
    peak_js_heap_mb: result.peak_js_heap_mb,
    vsync_off: true,
    renderer: `${result.renderer} · Chromium (Playwright 1.48.2)${o.headless ? ' headless' : ''}`,
    os: `${os.type()} ${os.release()} ${os.arch()} · ${os.cpus()[0]?.model ?? ''} · ${Math.round(os.totalmem() / 1073741824)} GB RAM`,
    canvas: result.canvas,
    entities: result.entities,
    seed: o.seed,
    duration_s: o.duration,
  };
  fs.writeFileSync(o.out, JSON.stringify(out, null, 2) + '\n');
  console.log(JSON.stringify(out));
}

main().then(
  () => process.exit(0),
  (e) => {
    process.stderr.write(`error: ${e.message}\n`);
    process.exit(1);
  },
);
