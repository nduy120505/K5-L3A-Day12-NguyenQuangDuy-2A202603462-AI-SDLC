// Soak test (Ticket-04 §2): node --expose-gc scripts/soak.js --seed 7 --nights 10 --out soak.json
// Runs N nights back-to-back in ONE process (night 1→2→3 cycling), night i uses seed (seed + i), i = 1..N.
// Seeded random input: new move direction every 30 ticks; per tick 5 % jump, 3 % dash, 2 % pulse, 10 % interact.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Game, emptyInput, TICK_RATE } from '../src/core/game.js';
import { createRng } from '../src/core/rng.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function args(argv) {
  const o = { seed: 7, nights: 10, out: 'soak.json' };
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i], v = argv[i + 1];
    if (v === undefined) throw new Error(`missing value for ${k}`);
    if (k === '--seed') o.seed = parseInt(v, 10);
    else if (k === '--nights') o.nights = parseInt(v, 10);
    else if (k === '--out') o.out = v;
    else throw new Error(`unknown argument: ${k}`);
  }
  if (!Number.isInteger(o.seed) || !Number.isInteger(o.nights) || o.nights < 1) throw new Error('bad --seed/--nights');
  return o;
}

// Same procedure at start and end: full GC ×3 with yields so V8 can release freed pages, then read RSS.
const rssMb = async () => {
  for (let i = 0; i < 3; i++) {
    if (global.gc) global.gc();
    await new Promise((r) => setTimeout(r, 30));
  }
  return Math.round((process.memoryUsage().rss / 1048576) * 10) / 10;
};

function playNight(tuning, night, seed) {
  const game = new Game(tuning, { seed, night });
  const rng = createRng(seed ^ 0x5eed);
  const input = emptyInput();
  const maxTicks = tuning[`night${night}_duration_s`] * TICK_RATE;
  for (let k = 0; k < maxTicks && game.state === 'playing'; k++) {
    if (k % 30 === 0) {
      const a = rng() * Math.PI * 2;
      input.move = [Math.cos(a), Math.sin(a)];
      input.cam_yaw_deg = 0;
    }
    input.jump = rng() < 0.05;
    input.dash = rng() < 0.03;
    input.pulse = rng() < 0.02;
    input.interact = rng() < 0.1;
    game.step(input);
  }
  return game;
}

async function main() {
  const o = args(process.argv.slice(2));
  const tuning = JSON.parse(fs.readFileSync(path.join(ROOT, 'game.contract.json'), 'utf8')).tuning;
  const t0 = performance.now();
  const results = [];
  let crashes = 0;
  let memStart = null;
  for (let i = 1; i <= o.nights; i++) {
    const night = ((i - 1) % 3) + 1;
    try {
      if (i === 1) {
        // mem_start: RSS right after the first night is loaded
        new Game(tuning, { seed: o.seed + i, night });
        memStart = await rssMb();
      }
      let g = playNight(tuning, night, o.seed + i);
      results.push(g.state === 'playing' ? 'timeout' : g.state);
      g = null; // reset: drop the night
    } catch (e) {
      crashes++;
      results.push('crash');
      process.stderr.write(`night ${i} crashed: ${e.stack}\n`);
    }
  }
  const memEnd = await rssMb();
  const out = {
    nights: o.nights,
    crashes,
    results,
    mem_start_mb: memStart,
    mem_end_mb: memEnd,
    duration_s: Math.round((performance.now() - t0) / 100) / 10,
    seed: o.seed,
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
  };
  fs.writeFileSync(o.out, JSON.stringify(out, null, 2) + '\n');
  console.log(JSON.stringify(out));
  process.exit(crashes === 0 ? 0 : 1);
}

main().catch((e) => {
  process.stderr.write(`error: ${e.message}\n`);
  process.exit(1);
});
