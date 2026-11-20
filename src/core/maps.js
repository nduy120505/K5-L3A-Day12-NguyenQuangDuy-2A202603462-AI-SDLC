// Standard maps (Ticket-02, Part 2). Angles: from +X, counter-clockwise seen from above,
// i.e. point = (r·cosθ, y, r·sinθ). Pure data + terrain queries, no DOM.
const DEG = Math.PI / 180;
const ring = (n, r, startDeg, stepDeg, y = 0, cx = 0, cz = 0) =>
  Array.from({ length: n }, (_, i) => {
    const a = (startDeg + i * stepDeg) * DEG;
    return [round(cx + r * Math.cos(a)), y, round(cz + r * Math.sin(a))];
  });
const round = (x) => Math.round(x * 1e6) / 1e6;

export const FALL_Y = -10;
export const STEP_UP = 0.35; // max height the feet can climb per tick (ramps); cliffs are walls

const night1 = {
  night: 1,
  name: 'Đảo Bến',
  duration_key: 'night1_duration_s',
  start: [0, 0, 0],
  lanterns: [[0, 0, 25], [23.8, 0, 7.7], [14.7, 0, -20.2], [-14.7, 0, -20.2], [-23.8, 0, 7.7]],
  motePoints: [...ring(8, 12, 0, 45), ...ring(16, 33, 0, 22.5)],
  shadePoints: ring(12, 37, 15, 30, 1),
  shadeInterval: 480,
  shadeMax: 6,
  shadeSpeed: 4.0,
  drifters: false,
  charms: [],
  jumpPads: [],
  wind: false,
  ground(x, z) {
    return Math.hypot(x, z) <= 40 ? 0 : null;
  },
  obstacles: [],
  bounds: { cx: 0, cz: 0, r: 40 },
};

const night2 = {
  night: 2,
  name: 'Đảo Cau',
  duration_key: 'night2_duration_s',
  start: [0, 0, 0],
  lanterns: [[0, 0, 20], [17, 0, -10], [-17, 0, -10], [70, 0, 20], [87, 0, -10], [53, 0, -10]],
  motePoints: [
    ...ring(4, 10, 0, 90), ...ring(8, 22, 0, 45),
    ...ring(4, 10, 0, 90, 0, 70, 0), ...ring(8, 22, 0, 45, 0, 70, 0),
  ],
  shadePoints: [...ring(8, 26, 22.5, 45, 1), ...ring(8, 26, 22.5, 45, 1, 70, 0)],
  shadeInterval: 420,
  shadeMax: 8,
  shadeSpeed: 4.0,
  drifters: true,
  charms: [{ id: 'C1', pos: [35, 0, 0] }],
  jumpPads: [
    { pos: [20, 0, 18], vy: 14, speed: 24, toward: [70, 0, 0] },
    { pos: [50, 0, -18], vy: 14, speed: 24, toward: [0, 0, 0] },
  ],
  wind: false,
  ground(x, z) {
    if (Math.hypot(x, z) <= 28 || Math.hypot(x - 70, z) <= 28) return 0;
    if (x >= 26 && x <= 44 && z >= -2 && z <= 2) return 0;
    return null;
  },
  obstacles: [],
  bounds: { cx: 35, cz: 0, r: 63 },
};

const RAMPS = [30, 150].map((d) => [Math.cos(d * DEG), Math.sin(d * DEG)]);
const night3 = {
  night: 3,
  name: 'Đảo Chuông',
  duration_key: 'night3_duration_s',
  start: [0, 0, -30], // (0,0,0) is inside the bell tower → assumption, see docs/notes
  lanterns: [[0, 6, 6], [18, 3, 10], [-18, 3, 10], [35, 0, -10], [-35, 0, -10], [20, 0, -35], [-20, 0, -35]],
  motePoints: [...ring(18, 34, 0, 20), ...ring(8, 18, 20, 20, 3), ...ring(4, 5, 45, 90, 6)],
  shadePoints: ring(16, 43, 0, 22.5, 1),
  shadeInterval: 360,
  shadeMax: 10,
  shadeSpeed: 4.5,
  drifters: true,
  charms: [{ id: 'C1', pos: [30, 0, 25] }, { id: 'C2', pos: [-30, 0, 25] }],
  jumpPads: [{ pos: [0, 3, 13], vy: 12, speed: 8, dir: [0, -1] }],
  wind: true,
  ground(x, z) {
    const r = Math.hypot(x, z);
    if (r > 45) return null;
    if (r <= 8) return 6;
    if (z > 0 && r >= 12 && r <= 24) return 3;
    let h = 0;
    for (const [ux, uz] of RAMPS) {
      const along = x * ux + z * uz;
      const perp = Math.abs(x * uz - z * ux);
      if (perp <= 1.5 && along >= 24 && along <= 30) h = Math.max(h, (3 * (30 - along)) / 6);
    }
    return h;
  },
  // bell tower: cylinder r=2 at centre, from Y=6 to Y=14
  obstacles: [{ x: 0, z: 0, r: 2, top: 14 }],
  bounds: { cx: 0, cz: 0, r: 45 },
};

export const MAPS = { 1: night1, 2: night2, 3: night3 };
