// Ticket-04: leaderboard rules + export command, bench scene, soak command.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT } from './helpers.js';
import { addEntry, validName, sortEntries, isoLocal } from '../src/core/leaderboard.js';
import { benchScenario, benchCamera, frameStats } from '../src/core/bench.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ddl4-'));

test('L1 names: 3–12 of [A-Za-z0-9_], Vietnamese accepted; others rejected', () => {
  for (const ok of ['Duy', 'abc_123', 'NguyenQuangD', 'Mây_đẹp', 'Đăng']) assert.ok(validName(ok), ok);
  for (const bad of ['ab', 'thirteen_char', 'a b c', 'x!y', '', 'tên-gạch']) assert.ok(!validName(bad), bad);
});

test('L2 sort by score desc, tie → earlier achieved_at first, keep top 10; ISO time has a timezone', () => {
  let e = [];
  for (let i = 0; i < 12; i++) e = addEntry(e, { name: `P${i}xx`, score: i * 10, nights_won: 1, achieved_at: `2026-11-20T10:00:${String(i).padStart(2, '0')}+07:00`, seed: i });
  assert.equal(e.length, 10);
  assert.equal(e[0].score, 110);
  assert.equal(e.at(-1).score, 20);
  const tie = sortEntries([
    { name: 'late', score: 5, nights_won: 0, achieved_at: '2026-11-20T10:00:05+07:00', seed: 1 },
    { name: 'early', score: 5, nights_won: 0, achieved_at: '2026-11-20T10:00:01+07:00', seed: 2 },
  ]);
  assert.deepEqual(tie.map((x) => x.name), ['early', 'late']);
  assert.match(isoLocal(new Date()), /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d[+-]\d\d:\d\d$/);
  assert.throws(() => addEntry([], { name: 'ok_name', score: 1, nights_won: 4, seed: 1 }));
});

test('L3 server stores entries on disk; --export-leaderboard writes {"entries": [...]} in order', async () => {
  const db = path.join(tmp, 'lb.json');
  const env = { ...process.env, DDL_LEADERBOARD: db };
  const srv = spawn(process.execPath, ['scripts/serve.js', '5191'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((r) => srv.stdout.once('data', r));
  try {
    for (const [name, score] of [['alice', 300], ['bob_2', 900], ['Mây', 300]]) {
      const r = await fetch('http://localhost:5191/api/leaderboard', { method: 'POST', body: JSON.stringify({ name, score, nights_won: 2, seed: 7 }) });
      assert.equal(r.status, 200);
    }
    const bad = await fetch('http://localhost:5191/api/leaderboard', { method: 'POST', body: JSON.stringify({ name: 'x', score: 1, nights_won: 0, seed: 1 }) });
    assert.equal(bad.status, 400);
  } finally {
    srv.kill();
  }
  const out = path.join(tmp, 'export.json');
  const r = spawnSync(process.execPath, ['scripts/serve.js', '--export-leaderboard', out], { cwd: ROOT, env, encoding: 'utf8' });
  assert.equal(r.status, 0);
  const data = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.deepEqual(data.entries.map((e) => e.name), ['bob_2', 'alice', 'Mây']);
  for (const e of data.entries) assert.deepEqual(Object.keys(e).sort(), ['achieved_at', 'name', 'nights_won', 'score', 'seed']);
});

test('B1 bench scene: 200 wander shades, 100 motes, L1–L3 lit at 100, deterministic; camera orbit; stats formula', () => {
  const sc = benchScenario(42);
  assert.equal(sc.shades.length, 200);
  assert.ok(sc.shades.every((s) => s.state === 'wander' && Math.hypot(s.pos[0], s.pos[2]) <= 38));
  assert.equal(sc.motes.length, 100);
  assert.deepEqual(sc.lanterns, [{ id: 'L1', lit: true, fuel: 100 }, { id: 'L2', lit: true, fuel: 100 }, { id: 'L3', lit: true, fuel: 100 }]);
  assert.deepEqual(benchScenario(42), sc);
  assert.deepEqual(benchCamera(0), [30, 15, 0]);
  const q = benchCamera(3.75).map((v) => Math.round(v * 1000) / 1000);
  assert.deepEqual(q, [0, 15, 30], 'quarter turn CCW from above → +Z');
  const st = frameStats([10, 10, 10, 10, 10, 10, 10, 10, 10, 50]);
  assert.equal(st.frames, 10);
  assert.equal(st.avg_fps, 71.4);
  assert.equal(st.p1_low_fps, 20);
  assert.equal(st.frame_ms_p95, 50);
});

test('B2 bench flags stop damage, pickup, fuel decay and the end of the night', async () => {
  const { Game, emptyInput } = await import('../src/core/game.js');
  const T = JSON.parse(fs.readFileSync(path.join(ROOT, 'game.contract.json'), 'utf8')).tuning;
  const g = new Game(T, { seed: 42, night: 1, scenario: benchScenario(42), bench: {} });
  for (let i = 0; i < 60 * 250; i++) g.step(emptyInput());
  assert.equal(g.state, 'playing');
  assert.equal(g.player.flames, 3);
  assert.equal(g.motes.length, 100);
  assert.equal(g.shades.length, 200);
  assert.deepEqual(g.lanterns.slice(0, 3).map((l) => l.fuelU / 60), [100, 100, 100]);
});

test('S1 soak: 10 nights, 0 crashes, memory growth ≤ 1.2×', () => {
  const out = path.join(tmp, 'soak.json');
  const r = spawnSync(process.execPath, ['--expose-gc', 'scripts/soak.js', '--seed', '7', '--nights', '10', '--out', out], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const s = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.equal(s.nights, 10);
  assert.equal(s.crashes, 0);
  assert.equal(s.results.length, 10);
  assert.ok(s.mem_end_mb <= 1.2 * s.mem_start_mb, `${s.mem_end_mb} vs ${s.mem_start_mb}`);
});
