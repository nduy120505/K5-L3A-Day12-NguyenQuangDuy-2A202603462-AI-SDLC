// Ticket-04 standard benchmark scene (pure data, deterministic from the seed).
// Night 1 · 200 shades in `wander` spread evenly over the island · 100 motes · L1–L3 lit with fuel 100.
import { createRng } from './rng.js';

const ISLAND_R = 38;

function spread(rng, n, y) {
  // uniform over the disc (sqrt for even area density)
  return Array.from({ length: n }, () => {
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * ISLAND_R;
    return [Math.round(Math.cos(a) * r * 1000) / 1000, y, Math.round(Math.sin(a) * r * 1000) / 1000];
  });
}

export function benchScenario(seed = 42) {
  const rng = createRng(seed);
  return {
    player: { pos: [0, 0, 0] },
    random_motes: false,
    random_shades: false,
    random_drifters: false,
    wind_enabled: false,
    shades: spread(rng, 200, 1).map((pos, i) => ({ id: `S${i + 1}`, pos, state: 'wander' })),
    motes: spread(rng, 100, 0),
    drifters: [],
    lanterns: ['L1', 'L2', 'L3'].map((id) => ({ id, lit: true, fuel: 100 })),
  };
}

/** Camera orbit: centre (0,0,0), r = 30, Y = 15, starts at 0° = (30,15,0), CCW seen from above, 15 s per turn. */
export function benchCamera(tSeconds) {
  const a = (2 * Math.PI * tSeconds) / 15;
  return [30 * Math.cos(a), 15, 30 * Math.sin(a)];
}

/** Frame-time statistics exactly as defined by Ticket-04. dts in ms. */
export function frameStats(dts) {
  const N = dts.length;
  const sum = dts.reduce((a, b) => a + b, 0);
  const sorted = [...dts].sort((a, b) => a - b);
  const k = Math.max(1, Math.ceil(0.01 * N));
  const worst = sorted.slice(N - k);
  const p95 = sorted[Math.min(N - 1, Math.ceil(0.95 * N) - 1)];
  const r = (x, d = 1) => Math.round(x * 10 ** d) / 10 ** d;
  return {
    frames: N,
    avg_fps: r((1000 * N) / sum),
    p1_low_fps: r(1000 / (worst.reduce((a, b) => a + b, 0) / k)),
    frame_ms_p95: r(p95, 2),
  };
}
