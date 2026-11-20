// Pure game logic for Đảo Đèn Lồng (Test Contract v1.1 / Ticket-02). No DOM / three.js.
// Fixed 60 ticks/s. All randomness via seeded RNG. Tick order follows Ticket-02 Part 1.
import { createRng } from './rng.js';
import { MAPS, FALL_Y, STEP_UP } from './maps.js';

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;

// Standard constants from Ticket-02 that are not contract tuning keys.
export const STD = {
  jumpSpeed: 7, gravity: 20,
  charmSpeed: 7.2, charmTicks: 600, charmRespawn: 2700,
  moteInitial: 20, moteCap: 30, moteEvery: 240, dropTtl: 480, pickDy: 1.5,
  dropRMin: 1.5, dropRMax: 2.5,
  detect: 12, giveUp: 18, hitDy: 1.5, recoilM: 2, recoilTicks: 60,
  stunPushTicks: 15, evictTicks: 30, pulseCenterY: 0.8,
  shadeFirst: 300, shadeFirstCount: 2, spawnMinDist: 15, spawningTicks: 30, wanderSpeed: 1.0, shadeY: 1,
  drifterSpeed: 7, drifterIdle: 2, drifterMax: 2, drifterEvery: 1200, drifterCarry: 5, drifterDetect: 15,
  drifterHit: 1.2, drifterSteal: 3, drifterFlee: 240, drifterVanish: 120,
  fallWait: 60,
  windEvery: 1800, windDur: 300, windWarn: 120, windSpeed: 2,
};

export const SHADE_STATES = ['spawning', 'wander', 'chase', 'recoil', 'stunned'];
export const DRIFTER_STATES = ['idle', 'chase', 'flee', 'removed'];
const BUTTONS = ['jump', 'interact', 'pulse', 'dash', 'pause'];

const distXZ = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const sec2t = (s) => Math.round(s * TICK_RATE);
const idNum = (id) => {
  const m = /(\d+)$/.exec(id);
  return m ? parseInt(m[1], 10) : Infinity;
};
const byId = (a, b) => idNum(a.id) - idNum(b.id) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function emptyInput() {
  return { move: [0, 0], cam_yaw_deg: 0, jump: false, interact: false, pulse: false, dash: false, pause: false };
}

export class ScenarioError extends Error {}

export class Game {
  /** @param tuning contract tuning · opts { seed, night, scenario, onEvent } */
  constructor(tuning, { seed = 0, night = 1, scenario = null, onEvent = null } = {}) {
    if (!MAPS[night]) throw new ScenarioError(`unknown night ${night}`);
    this.t = tuning;
    this.night = night;
    this.map = MAPS[night];
    this.rng = createRng(seed);
    this.onEvent = onEvent;
    this.tick = 0;
    this.simTick = 0;
    this.paused = false;
    this.state = 'playing';
    this.result = null;
    this.score = 0;
    this.duration = tuning[this.map.duration_key];
    this.prev = Object.fromEntries(BUTTONS.map((b) => [b, false]));
    this.randomMotes = true;
    this.randomShades = true;
    this.randomDrifters = true;
    this.windEnabled = this.map.wind;
    this.wind = { active: false, dir_deg: null, warn: false, next: null };
    this.n = { mote: 1, shade: 1, drifter: 1 };
    this.T = {
      invuln: sec2t(tuning.invuln_s), stun: sec2t(tuning.pulse_stun_s), pulseCd: sec2t(tuning.pulse_cooldown_s),
      dashCd: sec2t(tuning.dash_cooldown_s), dashDur: sec2t(tuning.dash_duration_s),
    };
    const s = this.map.start;
    this.player = {
      pos: [...s], vel: [0, 0, 0], grounded: true, facing: [0, 1],
      flames: tuning.flames, carried: 0,
      invuln: 0, dashCd: 0, pulseCd: 0, charm: 0, dashLeft: 0, dashDir: [0, 1], launch: null, dead: 0,
    };
    this.lanterns = this.map.lanterns.map((p, i) => ({ id: `L${i + 1}`, pos: [...p], lit: false, deposited: 0 }));
    this.motes = [];
    this.shades = [];
    this.drifters = [];
    this.charms = this.map.charms.map((c) => ({ id: c.id, pos: [...c.pos], available: true, respawn: 0 }));
    if (scenario) this.applyScenario(scenario);
    if (!scenario || scenario.motes === undefined) {
      if (this.randomMotes) for (let i = 0; i < STD.moteInitial; i++) this.spawnRandomMote();
    }
    for (const sh of this.shades) this.clampSafe(sh);
  }

  // ---------------------------------------------------------------- scenario
  applyScenario(sc) {
    const p = this.player;
    for (const k of ['random_motes', 'random_shades', 'random_drifters']) {
      if (sc[k] !== undefined) this[{ random_motes: 'randomMotes', random_shades: 'randomShades', random_drifters: 'randomDrifters' }[k]] = sc[k];
    }
    if (sc.wind_enabled !== undefined) this.windEnabled = sc.wind_enabled;
    if (sc.player) {
      const sp = sc.player;
      if (sp.pos) p.pos = [...sp.pos];
      if (sp.carried !== undefined) p.carried = sp.carried;
      if (sp.flames !== undefined) p.flames = sp.flames;
      if (sp.invuln_ticks !== undefined) p.invuln = sp.invuln_ticks;
      if (sp.dash_cd_ticks !== undefined) p.dashCd = sp.dash_cd_ticks;
      if (sp.pulse_cd_ticks !== undefined) p.pulseCd = sp.pulse_cd_ticks;
      if (sp.charm_ticks !== undefined) p.charm = sp.charm_ticks;
      const g = this.map.ground(p.pos[0], p.pos[2]);
      p.grounded = g !== null && Math.abs(p.pos[1] - g) < 1e-6;
    }
    if (sc.time_left_s !== undefined) this.duration = sc.time_left_s;
    if (sc.lanterns) {
      for (const l of sc.lanterns) {
        const target = this.lanterns.find((x) => x.id === l.id);
        if (!target) throw new ScenarioError(`unknown lantern id: ${l.id}`);
        if (l.pos) target.pos = [...l.pos];
        if (l.deposited !== undefined) target.deposited = l.deposited;
        if (l.lit !== undefined) target.lit = l.lit;
      }
    }
    if (sc.motes !== undefined) {
      this.motes = sc.motes.map((m) => {
        const o = Array.isArray(m) ? { pos: m } : m;
        const kind = o.kind ?? 'random';
        let ttl = null;
        if (kind === 'dropped') ttl = o.ttl_ticks ?? (o.ttl_s !== undefined ? sec2t(o.ttl_s) : STD.dropTtl);
        return { id: o.id ?? `M${this.n.mote++}`, pos: [...o.pos], kind, ttl, point: this.pointIndex(o.pos) };
      });
    }
    if (sc.shades !== undefined) {
      this.shades = sc.shades.map((s) => {
        const sh = this.newShade(s.id ?? null, [...s.pos], 'wander');
        if (s.state) {
          sh.state = s.state;
          sh.ticks = s.state_ticks_left ?? this.defaultStateTicks(s.state);
          if (s.state === 'stunned') sh.pushLeft = 0;
        } else {
          sh.state = distXZ(sh.pos, p.pos) <= STD.detect ? 'chase' : 'wander';
        }
        return sh;
      });
      for (const sh of this.shades) if (sh.id === null) sh.id = this.nextId('S', 'shade', this.shades);
    }
    if (sc.drifters !== undefined) {
      this.drifters = sc.drifters.map((d) => ({
        id: d.id ?? null, pos: [...d.pos], state: d.state ?? 'idle', stolen: d.stolen ?? 0,
        ticks: d.state_ticks_left ?? (d.state === 'flee' ? STD.drifterFlee : 0), dir: [1, 0],
      }));
      for (const d of this.drifters) if (d.id === null) d.id = this.nextId('D', 'drifter', this.drifters);
    }
    if (sc.charms !== undefined) {
      this.charms = sc.charms.map((c) => {
        const def = this.map.charms.find((x) => x.id === c.id);
        const pos = c.pos ?? def?.pos;
        if (!pos) throw new ScenarioError(`charm ${c.id}: pos required`);
        const respawn = c.respawn_ticks ?? (c.respawn_s !== undefined ? sec2t(c.respawn_s) : 0);
        return { id: c.id, pos: [...pos], available: c.available ?? respawn === 0, respawn };
      });
    }
  }

  defaultStateTicks(state) {
    return { spawning: STD.spawningTicks, recoil: STD.recoilTicks, stunned: this.T.stun }[state] ?? 0;
  }

  newShade(id, pos, state) {
    return { id, pos, state, ticks: 0, pushLeft: 0, pushDir: [1, 0], recoilDir: [1, 0], evict: 0, wdir: [1, 0], wticks: 0 };
  }

  nextId(prefix, key, list) {
    let id;
    do id = `${prefix}${this.n[key]++}`;
    while (list.some((x) => x.id === id));
    return id;
  }

  pointIndex(pos) {
    return this.map.motePoints.findIndex((q) => Math.hypot(q[0] - pos[0], q[2] - pos[2]) < 0.01);
  }

  emit(name, data) {
    const evt = { type: 'event', tick: this.tick + 1, name, data };
    if (this.onEvent) this.onEvent(evt);
  }

  // ---------------------------------------------------------------- helpers
  ground(x, z) {
    return this.map.ground(x, z);
  }

  blocked(x, z, y) {
    const g = this.ground(x, z);
    if (g !== null && g > y + STEP_UP) return true;
    for (const o of this.map.obstacles) if (Math.hypot(x - o.x, z - o.z) < o.r && y < o.top) return true;
    return false;
  }

  litZones() {
    return this.lanterns.filter((l) => l.lit);
  }

  clampSafe(sh) {
    if (sh.evict > 0) return;
    const R = this.t.safe_radius;
    for (const l of this.litZones()) {
      const d = distXZ(sh.pos, l.pos);
      if (d < R) {
        const [dx, dz] = d < 1e-9 ? [1, 0] : [(sh.pos[0] - l.pos[0]) / d, (sh.pos[2] - l.pos[2]) / d];
        sh.pos[0] = l.pos[0] + dx * R;
        sh.pos[2] = l.pos[2] + dz * R;
      }
    }
  }

  moveShadeBy(sh, dx, dz) {
    const nx = sh.pos[0] + dx, nz = sh.pos[2] + dz;
    for (const o of this.map.obstacles) if (Math.hypot(nx - o.x, nz - o.z) < o.r + 0.8 && sh.pos[1] < o.top) return false;
    sh.pos[0] = nx;
    sh.pos[2] = nz;
    const g = this.ground(nx, nz);
    if (g !== null) sh.pos[1] = g + STD.shadeY;
    return true;
  }

  spawnRandomMote() {
    const used = new Set(this.motes.filter((m) => m.point >= 0).map((m) => m.point));
    const free = this.map.motePoints.map((_, i) => i).filter((i) => !used.has(i));
    if (free.length === 0) return false;
    const i = free[Math.floor(this.rng() * free.length)];
    this.motes.push({ id: `M${this.n.mote++}`, pos: [...this.map.motePoints[i]], kind: 'random', ttl: null, point: i });
    return true;
  }

  dropMotes(count, at) {
    if (count <= 0) return;
    const a0 = this.rng() * Math.PI * 2;
    const baseY = this.ground(at[0], at[2]) ?? Math.max(0, at[1]);
    for (let i = 0; i < count; i++) {
      const a = a0 + (i * Math.PI * 2) / count;
      const r = STD.dropRMin + this.rng() * (STD.dropRMax - STD.dropRMin);
      const x = at[0] + Math.cos(a) * r, z = at[2] + Math.sin(a) * r;
      const g = this.ground(x, z);
      this.motes.push({ id: `M${this.n.mote++}`, pos: [x, g ?? baseY, z], kind: 'dropped', ttl: STD.dropTtl, point: -1 });
    }
  }

  litCount() {
    return this.lanterns.filter((l) => l.lit).length;
  }

  timeLeft() {
    return this.duration - this.simTick / TICK_RATE;
  }

  // ---------------------------------------------------------------- step
  step(input) {
    if (this.state !== 'playing') return;
    const t = this.t, p = this.player, T = this.T;
    // 1. input (pause first)
    const edge = {};
    for (const b of BUTTONS) {
      const v = !!input[b];
      edge[b] = v && !this.prev[b];
      this.prev[b] = v;
    }
    if (edge.pause) {
      this.paused = !this.paused;
      this.emit(this.paused ? 'paused' : 'resumed', {});
      if (this.paused) return void this.tick++;
    } else if (this.paused) {
      return void this.tick++;
    }
    const newSim = this.simTick + 1;

    // 2. counters
    this.simTick = newSim;
    if (p.invuln > 0) p.invuln--;
    if (p.dashCd > 0) p.dashCd--;
    if (p.pulseCd > 0) p.pulseCd--;
    if (p.charm > 0) p.charm--;
    if (p.dead > 0 && --p.dead === 0) {
      p.pos = [...this.map.start];
      p.vel = [0, 0, 0];
      p.grounded = true;
      p.launch = null;
      p.dashLeft = 0;
      p.invuln = T.invuln;
    }
    for (const sh of this.shades) {
      if (sh.evict > 0) sh.evict--;
      if (['spawning', 'stunned', 'recoil'].includes(sh.state) && --sh.ticks <= 0) {
        sh.ticks = 0;
        sh.state = 'wander';
      }
    }
    for (const d of this.drifters) {
      if (d.state === 'flee' && --d.ticks <= 0) {
        d.state = 'removed';
        d.ticks = 0;
      }
    }
    this.motes = this.motes.filter((m) => m.kind !== 'dropped' || --m.ttl > 0);
    for (const c of this.charms) if (!c.available && c.respawn > 0 && --c.respawn === 0) c.available = true;
    if (this.map.wind && this.windEnabled) {
      const ph = newSim % STD.windEvery;
      if (ph === STD.windEvery - STD.windWarn) this.wind.next = Math.floor(this.rng() * 360);
      this.wind.warn = ph >= STD.windEvery - STD.windWarn;
      if (ph === 0) {
        this.wind.active = true;
        this.wind.dir_deg = this.wind.next ?? 0;
      }
      if (ph === STD.windDur) this.wind.active = false;
    }

    // 3. player movement
    if (p.dead === 0) this.movePlayer(input, edge);

    // 4. pickups
    if (p.dead === 0) {
      for (let i = 0; i < this.motes.length && p.carried < t.carry_capacity; ) {
        const m = this.motes[i];
        if (distXZ(m.pos, p.pos) <= t.pickup_radius && Math.abs(p.pos[1] - m.pos[1]) <= STD.pickDy) {
          this.motes.splice(i, 1);
          p.carried++;
          this.emit('mote_picked', { carried: p.carried });
        } else i++;
      }
      for (const c of this.charms) {
        if (c.available && distXZ(c.pos, p.pos) <= t.pickup_radius && Math.abs(p.pos[1] - c.pos[1]) <= STD.pickDy) {
          c.available = false;
          c.respawn = STD.charmRespawn;
          p.charm = STD.charmTicks;
          p.dashCd = 0;
          this.emit('charm_picked', { charm_id: c.id, charm_ticks: STD.charmTicks });
        }
      }
    }

    // 5. lanterns
    if (edge.interact && p.dead === 0 && p.carried > 0) {
      let best = null, bestD = Infinity;
      for (const l of this.lanterns) {
        if (l.lit) continue;
        const d = distXZ(l.pos, p.pos);
        if (d <= t.interact_radius && (d < bestD - 1e-9 || (Math.abs(d - bestD) <= 1e-9 && idNum(l.id) < idNum(best.id)))) {
          best = l;
          bestD = d;
        }
      }
      if (best) {
        const amount = Math.min(p.carried, t.lantern_cost - best.deposited);
        if (amount > 0) {
          p.carried -= amount;
          best.deposited += amount;
          this.score += t.score.per_mote * amount;
          this.emit('deposit', { lantern_id: best.id, amount, deposited: best.deposited });
        }
        if (best.deposited >= t.lantern_cost) {
          best.lit = true;
          this.score += t.score.per_lantern;
          this.emit('lantern_lit', { lantern_id: best.id });
          for (const sh of this.shades) if (distXZ(sh.pos, best.pos) < t.safe_radius) sh.evict = STD.evictTicks;
        }
      }
    }

    // 6. safe zones: evict shades that were inside when a lantern lit (≤ 30 ticks)
    const R = t.safe_radius;
    for (const sh of this.shades) {
      if (sh.evict <= 0) continue;
      const l = this.litZones().find((z) => distXZ(sh.pos, z.pos) < R);
      if (!l) {
        sh.evict = 0;
        continue;
      }
      const d = distXZ(sh.pos, l.pos);
      const [dx, dz] = d < 1e-9 ? [1, 0] : [(sh.pos[0] - l.pos[0]) / d, (sh.pos[2] - l.pos[2]) / d];
      const step = Math.max(R / STD.evictTicks, (R - d) / Math.max(1, sh.evict));
      const nd = Math.min(R, d + step);
      sh.pos[0] = l.pos[0] + dx * nd;
      sh.pos[2] = l.pos[2] + dz * nd;
      if (nd >= R) sh.evict = 0;
    }

    // 7. pulse
    if (edge.pulse && p.dead === 0 && p.pulseCd === 0 && p.carried >= t.pulse_cost) {
      p.carried -= t.pulse_cost;
      p.pulseCd = T.pulseCd;
      const c = [p.pos[0], p.pos[1] + STD.pulseCenterY, p.pos[2]];
      const d3 = (q) => Math.hypot(q[0] - c[0], q[1] - c[1], q[2] - c[2]);
      const ids = [];
      for (const sh of [...this.shades].sort(byId)) {
        if (d3(sh.pos) > t.pulse_radius) continue;
        ids.push(sh.id);
        sh.state = 'stunned';
        sh.ticks = T.stun;
        sh.pushLeft = STD.stunPushTicks;
        const dh = Math.hypot(sh.pos[0] - c[0], sh.pos[2] - c[2]);
        sh.pushDir = dh < 1e-9 ? [1, 0] : [(sh.pos[0] - c[0]) / dh, (sh.pos[2] - c[2]) / dh];
        this.score += t.score.per_stun;
      }
      for (const d of [...this.drifters].sort(byId)) {
        if (d.state === 'removed' || d3(d.pos) > t.pulse_radius) continue;
        if (d.state === 'chase') {
          d.state = 'flee';
          d.ticks = STD.drifterFlee;
        } else if (d.state === 'flee' && d.stolen > 0) {
          const amount = d.stolen;
          d.stolen = 0;
          this.dropMotes(amount, d.pos);
          d.ticks = STD.drifterVanish;
          this.emit('drifter_drop', { drifter_id: d.id, amount });
        }
      }
      this.emit('pulse', { stunned_ids: ids });
    }

    // 8. shades & drifters move
    const speed = this.map.shadeSpeed;
    for (const sh of this.shades) {
      if (sh.evict > 0 || sh.state === 'spawning') continue;
      if (sh.state === 'stunned') {
        if (sh.pushLeft > 0) {
          sh.pushLeft--;
          const s = t.pulse_push_m / STD.stunPushTicks;
          if (!this.moveShadeBy(sh, sh.pushDir[0] * s, sh.pushDir[1] * s)) sh.pushLeft = 0;
        }
      } else if (sh.state === 'recoil') {
        const s = STD.recoilM / STD.recoilTicks;
        this.moveShadeBy(sh, sh.recoilDir[0] * s, sh.recoilDir[1] * s);
      } else {
        const d = p.dead > 0 ? Infinity : distXZ(sh.pos, p.pos);
        if (sh.state === 'wander' && d <= STD.detect) sh.state = 'chase';
        else if (sh.state === 'chase' && d > STD.giveUp) sh.state = 'wander';
        if (sh.state === 'chase') {
          const st = Math.min(speed * DT, d);
          if (d > 1e-9) this.moveShadeBy(sh, ((p.pos[0] - sh.pos[0]) / d) * st, ((p.pos[2] - sh.pos[2]) / d) * st);
        } else {
          if (sh.wticks <= 0) {
            const b = this.map.bounds;
            const toC = Math.atan2(b.cz - sh.pos[2], b.cx - sh.pos[0]);
            const a = Math.hypot(sh.pos[0] - b.cx, sh.pos[2] - b.cz) > b.r * 0.8 ? toC + (this.rng() - 0.5) : this.rng() * Math.PI * 2;
            sh.wdir = [Math.cos(a), Math.sin(a)];
            sh.wticks = 120;
          }
          sh.wticks--;
          this.moveShadeBy(sh, sh.wdir[0] * STD.wanderSpeed * DT, sh.wdir[1] * STD.wanderSpeed * DT);
        }
      }
      this.clampSafe(sh);
    }
    for (const d of this.drifters) {
      if (d.state === 'removed') continue;
      const dist = p.dead > 0 ? Infinity : distXZ(d.pos, p.pos);
      const wants = p.carried >= STD.drifterCarry && dist <= STD.drifterDetect;
      if (d.state === 'idle' && wants) d.state = 'chase';
      else if (d.state === 'chase' && !wants) d.state = 'idle';
      let vx = 0, vz = 0;
      if (d.state === 'chase' && dist > 1e-9) {
        const st = Math.min(STD.drifterSpeed * DT, dist);
        vx = ((p.pos[0] - d.pos[0]) / dist) * st;
        vz = ((p.pos[2] - d.pos[2]) / dist) * st;
      } else if (d.state === 'flee') {
        const dd = distXZ(d.pos, p.pos);
        const [ux, uz] = dd < 1e-9 ? [1, 0] : [(d.pos[0] - p.pos[0]) / dd, (d.pos[2] - p.pos[2]) / dd];
        vx = ux * STD.drifterSpeed * DT;
        vz = uz * STD.drifterSpeed * DT;
      } else if (d.state === 'idle') {
        const a = Math.atan2(d.dir[1], d.dir[0]) + 0.01;
        d.dir = [Math.cos(a), Math.sin(a)];
        vx = d.dir[0] * STD.drifterIdle * DT;
        vz = d.dir[1] * STD.drifterIdle * DT;
      }
      d.pos[0] += vx;
      d.pos[2] += vz;
      const g = this.ground(d.pos[0], d.pos[2]);
      if (g !== null) d.pos[1] = g + 1;
    }

    // 9. contact: drifters steal first, then shades hit (by id)
    if (p.dead === 0) {
      for (const d of [...this.drifters].sort(byId)) {
        if (d.state !== 'chase' || distXZ(d.pos, p.pos) > STD.drifterHit) continue;
        const amount = Math.min(STD.drifterSteal, p.carried);
        p.carried -= amount;
        d.stolen = amount;
        d.state = 'flee';
        d.ticks = STD.drifterFlee;
        this.emit('drifter_steal', { drifter_id: d.id, amount, carried: p.carried });
      }
      if (p.invuln === 0) {
        for (const sh of [...this.shades].sort(byId)) {
          if (!(sh.state === 'wander' || sh.state === 'chase') || sh.evict > 0) continue;
          if (distXZ(sh.pos, p.pos) > t.shade_hit_radius || Math.abs(sh.pos[1] - p.pos[1]) > STD.hitDy) continue;
          p.flames = Math.max(0, p.flames - 1);
          const dropped = Math.floor(p.carried * t.hit_drop_ratio);
          p.carried -= dropped;
          this.dropMotes(dropped, p.pos);
          p.invuln = T.invuln;
          const dd = distXZ(sh.pos, p.pos);
          sh.recoilDir = dd < 1e-9 ? [1, 0] : [(sh.pos[0] - p.pos[0]) / dd, (sh.pos[2] - p.pos[2]) / dd];
          sh.state = 'recoil';
          sh.ticks = STD.recoilTicks;
          this.moveShadeBy(sh, sh.recoilDir[0] * (STD.recoilM / STD.recoilTicks), sh.recoilDir[1] * (STD.recoilM / STD.recoilTicks));
          this.emit('player_hit', { by: 'shade', flames: p.flames, dropped });
          break;
        }
      }
    }

    // 10. spawning
    if (this.randomMotes && newSim % STD.moteEvery === 0 && this.motes.length < STD.moteCap) this.spawnRandomMote();
    if (this.randomShades) {
      let count = 0;
      if (newSim === STD.shadeFirst) count = STD.shadeFirstCount;
      else if (newSim > STD.shadeFirst && (newSim - STD.shadeFirst) % this.map.shadeInterval === 0) count = 1;
      for (let i = 0; i < count; i++) this.spawnShade();
    }
    if (this.map.drifters && this.randomDrifters && newSim % STD.drifterEvery === 0) {
      if (this.drifters.filter((d) => d.state !== 'removed').length < STD.drifterMax) {
        const pts = this.map.shadePoints;
        const q = pts[Math.floor(this.rng() * pts.length)];
        const g = this.ground(q[0], q[2]) ?? 0;
        this.drifters.push({ id: this.nextId('D', 'drifter', this.drifters), pos: [q[0], g + 1, q[2]], state: 'idle', stolen: 0, ticks: 0, dir: [1, 0] });
      }
    }

    // 11. win / lose
    this.tick++;
    if (p.flames <= 0) this.finish('lost', 'no_flames');
    else if (this.lanterns.length > 0 && this.litCount() === this.lanterns.length) {
      const left = Math.max(0, this.timeLeft());
      this.score += t.score.per_second_left * Math.floor(left + 1e-9) + t.score.per_flame_left * p.flames;
      this.finish('won', 'all_lit');
    } else if (this.timeLeft() <= 1e-9) this.finish('lost', 'dawn');
  }

  spawnShade() {
    if (this.shades.length >= this.map.shadeMax) return;
    const p = this.player;
    const valid = this.map.shadePoints.filter(
      (q) => distXZ(q, p.pos) >= STD.spawnMinDist && !this.litZones().some((l) => distXZ(q, l.pos) < this.t.safe_radius),
    );
    if (valid.length === 0) return;
    const q = valid[Math.floor(this.rng() * valid.length)];
    const g = this.ground(q[0], q[2]) ?? 0;
    const sh = this.newShade(this.nextId('S', 'shade', this.shades), [q[0], g + STD.shadeY, q[2]], 'spawning');
    sh.ticks = STD.spawningTicks;
    this.shades.push(sh);
    this.emit('shade_spawned', { id: sh.id });
  }

  movePlayer(input, edge) {
    const p = this.player, T = this.T;
    let mx = input.move ? input.move[0] : 0;
    let mz = input.move ? input.move[1] : 0;
    const len = Math.hypot(mx, mz);
    if (len > 1) {
      mx /= len;
      mz /= len;
    }
    const th = ((input.cam_yaw_deg || 0) * Math.PI) / 180;
    const wx = mx * Math.cos(th) + mz * Math.sin(th);
    const wz = -mx * Math.sin(th) + mz * Math.cos(th);
    const moving = Math.hypot(wx, wz) > 1e-9;

    // dash (rising edge; charm removes cooldown; ignored while dashing)
    if (edge.dash && p.dashLeft === 0 && (p.dashCd === 0 || p.charm > 0)) {
      const l = Math.hypot(wx, wz);
      p.dashDir = moving ? [wx / l, wz / l] : [...p.facing];
      p.dashLeft = T.dashDur;
      p.dashCd = p.charm > 0 ? 0 : T.dashCd;
      this.emit('dash', {});
    }
    // jump
    if (edge.jump && p.grounded) {
      p.vel[1] = STD.jumpSpeed;
      p.grounded = false;
    }
    let hx, hz;
    const dashing = p.dashLeft > 0;
    if (dashing) {
      hx = p.dashDir[0] * this.t.dash_speed;
      hz = p.dashDir[1] * this.t.dash_speed;
      p.dashLeft--;
      p.facing = [...p.dashDir];
    } else if (p.launch) {
      [hx, hz] = p.launch;
    } else {
      const sp = p.charm > 0 ? STD.charmSpeed : this.t.player_speed;
      hx = wx * sp;
      hz = wz * sp;
      if (moving) {
        const l = Math.hypot(wx, wz);
        p.facing = [wx / l, wz / l];
      }
    }
    if (this.wind.active) {
      const a = (this.wind.dir_deg * Math.PI) / 180;
      hx += Math.cos(a) * STD.windSpeed;
      hz += Math.sin(a) * STD.windSpeed;
    }
    // horizontal move with walls (cliffs, tower)
    const x0 = p.pos[0], z0 = p.pos[2], y = p.pos[1];
    let nx = x0 + hx * DT, nz = z0 + hz * DT;
    if (this.blocked(nx, nz, y)) {
      if (!this.blocked(nx, z0, y)) nz = z0;
      else if (!this.blocked(x0, nz, y)) nx = x0;
      else {
        nx = x0;
        nz = z0;
      }
    }
    p.pos[0] = nx;
    p.pos[2] = nz;
    // vertical
    if (dashing) {
      p.vel[1] = 0;
      const g = this.ground(nx, nz);
      if (p.grounded) {
        if (g === null || g < y - STEP_UP) p.grounded = false;
        else p.pos[1] = g;
      }
    } else if (p.grounded) {
      const g = this.ground(nx, nz);
      if (g === null || g < y - STEP_UP) {
        p.grounded = false;
        p.vel[1] = 0;
      } else p.pos[1] = g;
    }
    if (!p.grounded && !dashing) {
      const prevY = p.pos[1];
      // exact ballistic step (y = y0 + v·t − g·t²/2): landing times match the spec (0.7 s jump, 1.4 s pad)
      p.pos[1] += p.vel[1] * DT - 0.5 * STD.gravity * DT * DT;
      p.vel[1] -= STD.gravity * DT;
      const g = this.ground(nx, nz);
      if (g !== null && p.pos[1] <= g + 1e-9 && prevY >= g - 1e-6 && p.vel[1] <= 0) {
        p.pos[1] = g;
        p.vel[1] = 0;
        p.grounded = true;
        p.launch = null;
      }
    }
    p.vel[0] = (p.pos[0] - x0) / DT;
    p.vel[2] = (p.pos[2] - z0) / DT;
    // jump pads
    if (p.grounded) {
      for (const pad of this.map.jumpPads) {
        if (distXZ(pad.pos, p.pos) <= 1 && Math.abs(p.pos[1] - pad.pos[1]) < 0.05) {
          let dx, dz;
          if (pad.toward) {
            const L = Math.hypot(pad.toward[0] - p.pos[0], pad.toward[2] - p.pos[2]);
            dx = (pad.toward[0] - p.pos[0]) / L;
            dz = (pad.toward[2] - p.pos[2]) / L;
          } else [dx, dz] = pad.dir;
          p.launch = [dx * pad.speed, dz * pad.speed];
          p.vel[1] = pad.vy;
          p.grounded = false;
        }
      }
    }
    // fall off the island
    if (p.pos[1] < FALL_Y) {
      p.flames = Math.max(0, p.flames - 1);
      const lost = p.carried;
      p.carried = 0;
      p.dead = STD.fallWait;
      p.vel = [0, 0, 0];
      p.launch = null;
      p.dashLeft = 0;
      this.emit('player_hit', { by: 'fall', flames: p.flames, dropped: 0, lost });
    }
  }

  finish(result, reason) {
    this.tick--;
    this.emit('game_over', { result, reason });
    this.tick++;
    this.state = result;
    this.result = { result, reason };
  }

  // ---------------------------------------------------------------- output
  snapshot() {
    const p = this.player;
    const s = (ticks) => round3(ticks / TICK_RATE);
    return {
      type: 'snapshot',
      tick: this.tick,
      sim_tick: this.simTick,
      night: this.night,
      state: this.state === 'playing' && this.paused ? 'paused' : this.state,
      time_left_s: round3(Math.max(0, this.timeLeft())),
      score: this.score,
      wind: { active: this.wind.active, dir_deg: this.wind.dir_deg },
      player: {
        pos: vec3(p.pos), vel: vec3(p.vel), grounded: p.grounded, invuln: p.invuln > 0,
        dash_cd_s: s(p.dashCd), pulse_cd_s: s(p.pulseCd), charm_s: s(p.charm),
        flames: p.flames, carried: p.carried,
      },
      lanterns: this.lanterns.map((l) => ({ id: l.id, pos: vec3(l.pos), lit: l.lit, deposited: l.deposited })),
      shades: this.shades.map((sh) => ({ id: sh.id, pos: vec3(sh.pos), state: sh.state, state_ticks_left: sh.ticks })),
      motes_active: this.motes.length,
      motes: this.motes.map((m) => ({ id: m.id, pos: vec3(m.pos), kind: m.kind, ttl_s: m.ttl === null ? null : s(m.ttl) })),
      drifters: this.drifters.map((d) => ({ id: d.id, pos: vec3(d.pos), state: d.state, stolen: d.stolen })),
      charms: this.charms.map((c) => ({ id: c.id, pos: vec3(c.pos), available: c.available, respawn_s: s(c.respawn) })),
    };
  }
}

export function round3(x) {
  const r = Math.round(x * 1000) / 1000;
  return r === 0 ? 0 : r;
}
function vec3(v) {
  return [round3(v[0]), round3(v[1]), round3(v[2])];
}
