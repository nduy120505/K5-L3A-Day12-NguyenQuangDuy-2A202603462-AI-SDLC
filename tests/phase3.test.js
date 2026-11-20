// Ticket-03 "Đèn cạn dầu" — fuel, drain, new win rule, capacity, scoring (real headless CLI).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runHeadless, quiet } from './helpers.js';

const L1 = [0, 0, 25];
const hyp = (p, c = [0, 0, 0]) => Math.hypot(p[0] - c[0], p[2] - c[2]);
const lan = (r, tick, id = 'L1') => r.snaps[tick].lanterns.find((l) => l.id === id);

test('F1 fuel: first light sets 100, decays 1.0/s (exact), snapshot fuel 1 decimal, ever_lit', () => {
  const r = runHeadless({ ticks: 630, every: 1, scenario: quiet({ player: { pos: [0, 0, 24], carried: 10 } }), inputs: { frames: [{ tick: 0, interact: true }] } });
  assert.deepEqual(r.ev('lantern_lit')[0].data, { lantern_id: 'L1', relight: false });
  assert.equal(lan(r, 1).fuel, 100);
  assert.equal(lan(r, 601).fuel, 90);
  assert.equal(lan(r, 631 - 1).fuel, 89.5);
  assert.equal(lan(r, 1).ever_lit, true);
  assert.equal(lan(r, 1, 'L2').fuel, 0);
});

test('F2 refuel: used = min(carried, ceil((100−fuel)/10)), +5 each, event refuel; full lanterns are skipped', () => {
  const r = runHeadless({ ticks: 3, scenario: quiet({ player: { pos: [0, 0, 24], carried: 10 }, lanterns: [{ id: 'L1', lit: true, fuel: 45 }] }), inputs: { frames: [{ tick: 0, interact: true }] } });
  assert.deepEqual(r.ev('refuel')[0], { type: 'event', tick: 1, name: 'refuel', data: { lantern_id: 'L1', amount: 6, fuel: 100 } });
  assert.equal(r.snaps.at(-1).player.carried, 4);
  assert.equal(r.end.score, 30);
  // Fuel decays in step 2 BEFORE interact (step 5), so a lantern set to 100 is at 99.98 when E is pressed:
  // it accepts exactly 1 mote (ceil(0.017 / 10) = 1). A truly full lantern would be skipped (used = 0).
  const nearlyFull = runHeadless({ ticks: 2, scenario: quiet({ player: { pos: [0, 0, 24], carried: 3 }, lanterns: [{ id: 'L1', lit: true }] }), inputs: { frames: [{ tick: 0, interact: true }] } });
  assert.deepEqual(nearlyFull.ev('refuel')[0].data, { lantern_id: 'L1', amount: 1, fuel: 100 });
});

test('F3 lantern_out at fuel ≤ 0 (deposited reset, ever_lit kept); relight costs 5, +40, relit_count', () => {
  const r = runHeadless({
    ticks: 40, every: 1,
    scenario: quiet({ player: { pos: [0, 0, 24], carried: 5 }, lanterns: [{ id: 'L1', lit: true, fuel: 0.5, deposited: 10 }] }),
    inputs: { frames: [{ tick: 35, interact: true }] },
  });
  assert.deepEqual(r.ev('lantern_out')[0], { type: 'event', tick: 30, name: 'lantern_out', data: { lantern_id: 'L1' } });
  assert.deepEqual([lan(r, 30).lit, lan(r, 30).fuel, lan(r, 30).deposited, lan(r, 30).ever_lit], [false, 0, 0, true]);
  assert.deepEqual(r.ev('deposit')[0].data, { lantern_id: 'L1', amount: 5, deposited: 5 });
  assert.deepEqual(r.ev('lantern_lit')[0].data, { lantern_id: 'L1', relight: true });
  assert.equal(lan(r, 36).relit_count, 1);
  assert.equal(lan(r, 36).fuel, 100);
  assert.equal(r.end.score, 25 + 40);
});

test('F4 safe zone only while fuel ≥ 30 (exactly 30 still safe)', () => {
  const run = (fuel) =>
    runHeadless({ ticks: 120, scenario: quiet({ player: { pos: L1 }, lanterns: [{ id: 'L1', lit: true, fuel }], shades: [{ id: 'S1', pos: [0, 1, 33], state: 'chase' }] }) });
  assert.equal(run(25).ev('player_hit').length, 1, 'fuel 25 → no protection');
  assert.equal(run(32).ev('player_hit').length, 0, 'fuel ≥ 30 for the whole run → protected');
});

test('F5 wander shade goes to the weak lantern, drains 5/s (+1/s decay), fuel_drain every 60 ticks', () => {
  const r = runHeadless({
    ticks: 200, every: 1,
    scenario: quiet({ player: { pos: [0, 0, -30] }, lanterns: [{ id: 'L1', lit: true, fuel: 25 }], shades: [{ id: 'S1', pos: [0, 1, 20], state: 'wander' }] }),
  });
  const t0 = r.snaps.findIndex((s) => s.shades[0].state === 'drain');
  assert.ok(t0 > 0, 'reached drain');
  assert.ok(hyp(r.snaps[t0].shades[0].pos, L1) <= 2);
  const f0 = lan(r, t0).fuel;
  assert.ok(Math.abs(lan(r, t0 + 60).fuel - (f0 - 6)) < 0.11, `${f0} → ${lan(r, t0 + 60).fuel}`);
  const ev = r.ev('fuel_drain');
  assert.equal(ev[0].tick, t0 + 60);
  assert.equal(ev[0].data.shade_id, 'S1');
  assert.equal(ev[0].data.lantern_id, 'L1');
});

test('F6 drain → chase when Mây comes within 6 m; → wander when lantern goes out', () => {
  const chase = runHeadless({
    ticks: 3, every: 1,
    scenario: quiet({ player: { pos: [0, 0, 18.5] }, lanterns: [{ id: 'L1', lit: true, fuel: 20 }], shades: [{ id: 'S1', pos: [0, 1, 24], state: 'drain', target_lantern_id: 'L1' }] }),
  });
  assert.equal(chase.snaps[1].shades[0].state, 'chase');
  const out = runHeadless({
    ticks: 30, every: 1,
    scenario: quiet({ player: { pos: [0, 0, -30] }, lanterns: [{ id: 'L1', lit: true, fuel: 0.2 }], shades: [{ id: 'S1', pos: [0, 1, 24], state: 'drain', target_lantern_id: 'L1' }] }),
  });
  assert.equal(out.ev('lantern_out').length, 1);
  assert.notEqual(out.snaps[out.ev('lantern_out')[0].tick].shades[0].state, 'drain');
});

test('F7 refuel to ≥ 30 with a draining shade inside → it wanders and is pushed to the 6 m edge within 30 ticks, harmless', () => {
  const r = runHeadless({
    ticks: 60, every: 1,
    scenario: quiet({
      player: { pos: [0, 0, 26.5], carried: 5, invuln_ticks: 0 },
      lanterns: [{ id: 'L1', lit: true, fuel: 20 }],
      shades: [{ id: 'S1', pos: [0, 1, 23.5], state: 'drain', target_lantern_id: 'L1' }],
    }),
    inputs: { frames: [{ tick: 0, interact: true }] },
  });
  assert.equal(r.ev('refuel')[0].data.fuel, 69.9, '20 − (1 decay + 5 drain)/60 + 50');
  assert.ok(hyp(r.snaps[31].shades[0].pos, L1) >= 6 - 1e-3);
  assert.equal(r.ev('player_hit').length, 0);
});

test('F8 pulse on a draining shade scores 15 total (5 otherwise)', () => {
  const r = runHeadless({
    ticks: 2,
    scenario: quiet({ player: { pos: [0, 0, 28], carried: 3 }, lanterns: [{ id: 'L1', lit: true, fuel: 20 }], shades: [{ id: 'S1', pos: [0, 1, 24], state: 'drain', target_lantern_id: 'L1' }] }),
    inputs: { frames: [{ tick: 0, pulse: true }] },
  });
  assert.deepEqual(r.ev('pulse')[0].data, { stunned_ids: ['S1'] });
  assert.equal(r.end.score, 15);
});

test('F9 capacity = 10 + 2 × successful_lights (max 20); grows on each light/relight', () => {
  assert.equal(runHeadless({ ticks: 0, scenario: quiet({ player: { successful_lights: 2 } }) }).snaps[0].player.capacity, 14);
  assert.equal(runHeadless({ ticks: 0, scenario: quiet({ player: { successful_lights: 9 } }) }).snaps[0].player.capacity, 20);
  const r = runHeadless({ ticks: 2, scenario: quiet({ player: { pos: [0, 0, 24], carried: 10 } }), inputs: { frames: [{ tick: 0, interact: true }] } });
  assert.equal(r.last.player.capacity, 12);
  const pre = runHeadless({ ticks: 0, scenario: quiet({ lanterns: [{ id: 'L1', lit: true }] }) });
  assert.equal(pre.snaps[0].player.capacity, 10, 'scenario-lit lanterns do not count');
});

test('F10 dawn: < 60 % lit → lost/dawn; no flames on the last tick → no_flames wins over dawn', () => {
  const d = runHeadless({ ticks: 100, scenario: quiet({ time_left_s: 1, lanterns: [{ id: 'L1', lit: true }, { id: 'L2', lit: true }] }) });
  assert.deepEqual(d.ev('game_over')[0].data, { result: 'lost', reason: 'dawn' });
  const f = runHeadless({
    ticks: 100,
    scenario: quiet({ time_left_s: 1, player: { flames: 1 }, lanterns: [{ id: 'L1', lit: true }, { id: 'L2', lit: true }, { id: 'L3', lit: true }], shades: [{ id: 'S1', pos: [4.98, 1, 0], state: 'chase' }] }),
  });
  assert.deepEqual(f.ev('game_over')[0], { type: 'event', tick: 60, name: 'game_over', data: { result: 'lost', reason: 'no_flames' } });
});

test('F11 thresholds per night: 4/6 on night 2, 5/7 on night 3', () => {
  const lit = (n) => Array.from({ length: n }, (_, i) => ({ id: `L${i + 1}`, lit: true }));
  assert.equal(runHeadless({ night: 2, ticks: 60, scenario: quiet({ time_left_s: 1, lanterns: lit(4) }) }).end.state, 'won');
  assert.equal(runHeadless({ night: 2, ticks: 60, scenario: quiet({ time_left_s: 1, lanterns: lit(3) }) }).end.state, 'lost');
  assert.equal(runHeadless({ night: 3, ticks: 60, scenario: quiet({ time_left_s: 1, lanterns: lit(5) }) }).end.state, 'won');
  assert.equal(runHeadless({ night: 3, ticks: 60, scenario: quiet({ time_left_s: 1, lanterns: lit(4) }) }).end.state, 'lost');
});

test('F12 scenario: lit without fuel defaults to 100; drain state accepted; bad fuel → exit 2', () => {
  const s = runHeadless({ ticks: 0, scenario: quiet({ lanterns: [{ id: 'L2', lit: true }] }) }).snaps[0];
  assert.equal(s.lanterns[1].fuel, 100);
  assert.equal(runHeadless({ scenario: { lanterns: [{ id: 'L1', fuel: 150 }] } }).code, 2);
});
