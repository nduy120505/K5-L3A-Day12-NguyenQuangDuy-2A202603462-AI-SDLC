// Validation of inputs / scenario files (Test Contract v1.1, sections C & D).
// Throws FormatError on malformed data → headless exits with code 2.
export class FormatError extends Error {}

const SHADE_STATES = ['spawning', 'wander', 'chase', 'recoil', 'stunned', 'drain'];
const DRIFTER_STATES = ['idle', 'chase', 'flee', 'removed'];
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isVec3 = (v) => Array.isArray(v) && v.length === 3 && v.every(isNum);
const isCount = (v) => Number.isInteger(v) && v >= 0;
const fail = (msg) => {
  throw new FormatError(msg);
};
const optCount = (o, k, where) => {
  if (o[k] !== undefined && !isCount(o[k])) fail(`${where}.${k}: integer >= 0`);
};
const optBool = (o, k, where) => {
  if (o[k] !== undefined && typeof o[k] !== 'boolean') fail(`${where}.${k}: must be boolean`);
};
const optId = (o, where, ids) => {
  if (o.id === undefined) return;
  if (typeof o.id !== 'string' || ids.has(o.id)) fail(`${where}.id: must be unique string`);
  ids.add(o.id);
};

export function validateInputs(data) {
  if (!isObj(data) || !Array.isArray(data.frames)) fail('inputs: expected object with "frames" array');
  let last = -1;
  data.frames.forEach((f, i) => {
    const w = `inputs.frames[${i}]`;
    if (!isObj(f)) fail(`${w}: not an object`);
    if (!Number.isInteger(f.tick) || f.tick < 0) fail(`${w}.tick: must be integer >= 0`);
    if (f.tick <= last) fail(`${w}.tick: ticks must be strictly increasing`);
    last = f.tick;
    if (f.move !== undefined) {
      if (!Array.isArray(f.move) || f.move.length !== 2 || !f.move.every((x) => isNum(x) && x >= -1 && x <= 1))
        fail(`${w}.move: must be [x, z] with values in [-1, 1]`);
    }
    if (f.cam_yaw_deg !== undefined && !isNum(f.cam_yaw_deg)) fail(`${w}.cam_yaw_deg: must be a number`);
    for (const b of ['jump', 'interact', 'pulse', 'dash', 'pause']) optBool(f, b, w);
  });
  return data;
}

export function validateScenario(sc) {
  if (!isObj(sc)) fail('scenario: expected object');
  if (sc.player !== undefined) {
    const p = sc.player;
    if (!isObj(p)) fail('scenario.player: expected object');
    if (p.pos !== undefined && !isVec3(p.pos)) fail('scenario.player.pos: expected [x,y,z]');
    for (const k of ['carried', 'flames', 'invuln_ticks', 'dash_cd_ticks', 'pulse_cd_ticks', 'charm_ticks', 'successful_lights']) optCount(p, k, 'scenario.player');
  }
  for (const k of ['random_motes', 'random_shades', 'random_drifters', 'wind_enabled']) optBool(sc, k, 'scenario');
  if (sc.motes !== undefined) {
    if (!Array.isArray(sc.motes)) fail('scenario.motes: expected array');
    const ids = new Set();
    sc.motes.forEach((m, i) => {
      const w = `scenario.motes[${i}]`;
      if (isVec3(m)) return;
      if (!isObj(m) || !isVec3(m.pos)) fail(`${w}: expected [x,y,z] or { pos }`);
      optId(m, w, ids);
      if (m.kind !== undefined && !['random', 'dropped'].includes(m.kind)) fail(`${w}.kind: random | dropped`);
      optCount(m, 'ttl_ticks', w);
      if (m.ttl_s !== undefined && m.ttl_s !== null && !(isNum(m.ttl_s) && m.ttl_s >= 0)) fail(`${w}.ttl_s: number >= 0`);
    });
  }
  if (sc.shades !== undefined) {
    if (!Array.isArray(sc.shades)) fail('scenario.shades: expected array');
    const ids = new Set();
    sc.shades.forEach((s, i) => {
      const w = `scenario.shades[${i}]`;
      if (!isObj(s) || !isVec3(s.pos)) fail(`${w}: expected { pos: [x,y,z] }`);
      optId(s, w, ids);
      if (s.state !== undefined && !SHADE_STATES.includes(s.state)) fail(`${w}.state: one of ${SHADE_STATES.join(', ')}`);
      optCount(s, 'state_ticks_left', w);
      if (s.target_lantern_id !== undefined && typeof s.target_lantern_id !== 'string') fail(`${w}.target_lantern_id: string`);
    });
  }
  if (sc.drifters !== undefined) {
    if (!Array.isArray(sc.drifters)) fail('scenario.drifters: expected array');
    const ids = new Set();
    sc.drifters.forEach((d, i) => {
      const w = `scenario.drifters[${i}]`;
      if (!isObj(d) || !isVec3(d.pos)) fail(`${w}: expected { pos: [x,y,z] }`);
      optId(d, w, ids);
      if (d.state !== undefined && !DRIFTER_STATES.includes(d.state)) fail(`${w}.state: one of ${DRIFTER_STATES.join(', ')}`);
      optCount(d, 'stolen', w);
      optCount(d, 'state_ticks_left', w);
    });
  }
  if (sc.charms !== undefined) {
    if (!Array.isArray(sc.charms)) fail('scenario.charms: expected array');
    const ids = new Set();
    sc.charms.forEach((c, i) => {
      const w = `scenario.charms[${i}]`;
      if (!isObj(c) || typeof c.id !== 'string') fail(`${w}: expected { id }`);
      optId(c, w, ids);
      if (c.pos !== undefined && !isVec3(c.pos)) fail(`${w}.pos: expected [x,y,z]`);
      optBool(c, 'available', w);
      optCount(c, 'respawn_ticks', w);
      if (c.respawn_s !== undefined && !(isNum(c.respawn_s) && c.respawn_s >= 0)) fail(`${w}.respawn_s: number >= 0`);
    });
  }
  if (sc.lanterns !== undefined) {
    if (!Array.isArray(sc.lanterns)) fail('scenario.lanterns: expected array');
    sc.lanterns.forEach((l, i) => {
      const w = `scenario.lanterns[${i}]`;
      if (!isObj(l) || typeof l.id !== 'string') fail(`${w}: expected { id }`);
      if (l.pos !== undefined && !isVec3(l.pos)) fail(`${w}.pos: expected [x,y,z]`);
      optCount(l, 'deposited', w);
      optBool(l, 'lit', w);
      optBool(l, 'ever_lit', w);
      optCount(l, 'relit_count', w);
      if (l.fuel !== undefined && !(isNum(l.fuel) && l.fuel >= 0 && l.fuel <= 100)) fail(`${w}.fuel: number in [0, 100]`);
    });
  }
  if (sc.time_left_s !== undefined && (!isNum(sc.time_left_s) || sc.time_left_s <= 0)) fail('scenario.time_left_s: number > 0');
  return sc;
}
