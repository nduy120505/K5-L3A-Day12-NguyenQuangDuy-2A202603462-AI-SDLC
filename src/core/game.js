// Pure game logic for Đảo Đèn Lồng. No DOM / three.js imports.
// Fixed 60 ticks/s. All randomness via seeded RNG.
import { createRng } from './rng.js';

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;

// World constants that are NOT part of the contract tuning (layout / spawning).
export const WORLD = {
  islandRadius: 40,
  lanternRingRadius: 25,
  initialMotes: 30,
  maxMotes: 30,
  moteRespawnS: 3,
  moteMinR: 3,
  moteMaxR: 37,
  initialShades: 2,
  shadeSpawnEveryS: 30,
  maxShades: 6,
  shadeSpawnR: 38,
  shadeY: 1,
  jumpSpeed: 7,
  gravity: 20,
};

const BUTTONS = ['jump', 'interact', 'pulse', 'dash'];

function distXZ(a, b) {
  const dx = a[0] - b[0];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dz * dz);
}

function secondsToTicks(s) {
  return Math.round(s * TICK_RATE);
}

export function emptyInput() {
  return { move: [0, 0], cam_yaw_deg: 0, jump: false, interact: false, pulse: false, dash: false };
}

export class Game {
  /**
   * @param {object} tuning  contract "tuning" object
   * @param {object} opts    { seed, scenario, onEvent(evt) }
   */
  constructor(tuning, { seed = 0, scenario = null, onEvent = null } = {}) {
    this.t = tuning;
    this.seed = seed;
    this.rng = createRng(seed);
    this.onEvent = onEvent;
    this.events = [];
    this.steps = 0;
    this.state = 'playing';
    this.result = null;
    this.score = 0;
    this.duration = tuning.night1_duration_s;
    this.prevButtons = { jump: false, interact: false, pulse: false, dash: false };
    this.randomMotes = true;
    this.randomShades = true;
    this.nextMoteN = 1;
    this.nextShadeN = 1;
    this.moteTimer = 0;
    this.shadeTimer = 0;
    this.pulseCooldown = 0;
    this.player = {
      pos: [0, 0, 0],
      vy: 0,
      grounded: true,
      flames: tuning.flames,
      carried: 0,
      invuln: 0,
      facing: 0,
    };
    this.lanterns = [];
    const n = tuning.lantern_count_night1;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = WORLD.lanternRingRadius;
      this.lanterns.push({
        id: `L${i + 1}`,
        pos: [round3(Math.sin(a) * r), 0, round3(Math.cos(a) * r)],
        lit: false,
        deposited: 0,
      });
    }
    this.motes = [];
    this.shades = [];
    if (scenario) this.applyScenario(scenario);
    if (!scenario || scenario.motes === undefined) {
      if (this.randomMotes) for (let i = 0; i < WORLD.initialMotes; i++) this.spawnMote(false);
    }
    if (!scenario || scenario.shades === undefined) {
      if (this.randomShades) for (let i = 0; i < WORLD.initialShades; i++) this.spawnShade(false);
    }
    for (const s of this.shades) this.keepOutOfSafeZones(s);
  }

  applyScenario(sc) {
    if (sc.random_motes !== undefined) this.randomMotes = sc.random_motes;
    if (sc.random_shades !== undefined) this.randomShades = sc.random_shades;
    if (sc.player) {
      if (sc.player.pos) this.player.pos = [...sc.player.pos];
      if (sc.player.carried !== undefined) this.player.carried = sc.player.carried;
      if (sc.player.flames !== undefined) this.player.flames = sc.player.flames;
      this.player.grounded = this.player.pos[1] <= 0;
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
      this.motes = [];
      for (const m of sc.motes) {
        const pos = Array.isArray(m) ? m : m.pos;
        this.motes.push({ id: `M${this.nextMoteN++}`, pos: [pos[0], 0, pos[2]] });
      }
    }
    if (sc.shades !== undefined) {
      this.shades = [];
      for (const s of sc.shades) {
        this.shades.push({ id: s.id ?? null, pos: [...s.pos], state: 'chase', stun: 0 });
      }
      for (const s of this.shades) if (s.id === null) s.id = this.newShadeId();
    }
  }

  newShadeId() {
    let id;
    do {
      id = `S${this.nextShadeN++}`;
    } while (this.shades.some((s) => s.id === id));
    return id;
  }

  emit(name, data) {
    const evt = { type: 'event', tick: this.steps + 1, name, data };
    this.events.push(evt);
    if (this.onEvent) this.onEvent(evt);
  }

  spawnMote() {
    const a = this.rng() * Math.PI * 2;
    const r = Math.sqrt(this.rng()) * (WORLD.moteMaxR - WORLD.moteMinR) + WORLD.moteMinR;
    this.motes.push({ id: `M${this.nextMoteN++}`, pos: [Math.sin(a) * r, 0, Math.cos(a) * r] });
  }

  spawnShade(withEvent) {
    const a = this.rng() * Math.PI * 2;
    const r = WORLD.shadeSpawnR;
    const s = {
      id: this.newShadeId(),
      pos: [Math.sin(a) * r, WORLD.shadeY, Math.cos(a) * r],
      state: 'chase',
      stun: 0,
    };
    this.keepOutOfSafeZones(s);
    this.shades.push(s);
    if (withEvent) this.emit('shade_spawned', { id: s.id });
  }

  keepOutOfSafeZones(s) {
    const R = this.t.safe_radius;
    if (!R) return;
    for (const l of this.lanterns) {
      if (!l.lit) continue;
      const d = distXZ(s.pos, l.pos);
      if (d <= R) {
        let dx = s.pos[0] - l.pos[0];
        let dz = s.pos[2] - l.pos[2];
        if (d < 1e-9) {
          dx = 1;
          dz = 0;
        } else {
          dx /= d;
          dz /= d;
        }
        const target = R + 0.01;
        s.pos[0] = l.pos[0] + dx * target;
        s.pos[2] = l.pos[2] + dz * target;
      }
    }
  }

  litCount() {
    return this.lanterns.filter((l) => l.lit).length;
  }

  timeLeft() {
    return this.duration - this.steps / TICK_RATE;
  }

  /** Advance one tick with the given (held) input state. */
  step(input) {
    if (this.state !== 'playing') return;
    const t = this.t;
    const p = this.player;
    const edge = {};
    for (const b of BUTTONS) {
      const v = !!input[b];
      edge[b] = v && !this.prevButtons[b];
      this.prevButtons[b] = v;
    }
    if (p.invuln > 0) p.invuln--;
    if (this.pulseCooldown > 0) this.pulseCooldown--;
    for (const s of this.shades) {
      if (s.state === 'stunned' && --s.stun <= 0) {
        s.stun = 0;
        s.state = 'chase';
      }
    }

    // 1. Movement (camera-relative, normalised if length > 1)
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
    p.pos[0] += wx * t.player_speed * DT;
    p.pos[2] += wz * t.player_speed * DT;
    if (wx !== 0 || wz !== 0) p.facing = Math.atan2(wx, wz);
    // fall_enabled = false → island edge is a soft wall
    const r = Math.hypot(p.pos[0], p.pos[2]);
    if (r > WORLD.islandRadius) {
      p.pos[0] *= WORLD.islandRadius / r;
      p.pos[2] *= WORLD.islandRadius / r;
    }
    // Jump
    if (edge.jump && p.grounded) {
      p.vy = WORLD.jumpSpeed;
      p.grounded = false;
    }
    if (!p.grounded) {
      p.pos[1] += p.vy * DT;
      p.vy -= WORLD.gravity * DT;
      if (p.pos[1] <= 0) {
        p.pos[1] = 0;
        p.vy = 0;
        p.grounded = true;
      }
    }

    // 2. Pickup motes (automatic, within pickup_radius, if capacity allows)
    for (let i = 0; i < this.motes.length && p.carried < t.carry_capacity; ) {
      if (distXZ(this.motes[i].pos, p.pos) <= t.pickup_radius) {
        this.motes.splice(i, 1);
        p.carried++;
        this.score += t.score.per_mote;
        this.emit('mote_picked', { carried: p.carried });
      } else i++;
    }

    // 3. Interact → deposit into nearest unlit lantern within interact_radius
    if (edge.interact && p.carried > 0) {
      let best = null;
      let bestD = Infinity;
      for (const l of this.lanterns) {
        if (l.lit) continue;
        const d = distXZ(l.pos, p.pos);
        if (d <= t.interact_radius && d < bestD) {
          best = l;
          bestD = d;
        }
      }
      if (best) {
        const amount = Math.min(p.carried, t.lantern_cost - best.deposited);
        if (amount > 0) {
          p.carried -= amount;
          best.deposited += amount;
          this.emit('deposit', { lantern_id: best.id, amount, deposited: best.deposited });
        }
        if (best.deposited >= t.lantern_cost) {
          best.lit = true;
          this.score += t.score.per_lantern;
          this.emit('lantern_lit', { lantern_id: best.id });
          for (const s of this.shades) this.keepOutOfSafeZones(s);
        }
      }
    }

    // 4. Pulse: costs light, stuns + pushes shades within pulse_radius
    if (edge.pulse && this.pulseCooldown === 0 && p.carried >= t.pulse_cost) {
      p.carried -= t.pulse_cost;
      this.pulseCooldown = secondsToTicks(t.pulse_cooldown_s);
      const ids = [];
      for (const s of this.shades) {
        const d = distXZ(s.pos, p.pos);
        if (d <= t.pulse_radius) {
          ids.push(s.id);
          s.state = 'stunned';
          s.stun = secondsToTicks(t.pulse_stun_s);
          let dx = s.pos[0] - p.pos[0];
          let dz = s.pos[2] - p.pos[2];
          if (d < 1e-9) {
            dx = 1;
            dz = 0;
          } else {
            dx /= d;
            dz /= d;
          }
          s.pos[0] += dx * t.pulse_push_m;
          s.pos[2] += dz * t.pulse_push_m;
          this.keepOutOfSafeZones(s);
        }
      }
      this.score += t.score.per_stun * ids.length;
      this.emit('pulse', { stunned_ids: ids });
    }

    // 5. Shades: chase player (XZ), stunned ones wait
    for (const s of this.shades) {
      if (s.state === 'stunned') continue;
      const dx = p.pos[0] - s.pos[0];
      const dz = p.pos[2] - s.pos[2];
      const d = Math.hypot(dx, dz);
      const stepLen = Math.min(t.shade_speed * DT, d);
      if (d > 1e-9) {
        s.pos[0] += (dx / d) * stepLen;
        s.pos[2] += (dz / d) * stepLen;
      }
      this.keepOutOfSafeZones(s);
    }

    // 6. Shade hits player
    if (p.invuln === 0) {
      for (const s of this.shades) {
        if (s.state === 'stunned') continue;
        if (distXZ(s.pos, p.pos) <= t.shade_hit_radius) {
          p.flames = Math.max(0, p.flames - 1);
          const dropped = Math.floor(p.carried * t.hit_drop_ratio);
          p.carried -= dropped;
          p.invuln = secondsToTicks(t.invuln_s);
          this.emit('player_hit', { by: 'shade', flames: p.flames, dropped });
          break;
        }
      }
    }

    // 7. Spawning (only when random spawning is enabled)
    if (this.randomMotes) {
      this.moteTimer++;
      if (this.moteTimer >= secondsToTicks(WORLD.moteRespawnS)) {
        this.moteTimer = 0;
        if (this.motes.length < WORLD.maxMotes) this.spawnMote();
      }
    }
    if (this.randomShades) {
      this.shadeTimer++;
      if (this.shadeTimer >= secondsToTicks(WORLD.shadeSpawnEveryS)) {
        this.shadeTimer = 0;
        if (this.shades.length < WORLD.maxShades) this.spawnShade(true);
      }
    }

    // 8. Advance time, check end conditions
    this.steps++;
    if (this.lanterns.length > 0 && this.litCount() === this.lanterns.length) {
      const left = Math.max(0, this.timeLeft());
      this.score += t.score.per_second_left * Math.floor(left + 1e-9) + t.score.per_flame_left * p.flames;
      this.finish('won', 'all_lit');
    } else if (p.flames <= 0) {
      this.finish('lost', 'no_flames');
    } else if (this.timeLeft() <= 1e-9) {
      this.finish('lost', 'dawn');
    }
  }

  finish(result, reason) {
    this.steps--; // emit with the tick of this step
    this.emit('game_over', { result, reason });
    this.steps++;
    this.state = result;
    this.result = { result, reason };
  }

  snapshot() {
    return {
      type: 'snapshot',
      tick: this.steps,
      sim_tick: this.steps,
      state: this.state,
      time_left_s: round3(Math.max(0, this.timeLeft())),
      score: this.score,
      player: { pos: vec3(this.player.pos), flames: this.player.flames, carried: this.player.carried },
      lanterns: this.lanterns.map((l) => ({ id: l.id, pos: vec3(l.pos), lit: l.lit, deposited: l.deposited })),
      shades: this.shades.map((s) => ({ id: s.id, pos: vec3(s.pos), state: s.state })),
      motes_active: this.motes.length,
      motes: this.motes.map((m) => ({ id: m.id, pos: vec3(m.pos) })),
    };
  }
}

export class ScenarioError extends Error {}

export function round3(x) {
  const r = Math.round(x * 1000) / 1000;
  return r === 0 ? 0 : r; // avoid -0
}

function vec3(v) {
  return [round3(v[0]), round3(v[1]), round3(v[2])];
}
