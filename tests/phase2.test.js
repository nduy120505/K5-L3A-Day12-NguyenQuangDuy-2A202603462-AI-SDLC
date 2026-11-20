// Ticket-02 new features — at least one headless scenario per feature (real CLI).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runHeadless, quiet } from './helpers.js';

const near = (a, b, eps = 1e-3) => Math.abs(a - b) <= eps;
const hyp = (p, c = [0, 0, 0]) => Math.hypot(p[0] - c[0], p[2] - c[2]);

test('P1 dash: 14 m/s for 12 ticks, cooldown 1.5 s from dash start, event dash', () => {
  const inputs = { frames: [{ tick: 0, move: [0, 1], dash: true }, { tick: 1, dash: false }, { tick: 30, dash: true }, { tick: 31, dash: false }, { tick: 90, dash: true }] };
  const r = runHeadless({ ticks: 100, every: 1, scenario: quiet(), inputs });
  assert.ok(near(r.snaps[12].player.pos[2], 2.8, 0.01));
  assert.ok(near(r.snaps[13].player.pos[2], 2.9, 0.01), 'back to 6 m/s');
  assert.deepEqual(r.ev('dash').map((e) => e.tick), [1, 91]);
  assert.equal(r.snaps[1].player.dash_cd_s, 1.5);
});

test('P2 dash with no input uses facing (+Z at start); in the air it keeps altitude', () => {
  const still = runHeadless({ ticks: 12, scenario: quiet(), inputs: { frames: [{ tick: 0, dash: true }] } });
  assert.deepEqual(still.last.player.pos, [0, 0, 2.8]);
  const air = runHeadless({ ticks: 40, every: 1, scenario: quiet(), inputs: { frames: [{ tick: 0, jump: true }, { tick: 10, move: [1, 0], dash: true }] } });
  const y = air.snaps.slice(11, 22).map((s) => s.player.pos[1]);
  assert.ok(y.every((v) => near(v, y[0], 1e-9)), `altitude kept during dash: ${y}`);
});

test('P3 fall off the island: −1 flame, lose all motes, 60-tick wait, respawn at start with invuln', () => {
  const r = runHeadless({ ticks: 260, every: 1, scenario: quiet({ player: { pos: [39, 0, 0], carried: 4, invuln_ticks: 500 } }), inputs: { frames: [{ tick: 0, move: [1, 0] }, { tick: 20, move: [0, 0] }] } });
  const hit = r.ev('player_hit');
  assert.equal(hit.length, 1, 'exactly once, ignores invuln');
  assert.deepEqual(hit[0].data, { by: 'fall', flames: 2, dropped: 0, lost: 4 });
  const t = hit[0].tick;
  assert.ok(r.snaps[t + 59].player.pos[1] <= -10, 'still waiting below the island');
  assert.deepEqual(r.snaps[t + 60].player.pos, [0, 0, 0]);
  assert.deepEqual(r.snaps[t + 60].player.vel.slice(1), [0, 0]);
  assert.equal(r.snaps[t + 60].player.invuln, true);
  const last = runHeadless({ ticks: 200, scenario: quiet({ player: { pos: [39, 0, 0], flames: 1 } }), inputs: { frames: [{ tick: 0, move: [1, 0] }] } });
  assert.deepEqual(last.ev('game_over')[0].data, { result: 'lost', reason: 'no_flames' });
});

test('P4 pause: tick advances, sim_tick/time freeze, state "paused", events paused/resumed', () => {
  const inputs = { frames: [{ tick: 0, move: [0, 1] }, { tick: 10, pause: true }, { tick: 11, pause: false }, { tick: 30, pause: true }] };
  const r = runHeadless({ ticks: 40, every: 1, scenario: quiet(), inputs });
  assert.deepEqual(r.ev('paused').map((e) => e.tick), [11]);
  assert.deepEqual(r.ev('resumed').map((e) => e.tick), [31]);
  assert.equal(r.snaps[20].state, 'paused');
  assert.equal(r.snaps[20].sim_tick, 10);
  assert.deepEqual(r.snaps[20].player.pos, r.snaps[11].player.pos);
  assert.equal(r.snaps[40].sim_tick, 20);
  assert.ok(near(r.snaps[40].time_left_s, 240 - 20 / 60));
});

test('P5 Gió Lạc: idle → chase (carry ≥ 5, ≤ 15 m) → steals min(3, n) → flee 240 ticks → removed; invuln does not protect', () => {
  const scenario = quiet({ player: { carried: 6, invuln_ticks: 1000 }, drifters: [{ id: 'D1', pos: [3, 1, 0] }] });
  const r = runHeadless({ night: 2, ticks: 300, every: 1, scenario });
  assert.equal(r.snaps[1].drifters[0].state, 'chase');
  const st = r.ev('drifter_steal');
  assert.equal(st.length, 1);
  assert.deepEqual(st[0].data, { drifter_id: 'D1', amount: 3, carried: 3 });
  assert.equal(r.snaps[st[0].tick].drifters[0].state, 'flee');
  assert.equal(r.snaps[st[0].tick].drifters[0].stolen, 3);
  assert.equal(r.snaps[st[0].tick + 239].drifters[0].state, 'flee');
  assert.equal(r.snaps[st[0].tick + 240].drifters[0].state, 'removed');
  assert.equal(r.ev('player_hit').length, 0, 'no flame lost');
  const idle = runHeadless({ night: 2, ticks: 30, scenario: quiet({ player: { carried: 4 }, drifters: [{ id: 'D1', pos: [3, 1, 0] }] }) });
  assert.equal(idle.last.drifters[0].state, 'idle', 'carrying < 5 → stays idle');
});

test('P6 pulse vs Gió Lạc: chase → flee without stealing; flee with loot → drops it (drifter_drop) and vanishes after 120 ticks', () => {
  const a = runHeadless({ night: 2, ticks: 5, every: 1, scenario: quiet({ player: { carried: 6 }, drifters: [{ id: 'D1', pos: [4, 1, 0], state: 'chase' }] }), inputs: { frames: [{ tick: 0, pulse: true }] } });
  assert.equal(a.snaps[1].drifters[0].state, 'flee');
  assert.equal(a.ev('drifter_steal').length, 0);
  const b = runHeadless({ night: 2, ticks: 130, every: 1, scenario: quiet({ player: { carried: 3 }, drifters: [{ id: 'D1', pos: [3, 1, 0], state: 'flee', stolen: 3 }] }), inputs: { frames: [{ tick: 0, pulse: true }] } });
  assert.deepEqual(b.ev('drifter_drop')[0], { type: 'event', tick: 1, name: 'drifter_drop', data: { drifter_id: 'D1', amount: 3 } });
  assert.equal(b.snaps[1].motes.filter((m) => m.kind === 'dropped').length, 3);
  assert.equal(b.snaps[120].drifters[0].state, 'flee');
  assert.equal(b.snaps[121].drifters[0].state, 'removed');
});

test('P7 Gió Lạc spawn schedule: night 2 at tick 1200 (D1), never on night 1 or when random_drifters=false', () => {
  const r = runHeadless({ night: 2, ticks: 1201, every: 1201, scenario: { player: { flames: 99 }, random_shades: false } });
  assert.deepEqual(r.last.drifters.map((d) => [d.id, d.state]), [['D1', 'idle']]);
  assert.equal(runHeadless({ night: 1, ticks: 1201, every: 1201, scenario: { player: { flames: 99 }, random_shades: false } }).last.drifters.length, 0);
  assert.equal(runHeadless({ night: 2, ticks: 1201, every: 1201, scenario: { player: { flames: 99 }, random_shades: false, random_drifters: false } }).last.drifters.length, 0);
});

test('P8 Bùa Gió: pickup → 600 ticks, speed 7.2 m/s, dash without cooldown, respawns after 2700 ticks', () => {
  const inputs = { frames: [{ tick: 1, move: [1, 0] }, { tick: 61, move: [0, 0], dash: true }, { tick: 62, dash: false }, { tick: 80, dash: true }] };
  const far = runHeadless({ night: 2, ticks: 5, scenario: quiet({ player: { pos: [33.9, 0, 0] } }) });
  assert.equal(far.ev('charm_picked').length, 0, '1.1 m away → not picked');
  const r2 = runHeadless({ night: 2, ticks: 100, every: 1, scenario: quiet({ player: { pos: [34, 0, 0] } }), inputs });
  assert.deepEqual(r2.ev('charm_picked')[0], { type: 'event', tick: 1, name: 'charm_picked', data: { charm_id: 'C1', charm_ticks: 600 } });
  assert.ok(near(r2.snaps[61].player.pos[0] - r2.snaps[1].player.pos[0], 7.2, 0.01), '7.2 m/s');
  assert.equal(r2.ev('dash').length, 2, 'second dash 18 ticks later allowed');
  assert.equal(r2.snaps[1].charms[0].available, false);
  assert.equal(r2.snaps[1].charms[0].respawn_s, 45);
  const back = runHeadless({ night: 2, ticks: 2702, every: 2701, scenario: quiet({ player: { pos: [34, 0, 0] } }), inputs: { frames: [{ tick: 1, move: [-1, 0] }, { tick: 30, move: [0, 0] }] } });
  assert.equal(back.snaps[1].charms[0].available, true, 'available again at tick 2701');
});

test('P9 night 2 jump pad: launch 14 m/s up, 24 m/s toward the other island, land there ≈ 1.4 s later', () => {
  const r = runHeadless({ night: 2, ticks: 120, every: 1, scenario: quiet({ player: { pos: [20, 0, 18] } }), inputs: { frames: [{ tick: 0, move: [-1, 0] }] } });
  const land = r.snaps.findIndex((s, i) => i > 2 && s.player.grounded);
  assert.ok(land >= 80 && land <= 90, `landed at tick ${land}`);
  assert.ok(hyp(r.snaps[land].player.pos, [70, 0, 0]) <= 28, 'on island B');
  assert.equal(r.ev('player_hit').length, 0);
  assert.ok(near(Math.hypot(r.snaps[2].player.vel[0], r.snaps[2].player.vel[2]), 24, 0.01), 'movement keys do not override launch');
});

test('P10 night 2 map: bridge connects the islands; stepping off it falls', () => {
  const ok = runHeadless({ night: 2, ticks: 600, scenario: quiet({ player: { pos: [20, 0, 0] } }), inputs: { frames: [{ tick: 0, move: [1, 0] }, { tick: 500, move: [0, 0] }] } });
  assert.equal(ok.ev('player_hit').length, 0);
  assert.ok(hyp(ok.last.player.pos, [70, 0, 0]) <= 28);
  const off = runHeadless({ night: 2, ticks: 200, scenario: quiet({ player: { pos: [35, 0, 0] } }), inputs: { frames: [{ tick: 0, move: [0, 1] }] } });
  assert.equal(off.ev('player_hit')[0].data.by, 'fall');
});

test('P11 night 3 tiers: cliffs are walls, ramp climbs to Y=3, jump pad lands on tier 2 (Y=6), tower blocks', () => {
  const wall = runHeadless({ night: 3, ticks: 120, scenario: quiet({ player: { pos: [0, 0, 30] } }), inputs: { frames: [{ tick: 0, move: [0, -1] }] } });
  assert.ok(wall.last.player.pos[2] >= 24 - 1e-3 && wall.last.player.pos[1] === 0, 'blocked by the 3 m cliff');
  const a = (30 * Math.PI) / 180;
  const ramp = runHeadless({ night: 3, ticks: 120, scenario: quiet({ player: { pos: [31 * Math.cos(a), 0, 31 * Math.sin(a)] } }), inputs: { frames: [{ tick: 0, move: [-Math.cos(a), -Math.sin(a)] }] } });
  assert.equal(ramp.last.player.pos[1], 3);
  assert.ok(hyp(ramp.last.player.pos) < 24);
  const pad = runHeadless({ night: 3, ticks: 120, scenario: quiet({ player: { pos: [0, 3, 13] } }) });
  assert.equal(pad.last.player.pos[1], 6);
  assert.ok(hyp(pad.last.player.pos) < 8 && hyp(pad.last.player.pos) >= 2);
  const tower = runHeadless({ night: 3, ticks: 120, scenario: quiet({ player: { pos: [0, 6, 6] } }), inputs: { frames: [{ tick: 0, move: [0, -1] }] } });
  assert.ok(hyp(tower.last.player.pos) >= 2 - 1e-3, 'cannot enter the bell tower');
});

test('P12 night 3 wind: every 30 s a 5 s gust pushing 2 m/s; disabled by wind_enabled=false', () => {
  const r = runHeadless({ night: 3, ticks: 1900, every: 50, scenario: quiet({ wind_enabled: true }) });
  const at = (t) => r.snaps.find((s) => s.tick === t);
  assert.equal(at(1750).wind.active, false);
  assert.equal(at(1800).wind.active, true);
  assert.equal(typeof at(1800).wind.dir_deg, 'number');
  const moved = hyp(at(1900).player.pos, at(1800).player.pos);
  assert.ok(near(moved, (2 * 100) / 60, 0.05), `moved ${moved}`);
  const off = runHeadless({ night: 3, ticks: 1900, every: 1900, scenario: quiet() });
  assert.equal(off.last.wind.active, false);
  assert.deepEqual(off.last.player.pos, [0, 0, -30]);
});

test('P13 shade schedule: 2 at tick 300 (spawning), then every 8/7/6 s; ≥ 15 m from player; ids S1, S2, …', () => {
  for (const [night, interval] of [[1, 480], [2, 420], [3, 360]]) {
    const r = runHeadless({ night, ticks: 300 + interval, every: 300, scenario: { player: { flames: 99 }, random_drifters: false } });
    assert.deepEqual(r.ev('shade_spawned').map((e) => [e.tick, e.data.id]), [[300, 'S1'], [300, 'S2'], [300 + interval, 'S3']], `night ${night}`);
    const s300 = r.snaps.find((s) => s.tick === 300);
    for (const sh of s300.shades) {
      assert.equal(sh.state, 'spawning');
      assert.ok(hyp(sh.pos, s300.player.pos) >= 15);
    }
  }
});

test('P14 motes: +1 at tick 240 on a free point; dropped motes expire after 480 ticks', () => {
  const r = runHeadless({ ticks: 240, every: 240, scenario: { random_shades: false } });
  assert.equal(r.snaps[0].motes_active, 20);
  assert.equal(r.last.motes_active, 21);
  assert.equal(new Set(r.last.motes.map((m) => m.pos.join())).size, 21);
  const d = runHeadless({ ticks: 481, every: 1, scenario: quiet({ motes: [{ pos: [10, 0, 0], kind: 'dropped' }] }) });
  assert.equal(d.snaps[479].motes_active, 1);
  assert.equal(d.snaps[480].motes_active, 0);
});

test('P15 shade states: wander beyond 12 m, chase ≤ 12 m, gives up beyond 18 m', () => {
  const w = runHeadless({ ticks: 1, scenario: quiet({ shades: [{ id: 'S1', pos: [14, 1, 0] }] }) });
  assert.equal(w.snaps[0].shades[0].state, 'wander');
  const c = runHeadless({ ticks: 1, scenario: quiet({ shades: [{ id: 'S1', pos: [11, 1, 0] }] }) });
  assert.equal(c.last.shades[0].state, 'chase');
  const g = runHeadless({ ticks: 150, every: 1, scenario: quiet({ shades: [{ id: 'S1', pos: [17, 1, 0], state: 'chase' }] }), inputs: { frames: [{ tick: 0, move: [-1, 0] }] } });
  const i = g.snaps.findIndex((s) => s.shades[0].state === 'wander');
  // gap grows 2 m/s (6 − 4) from 17 m → crosses 18 m after ≈ 0.5 s (30 ticks)
  assert.ok(i >= 27 && i <= 31, `gave up at tick ${i}`);
  assert.equal(g.snaps[i - 1].shades[0].state, 'chase');
});

test('P16 lantern lit with a shade inside → pushed to the edge within 30 ticks, no damage meanwhile', () => {
  const scenario = quiet({ player: { pos: [0, 0, 24], carried: 1 }, lanterns: [{ id: 'L1', deposited: 9 }], shades: [{ id: 'S1', pos: [0, 1, 26], state: 'chase' }] });
  const r = runHeadless({ ticks: 120, every: 1, scenario, inputs: { frames: [{ tick: 0, interact: true }] } });
  assert.equal(r.ev('lantern_lit').length, 1);
  assert.ok(hyp(r.snaps[31].shades[0].pos, [0, 0, 25]) >= 6 - 1e-3);
  assert.equal(r.ev('player_hit').length, 0);
});

test('P17 nights 2 and 3: lantern ids/positions, durations, charms, flames refilled', () => {
  const n2 = runHeadless({ night: 2, ticks: 0 }).snaps[0];
  assert.deepEqual(n2.lanterns.map((l) => l.id), ['L1', 'L2', 'L3', 'L4', 'L5', 'L6']);
  assert.deepEqual(n2.lanterns[4].pos, [87, 0, -10]);
  assert.equal(n2.time_left_s, 270, 'Ticket-03: 270 s (was 330)');
  assert.deepEqual(n2.charms.map((c) => [c.id, c.available]), [['C1', true]]);
  const n3 = runHeadless({ night: 3, ticks: 0 }).snaps[0];
  assert.equal(n3.lanterns.length, 7);
  assert.deepEqual(n3.lanterns[0].pos, [0, 6, 6]);
  assert.equal(n3.time_left_s, 300, 'Ticket-03: 300 s (was 360)');
  assert.equal(n3.charms.length, 2);
  assert.equal(n3.player.flames, 3);
});

test('P18 performance: 21 600 ticks of night 3 run headless in ≤ 30 s', () => {
  const t0 = Date.now();
  const r = runHeadless({ night: 3, ticks: 21600, every: 600, scenario: { player: { flames: 1000 }, time_left_s: 400 } });
  const ms = Date.now() - t0;
  assert.equal(r.code, 0);
  assert.ok(ms < 30000, `${ms} ms`);
});
