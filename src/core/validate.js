// Validation of inputs / scenario files (Test Contract v1.0, sections C & D).
// Throws FormatError on malformed data → headless exits with code 2.
export class FormatError extends Error {}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isVec3 = (v) => Array.isArray(v) && v.length === 3 && v.every(isNum);
const fail = (msg) => {
  throw new FormatError(msg);
};

export function validateInputs(data) {
  if (!isObj(data) || !Array.isArray(data.frames)) fail('inputs: expected object with "frames" array');
  let last = -1;
  data.frames.forEach((f, i) => {
    if (!isObj(f)) fail(`inputs.frames[${i}]: not an object`);
    if (!Number.isInteger(f.tick) || f.tick < 0) fail(`inputs.frames[${i}].tick: must be integer >= 0`);
    if (f.tick <= last) fail(`inputs.frames[${i}].tick: ticks must be strictly increasing`);
    last = f.tick;
    if (f.move !== undefined) {
      if (!Array.isArray(f.move) || f.move.length !== 2 || !f.move.every((x) => isNum(x) && x >= -1 && x <= 1))
        fail(`inputs.frames[${i}].move: must be [x, z] with values in [-1, 1]`);
    }
    if (f.cam_yaw_deg !== undefined && !isNum(f.cam_yaw_deg)) fail(`inputs.frames[${i}].cam_yaw_deg: must be a number`);
    for (const b of ['jump', 'interact', 'pulse', 'dash']) {
      if (f[b] !== undefined && typeof f[b] !== 'boolean') fail(`inputs.frames[${i}].${b}: must be boolean`);
    }
  });
  return data;
}

export function validateScenario(sc) {
  if (!isObj(sc)) fail('scenario: expected object');
  if (sc.player !== undefined) {
    const p = sc.player;
    if (!isObj(p)) fail('scenario.player: expected object');
    if (p.pos !== undefined && !isVec3(p.pos)) fail('scenario.player.pos: expected [x,y,z]');
    if (p.carried !== undefined && (!Number.isInteger(p.carried) || p.carried < 0)) fail('scenario.player.carried: integer >= 0');
    if (p.flames !== undefined && (!Number.isInteger(p.flames) || p.flames < 0)) fail('scenario.player.flames: integer >= 0');
  }
  for (const k of ['random_motes', 'random_shades']) {
    if (sc[k] !== undefined && typeof sc[k] !== 'boolean') fail(`scenario.${k}: must be boolean`);
  }
  if (sc.motes !== undefined) {
    if (!Array.isArray(sc.motes)) fail('scenario.motes: expected array');
    sc.motes.forEach((m, i) => {
      if (!isVec3(m) && !(isObj(m) && isVec3(m.pos))) fail(`scenario.motes[${i}]: expected [x,y,z]`);
    });
  }
  if (sc.shades !== undefined) {
    if (!Array.isArray(sc.shades)) fail('scenario.shades: expected array');
    const ids = new Set();
    sc.shades.forEach((s, i) => {
      if (!isObj(s) || !isVec3(s.pos)) fail(`scenario.shades[${i}]: expected { pos: [x,y,z] }`);
      if (s.id !== undefined) {
        if (typeof s.id !== 'string' || ids.has(s.id)) fail(`scenario.shades[${i}].id: must be unique string`);
        ids.add(s.id);
      }
    });
  }
  if (sc.lanterns !== undefined) {
    if (!Array.isArray(sc.lanterns)) fail('scenario.lanterns: expected array');
    sc.lanterns.forEach((l, i) => {
      if (!isObj(l) || typeof l.id !== 'string') fail(`scenario.lanterns[${i}]: expected { id }`);
      if (l.pos !== undefined && !isVec3(l.pos)) fail(`scenario.lanterns[${i}].pos: expected [x,y,z]`);
      if (l.deposited !== undefined && (!Number.isInteger(l.deposited) || l.deposited < 0))
        fail(`scenario.lanterns[${i}].deposited: integer >= 0`);
      if (l.lit !== undefined && typeof l.lit !== 'boolean') fail(`scenario.lanterns[${i}].lit: boolean`);
    });
  }
  if (sc.time_left_s !== undefined && (!isNum(sc.time_left_s) || sc.time_left_s <= 0))
    fail('scenario.time_left_s: number > 0');
  return sc;
}
