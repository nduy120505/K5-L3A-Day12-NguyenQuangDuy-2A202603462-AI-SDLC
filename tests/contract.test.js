// Phase 1 behaviour (regression) with Ticket-02 standard numbers — runs the real headless CLI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runHeadless, quiet, allLitExcept, TUNING as T } from './helpers.js';

const near = (a, b, eps = 1e-3) => Math.abs(a - b) <= eps;

test('C1 tick-0: night_start event, start at origin, 5 lanterns at standard positions, full night', () => {
  const r = runHeadless({ ticks: 0 });
  assert.equal(r.code, 0);
  assert.deepEqual(r.lines[0], { type: 'event', tick: 0, name: 'night_start', data: { night: 1 } });
  const s = r.snaps[0];
  assert.equal(s.tick, 0);
  assert.equal(s.sim_tick, 0);
  assert.equal(s.night, 1);
  assert.deepEqual(s.player.pos, [0, 0, 0]);
  assert.equal(s.player.flames, 3);
  assert.deepEqual(s.lanterns.map((l) => l.pos), [[0, 0, 25], [23.8, 0, 7.7], [14.7, 0, -20.2], [-14.7, 0, -20.2], [-23.8, 0, 7.7]]);
  assert.equal(s.time_left_s, 300);
  assert.equal(s.motes_active, 20);
  assert.equal(new Set(s.motes.map((m) => m.pos.join())).size, 20, '20 distinct spawn points');
  assert.equal(s.shades.length, 0, 'shades only appear at tick 300');
  for (const k of ['vel', 'grounded', 'invuln', 'dash_cd_s', 'pulse_cd_s', 'charm_s']) assert.ok(k in s.player, k);
  assert.deepEqual(s.wind, { active: false, dir_deg: null });
  assert.ok(Array.isArray(s.drifters) && Array.isArray(s.charms));
  assert.deepEqual(r.end, { type: 'end', ticks: 0, state: 'playing', score: 0 });
});

test('C2 snapshots every 10 ticks by default, end line last, time_left counts down', () => {
  const r = runHeadless({ ticks: 95, scenario: quiet() });
  assert.deepEqual(r.snaps.map((s) => s.tick), [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95]);
  assert.equal(r.end.ticks, 95);
  assert.ok(near(r.snaps[6].time_left_s, 299));
  const r2 = runHeadless({ ticks: 100, every: 50, scenario: quiet() });
  assert.deepEqual(r2.snaps.map((s) => s.tick), [0, 50, 100]);
});

test('C3 determinism on every night: same seed → identical; different seed → different', () => {
  const inputs = { frames: [{ tick: 0, move: [0.3, 1] }, { tick: 200, pulse: true }, { tick: 201, pulse: false }, { tick: 300, dash: true }] };
  for (const night of [1, 2, 3]) {
    const a = runHeadless({ night, seed: 42, ticks: 2400, inputs });
    const b = runHeadless({ night, seed: 42, ticks: 2400, inputs });
    assert.equal(a.raw, b.raw, `night ${night}`);
    assert.notEqual(a.raw, runHeadless({ night, seed: 43, ticks: 2400, inputs }).raw);
  }
});

test('C4 movement 6 m/s, camera yaw, normalisation, velocity reported', () => {
  const run = (frame) => runHeadless({ ticks: 60, scenario: quiet(), inputs: { frames: [{ tick: 0, ...frame }] } }).last.player;
  assert.deepEqual(run({ move: [0, 1] }).pos, [0, 0, 6]);
  assert.deepEqual(run({ move: [0, 1] }).vel, [0, 0, 6]);
  assert.deepEqual(run({ move: [0, 1], cam_yaw_deg: 90 }).pos, [6, 0, 0]);
  assert.deepEqual(run({ move: [1, 0] }).pos, [6, 0, 0]);
  const [x, , z] = run({ move: [1, 1] }).pos;
  assert.ok(near(Math.hypot(x, z), 6, 0.01));
});

test('C5 jump 7 m/s, gravity 20: apex ≈ 1.225 m, lands after ≈ 0.7 s, only from ground', () => {
  const r = runHeadless({ ticks: 60, every: 1, scenario: quiet(), inputs: { frames: [{ tick: 0, jump: true }, { tick: 20, jump: false }, { tick: 21, jump: true }] } });
  const ys = r.snaps.map((s) => s.player.pos[1]);
  assert.ok(near(Math.max(...ys), 1.225, 0.07));
  const land = r.snaps.findIndex((s, i) => i > 0 && s.player.grounded);
  assert.equal(land, 42, 'lands after exactly 0.7 s');
  assert.ok(ys.slice(22, 30).every((y, i) => y <= ys[21 + i] + 1e-9), 'mid-air jump ignored');
});

test('C6 mote pickup: XZ ≤ 1.0 and height ≤ 1.5; no score until deposited', () => {
  const r = runHeadless({ ticks: 120, scenario: quiet({ motes: [[0, 0, 5]] }), inputs: { frames: [{ tick: 0, move: [0, 1] }] } });
  const ev = r.ev('mote_picked');
  assert.deepEqual(ev[0].data, { carried: 1 });
  assert.equal(ev[0].tick, 40, '(5 - 1.0) m at 0.1 m/tick');
  assert.equal(r.end.score, 0);
  const high = runHeadless({ ticks: 5, scenario: quiet({ player: { pos: [0, 0, 0] }, motes: [[0, 2, 0]] }) });
  assert.equal(high.ev('mote_picked').length, 0, 'height difference 2 > 1.5');
});

test('C7 carry capacity 10', () => {
  const r = runHeadless({ ticks: 5, scenario: quiet({ player: { carried: 10 }, motes: [[0, 0, 0]] }) });
  assert.equal(r.ev('mote_picked').length, 0);
});

test('C8 deposit min(carried, missing), +10 per deposited mote, lantern remembers progress', () => {
  const sc = (carried, deposited = 0) => quiet({ player: { pos: [0, 0, 23.5], carried }, lanterns: [{ id: 'L1', deposited }] });
  const a = runHeadless({ ticks: 5, scenario: sc(4), inputs: { frames: [{ tick: 0, interact: true }] } });
  assert.deepEqual(a.ev('deposit')[0], { type: 'event', tick: 1, name: 'deposit', data: { lantern_id: 'L1', amount: 4, deposited: 4 } });
  assert.equal(a.end.score, 40);
  const b = runHeadless({ ticks: 5, scenario: sc(10, 7), inputs: { frames: [{ tick: 0, interact: true }] } });
  assert.deepEqual(b.ev('deposit')[0].data, { lantern_id: 'L1', amount: 3, deposited: 10 });
  assert.deepEqual(b.ev('lantern_lit')[0].data, { lantern_id: 'L1' });
  assert.equal(b.last.player.carried, 7);
  assert.equal(b.end.score, 30 + 100);
});

test('C9 interact radius 2.0; nearest unlit lantern, tie → smaller id', () => {
  const far = runHeadless({ ticks: 3, scenario: quiet({ player: { pos: [0, 0, 22.9], carried: 5 } }), inputs: { frames: [{ tick: 0, interact: true }] } });
  assert.equal(far.ev('deposit').length, 0);
  const tie = runHeadless({
    ticks: 3,
    scenario: quiet({ player: { pos: [0, 0, 0], carried: 5 }, lanterns: [{ id: 'L2', pos: [1, 0, 0] }, { id: 'L1', pos: [-1, 0, 0] }] }),
    inputs: { frames: [{ tick: 0, interact: true }] },
  });
  assert.equal(tie.ev('deposit')[0].data.lantern_id, 'L1');
});

test('C10 win: last lantern → won/all_lit, bonus floor(seconds left)×2 + 50×flames', () => {
  const scenario = quiet({ player: { pos: [0, 0, 24], carried: 10 }, lanterns: allLitExcept('L1') });
  const r = runHeadless({ ticks: 600, scenario, inputs: { frames: [{ tick: 0, interact: true }] } });
  assert.deepEqual(r.ev('game_over')[0], { type: 'event', tick: 1, name: 'game_over', data: { result: 'won', reason: 'all_lit' } });
  assert.deepEqual(r.end, { type: 'end', ticks: 1, state: 'won', score: 100 + 100 + 299 * 2 + 50 * 3 });
});

test('C11 win on the exact tick time runs out beats dawn', () => {
  const scenario = quiet({ time_left_s: 0.5, player: { pos: [0, 0, 24], carried: 10 }, lanterns: allLitExcept('L1') });
  const r = runHeadless({ ticks: 100, scenario, inputs: { frames: [{ tick: 29, interact: true }] } });
  assert.deepEqual(r.end, { type: 'end', ticks: 30, state: 'won', score: 200 + 150 });
});

test('C12 pulse: 3 motes, radius 5 (3D from feet+0.8), stun 120 ticks, push 4 m over 15 ticks, cooldown 3 s, +5 each', () => {
  const scenario = quiet({ player: { carried: 9, invuln_ticks: 1000 }, shades: [{ id: 'A', pos: [3, 1, 0] }, { id: 'B', pos: [6, 1, 0] }, { id: 'C', pos: [0, 6, 0] }] });
  const inputs = { frames: [{ tick: 0, pulse: true }, { tick: 1, pulse: false }, { tick: 100, pulse: true }, { tick: 101, pulse: false }, { tick: 180, pulse: true }] };
  const r = runHeadless({ ticks: 200, every: 1, scenario, inputs });
  const p = r.ev('pulse');
  assert.equal(p.length, 2, 'tick-100 press blocked by 3 s cooldown');
  assert.deepEqual(p[0].data, { stunned_ids: ['A'] }, 'B is 6 m away; C is 5.2 m above the pulse centre (3D distance)');
  assert.equal(p[1].tick, 181);
  const A = (tick) => r.snaps[tick].shades.find((s) => s.id === 'A');
  assert.equal(A(1).state, 'stunned');
  assert.ok(near(A(15).pos[0], 7, 0.01), 'pushed 4 m by tick 15');
  assert.ok(near(A(16).pos[0], 7, 0.01), 'push stops after 15 ticks');
  assert.equal(A(120).state, 'stunned');
  assert.equal(r.snaps[1].player.carried, 6);
  assert.equal(r.snaps[1].player.pulse_cd_s, 3);
  const r3 = runHeadless({ ticks: 3, scenario: quiet({ player: { carried: 2 } }), inputs: { frames: [{ tick: 0, pulse: true }] } });
  assert.equal(r3.ev('pulse').length, 0, 'not enough light');
});

test('C13 stun lasts exactly 120 ticks, then shade chases again', () => {
  const r = runHeadless({ ticks: 125, every: 1, scenario: quiet({ player: { carried: 3 }, shades: [{ id: 'A', pos: [3, 1, 0] }] }), inputs: { frames: [{ tick: 0, pulse: true }] } });
  assert.equal(r.snaps[120].shades[0].state, 'stunned');
  assert.equal(r.snaps[121].shades[0].state, 'chase');
  assert.equal(r.end.score, 5);
});

test('C14 shade chases at 4 m/s; hit: −1 flame, drop floor(n/2) in ring 1.5–2.5 m (ttl 480), invuln 90, recoil 2 m / 60 ticks', () => {
  const c = runHeadless({ ticks: 60, scenario: quiet({ shades: [{ id: 'S1', pos: [10, 1, 0] }] }) });
  assert.ok(near(c.last.shades[0].pos[0], 6, 0.01));
  const r = runHeadless({ ticks: 200, every: 1, scenario: quiet({ player: { carried: 5 }, shades: [{ id: 'S1', pos: [0.5, 1, 0] }] }) });
  const hits = r.ev('player_hit');
  assert.deepEqual(hits[0], { type: 'event', tick: 1, name: 'player_hit', data: { by: 'shade', flames: 2, dropped: 2 } });
  const s1 = r.snaps[1];
  assert.equal(s1.shades[0].state, 'recoil');
  assert.equal(s1.player.invuln, true);
  const dropped = s1.motes.filter((m) => m.kind === 'dropped');
  assert.equal(dropped.length, 2);
  for (const m of dropped) {
    assert.ok(Math.hypot(m.pos[0], m.pos[2]) >= 1.5 - 1e-3 && Math.hypot(m.pos[0], m.pos[2]) <= 2.5 + 1e-3);
    assert.equal(m.ttl_s, 8);
  }
  assert.ok(near(r.snaps[60].shades[0].pos[0], 0.4333 + 2, 0.01), 'recoiled 2 m from the contact point');
  assert.equal(r.snaps[61].shades[0].state, 'chase');
  assert.ok(hits[1].tick >= 91, 'no hit during invulnerability');
});

test('C15 lose: no flames → lost/no_flames; dawn → lost/dawn', () => {
  const r = runHeadless({ ticks: 100, scenario: quiet({ player: { flames: 1 }, shades: [{ pos: [0, 1, 0] }] }) });
  assert.deepEqual(r.ev('game_over')[0].data, { result: 'lost', reason: 'no_flames' });
  assert.equal(r.end.ticks, 1);
  const d = runHeadless({ ticks: 1000, scenario: quiet({ time_left_s: 1 }) });
  assert.deepEqual(d.end, { type: 'end', ticks: 60, state: 'lost', score: 0 });
});

test('C16 safe zone: shades blocked at 6 m edge of lit lanterns', () => {
  const r = runHeadless({
    ticks: 300, every: 1,
    scenario: quiet({ player: { pos: [0, 0, 25] }, lanterns: [{ id: 'L1', lit: true }], shades: [{ id: 'S1', pos: [0, 1, 35] }] }),
  });
  for (const s of r.snaps) assert.ok(Math.hypot(s.shades[0].pos[0], s.shades[0].pos[2] - 25) >= 6 - 1e-3);
  assert.equal(r.ev('player_hit').length, 0);
});

test('C17 errors: malformed inputs/scenario → exit 2; bad usage → non-zero + stderr', () => {
  assert.equal(runHeadless({ inputs: { frames: [{ tick: 5 }, { tick: 5 }] } }).code, 2);
  assert.equal(runHeadless({ inputs: '{not json' }).code, 2);
  assert.equal(runHeadless({ inputs: { frames: [{ tick: 0, move: [2, 0] }] } }).code, 2);
  assert.equal(runHeadless({ inputs: { frames: [{ tick: 0, dash: 1 }] } }).code, 2);
  assert.equal(runHeadless({ scenario: { lanterns: [{ id: 'L9' }] } }).code, 2);
  assert.equal(runHeadless({ scenario: { shades: [{ pos: [0, 0, 0], state: 'angry' }] } }).code, 2);
  const usage = runHeadless({ night: 4 });
  assert.notEqual(usage.code, 0);
  assert.ok(usage.stderr.length > 0);
});
