// Phase 1 acceptance tests — run the real headless CLI per Test Contract v1.0.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runHeadless, quiet, allLitExcept, TUNING as T } from './helpers.js';

const near = (a, b, eps = 1e-3) => Math.abs(a - b) <= eps;

test('C1 tick-0 snapshot: start at origin, 5 lanterns, full night, no input applied', () => {
  const r = runHeadless({ ticks: 0 });
  assert.equal(r.code, 0);
  const s = r.snaps[0];
  assert.equal(s.tick, 0);
  assert.equal(s.sim_tick, 0);
  assert.deepEqual(s.player.pos, [0, 0, 0]);
  assert.equal(s.player.flames, T.flames);
  assert.equal(s.lanterns.length, T.lantern_count_night1);
  assert.equal(s.time_left_s, T.night1_duration_s);
  assert.equal(s.state, 'playing');
  assert.ok(s.motes_active > 0 && s.shades.length > 0, 'default night spawns motes and shades');
  assert.deepEqual(r.end, { type: 'end', ticks: 0, state: 'playing', score: 0 });
});

test('C2 snapshots every 10 ticks by default, end line last, time_left counts down', () => {
  const r = runHeadless({ ticks: 95, scenario: quiet() });
  assert.deepEqual(r.snaps.map((s) => s.tick), [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95]);
  assert.equal(r.end.type, 'end');
  assert.equal(r.end.ticks, 95);
  assert.ok(near(r.snaps[6].time_left_s, T.night1_duration_s - 1));
  const r2 = runHeadless({ ticks: 100, every: 50, scenario: quiet() });
  assert.deepEqual(r2.snaps.map((s) => s.tick), [0, 50, 100]);
});

test('C3 determinism: same seed → identical output; different seed → different world', () => {
  const inputs = { frames: [{ tick: 0, move: [0.3, 1] }, { tick: 200, pulse: true }, { tick: 201, pulse: false }] };
  const a = runHeadless({ seed: 42, ticks: 1200, inputs });
  const b = runHeadless({ seed: 42, ticks: 1200, inputs });
  assert.equal(a.raw, b.raw);
  const c = runHeadless({ seed: 43, ticks: 1200, inputs });
  assert.notEqual(a.raw, c.raw);
});

test('C4 movement: player_speed m/s, camera yaw rotation, normalisation', () => {
  const fwd = runHeadless({ ticks: 60, scenario: quiet(), inputs: { frames: [{ tick: 0, move: [0, 1] }] } });
  assert.deepEqual(fwd.last.player.pos, [0, 0, T.player_speed]);
  const yaw = runHeadless({ ticks: 60, scenario: quiet(), inputs: { frames: [{ tick: 0, move: [0, 1], cam_yaw_deg: 90 }] } });
  assert.deepEqual(yaw.last.player.pos, [T.player_speed, 0, 0]);
  const diag = runHeadless({ ticks: 60, scenario: quiet(), inputs: { frames: [{ tick: 0, move: [1, 1] }] } });
  const [x, , z] = diag.last.player.pos;
  assert.ok(near(Math.hypot(x, z), T.player_speed, 0.01), 'diagonal normalised to length 1');
  // move [1,0] at yaw 0 is +X
  const right = runHeadless({ ticks: 60, scenario: quiet(), inputs: { frames: [{ tick: 0, move: [1, 0] }] } });
  assert.deepEqual(right.last.player.pos, [T.player_speed, 0, 0]);
});

test('C5 jump on rising edge: goes up and lands back on y=0', () => {
  const r = runHeadless({ ticks: 120, every: 5, scenario: quiet(), inputs: { frames: [{ tick: 0, jump: true }] } });
  assert.ok(r.snaps.some((s) => s.player.pos[1] > 0.5));
  assert.equal(r.last.player.pos[1], 0);
});

test('C6 mote pickup within pickup_radius: event, carried, score', () => {
  const r = runHeadless({ ticks: 120, scenario: quiet({ motes: [[0, 0, 5]] }), inputs: { frames: [{ tick: 0, move: [0, 1] }] } });
  const ev = r.ev('mote_picked');
  assert.equal(ev.length, 1);
  assert.deepEqual(ev[0].data, { carried: 1 });
  // reaches z = 5 - pickup_radius after ceil((5 - r) / (speed/60)) steps
  assert.equal(ev[0].tick, Math.ceil(((5 - T.pickup_radius) / T.player_speed) * 60 - 1e-9));
  assert.equal(r.last.player.carried, 1);
  assert.equal(r.last.motes_active, 0);
  assert.equal(r.end.score, T.score.per_mote);
});

test('C7 carry_capacity: cannot pick when full', () => {
  const r = runHeadless({ ticks: 5, scenario: quiet({ player: { carried: T.carry_capacity }, motes: [[0, 0, 0]] }) });
  assert.equal(r.ev('mote_picked').length, 0);
  assert.equal(r.last.motes_active, 1);
});

test('C8 deposit partial then light lantern on interact (rising edge)', () => {
  const scenario = quiet({ player: { pos: [0, 0, 23], carried: 3 }, lanterns: [{ id: 'L1', pos: [0, 0, 25] }] });
  const inputs = { frames: [{ tick: 0, interact: true }, { tick: 1, interact: false }, { tick: 2, interact: true }] };
  const r = runHeadless({ ticks: 10, scenario, inputs });
  const dep = r.ev('deposit');
  assert.equal(dep.length, 1, 'second press has nothing to deposit');
  assert.deepEqual(dep[0], { type: 'event', tick: 1, name: 'deposit', data: { lantern_id: 'L1', amount: 3, deposited: 3 } });
  assert.equal(r.ev('lantern_lit').length, 0);

  const r2 = runHeadless({
    ticks: 10,
    scenario: quiet({ player: { pos: [0, 0, 23], carried: 7 }, lanterns: [{ id: 'L1', pos: [0, 0, 25], deposited: 3 }] }),
    inputs: { frames: [{ tick: 0, interact: true }] },
  });
  assert.deepEqual(r2.ev('deposit')[0].data, { lantern_id: 'L1', amount: 2, deposited: 5 });
  assert.deepEqual(r2.ev('lantern_lit')[0], { type: 'event', tick: 1, name: 'lantern_lit', data: { lantern_id: 'L1' } });
  assert.equal(r2.last.player.carried, 5);
  assert.equal(r2.end.score, T.score.per_lantern);
});

test('C9 interact outside interact_radius does nothing', () => {
  const r = runHeadless({
    ticks: 5,
    scenario: quiet({ player: { pos: [0, 0, 25 - T.interact_radius - 0.1], carried: 5 }, lanterns: [{ id: 'L1', pos: [0, 0, 25] }] }),
    inputs: { frames: [{ tick: 0, interact: true }] },
  });
  assert.equal(r.ev('deposit').length, 0);
});

test('C10 win: lighting the last lantern → won/all_lit with time + flame bonus', () => {
  const scenario = quiet({
    player: { pos: [0, 0, 24], carried: T.lantern_cost },
    lanterns: [{ id: 'L1', pos: [0, 0, 25] }, ...allLitExcept('L1')],
  });
  const r = runHeadless({ ticks: 600, scenario, inputs: { frames: [{ tick: 0, interact: true }] } });
  const go = r.ev('game_over');
  assert.deepEqual(go[0], { type: 'event', tick: 1, name: 'game_over', data: { result: 'won', reason: 'all_lit' } });
  const left = Math.floor(T.night1_duration_s - 1 / 60);
  const expected = T.score.per_lantern + T.score.per_second_left * left + T.score.per_flame_left * T.flames;
  assert.deepEqual(r.end, { type: 'end', ticks: 1, state: 'won', score: expected });
  assert.equal(r.last.state, 'won');
  // pre-lit lanterns in scenario give no points / no events
  assert.equal(r.ev('lantern_lit').length, 1);
});

test('C11 pulse: costs light, stuns + pushes shades in radius, cooldown, needs enough light', () => {
  const scenario = quiet({
    player: { carried: T.pulse_cost * 2 },
    shades: [{ id: 'A', pos: [3, 1, 0] }, { id: 'B', pos: [T.pulse_radius + 2, 1, 0] }],
  });
  const inputs = { frames: [{ tick: 0, pulse: true }, { tick: 1, pulse: false }, { tick: 10, pulse: true }] };
  const r = runHeadless({ ticks: 20, every: 1, scenario, inputs });
  const p = r.ev('pulse');
  assert.equal(p.length, 1, 'second pulse blocked by cooldown');
  assert.deepEqual(p[0].data, { stunned_ids: ['A'] });
  const s1 = r.snaps[1];
  const A = s1.shades.find((s) => s.id === 'A');
  assert.equal(A.state, 'stunned');
  assert.ok(near(A.pos[0], 3 + T.pulse_push_m), 'pushed pulse_push_m away');
  assert.equal(s1.player.carried, T.pulse_cost);
  assert.equal(r.end.score, T.score.per_stun);
  // stun lasts pulse_stun_s
  const stunTicks = Math.round(T.pulse_stun_s * 60);
  const r2 = runHeadless({ ticks: stunTicks + 2, every: 1, scenario, inputs: { frames: [{ tick: 0, pulse: true }] } });
  assert.equal(r2.snaps[stunTicks].shades.find((s) => s.id === 'A').state, 'stunned');
  assert.equal(r2.snaps[stunTicks + 1].shades.find((s) => s.id === 'A').state, 'chase');
  // not enough light → no pulse
  const r3 = runHeadless({ ticks: 5, scenario: quiet({ player: { carried: T.pulse_cost - 1 } }), inputs: { frames: [{ tick: 0, pulse: true }] } });
  assert.equal(r3.ev('pulse').length, 0);
});

test('C12 shade chases at shade_speed and hits: lose flame, drop ratio, invulnerability', () => {
  const chase = runHeadless({ ticks: 60, scenario: quiet({ shades: [{ id: 'S1', pos: [20, 1, 0] }] }) });
  assert.ok(near(chase.last.shades[0].pos[0], 20 - T.shade_speed, 0.01));
  const r = runHeadless({
    ticks: 120,
    every: 1,
    scenario: quiet({ player: { carried: 4 }, shades: [{ id: 'S1', pos: [0.5, 1, 0] }] }),
  });
  const hits = r.ev('player_hit');
  assert.deepEqual(hits[0], {
    type: 'event', tick: 1, name: 'player_hit',
    data: { by: 'shade', flames: T.flames - 1, dropped: Math.floor(4 * T.hit_drop_ratio) },
  });
  assert.equal(hits[1].tick, 1 + Math.round(T.invuln_s * 60), 'next hit only after invuln_s');
});

test('C13 lose: no flames → lost/no_flames; dawn → lost/dawn', () => {
  const r = runHeadless({ ticks: 100, scenario: quiet({ player: { flames: 1 }, shades: [{ pos: [0, 1, 0] }] }) });
  assert.deepEqual(r.ev('game_over')[0].data, { result: 'lost', reason: 'no_flames' });
  assert.equal(r.end.state, 'lost');
  assert.equal(r.end.ticks, 1);
  const d = runHeadless({ ticks: 1000, scenario: quiet({ time_left_s: 1 }) });
  assert.deepEqual(d.ev('game_over')[0], { type: 'event', tick: 60, name: 'game_over', data: { result: 'lost', reason: 'dawn' } });
  assert.deepEqual(d.end, { type: 'end', ticks: 60, state: 'lost', score: 0 });
  assert.equal(d.last.time_left_s, 0);
});

test('C14 shades never enter safe_radius of a lit lantern; player inside is safe', () => {
  const r = runHeadless({
    ticks: 600,
    every: 1,
    scenario: quiet({
      player: { pos: [0, 0, 25] },
      lanterns: [{ id: 'L1', pos: [0, 0, 25], lit: true }],
      shades: [{ id: 'S1', pos: [0, 1, 40] }, { id: 'S2', pos: [0, 1, 26] }],
    }),
  });
  for (const s of r.snaps) for (const sh of s.shades) {
    assert.ok(Math.hypot(sh.pos[0], sh.pos[2] - 25) > T.safe_radius, `tick ${s.tick} ${sh.id} inside safe zone`);
  }
  assert.equal(r.ev('player_hit').length, 0);
  assert.equal(r.end.score, 0, 'pre-lit lantern gives no points');
});

test('C15 random spawning: shades spawn with events and unique ids; off when random_shades=false', () => {
  const r = runHeadless({ seed: 5, ticks: 60 * 65, scenario: { player: { flames: 1000 } } });
  const sp = r.ev('shade_spawned');
  assert.ok(sp.length >= 2);
  const ids = r.snaps.at(-1).shades.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  const q = runHeadless({ seed: 5, ticks: 60 * 65, scenario: { player: { flames: 1000 }, random_shades: false, shades: [] } });
  assert.equal(q.ev('shade_spawned').length, 0);
});

test('C16 errors: malformed inputs/scenario → exit 2; bad usage → non-zero + stderr', () => {
  const bad1 = runHeadless({ inputs: { frames: [{ tick: 5 }, { tick: 5 }] } });
  assert.equal(bad1.code, 2);
  assert.match(bad1.stderr, /strictly increasing/);
  assert.equal(runHeadless({ inputs: '{not json' }).code, 2);
  assert.equal(runHeadless({ inputs: { frames: [{ tick: 0, move: [2, 0] }] } }).code, 2);
  assert.equal(runHeadless({ scenario: { lanterns: [{ id: 'L9' }] } }).code, 2);
  assert.equal(runHeadless({ scenario: { player: { pos: [0, 0] } } }).code, 2);
  const usage = runHeadless({ extra: ['--bogus'] });
  assert.notEqual(usage.code, 0);
  assert.ok(usage.stderr.length > 0);
});

test('C17 coordinates rounded to 3 decimals', () => {
  const r = runHeadless({ ticks: 7, scenario: quiet(), inputs: { frames: [{ tick: 0, move: [0.3, 0.7] }] }, every: 7 });
  for (const v of r.last.player.pos) assert.equal(v, Math.round(v * 1000) / 1000);
});
