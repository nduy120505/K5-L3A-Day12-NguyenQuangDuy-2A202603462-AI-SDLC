// Generates Phase evidence into docs/proof/phase-1/ from the REAL code (no hand edits).
// 1) runs the test suite, 2) a greedy bot plays Night 1 and its recorded inputs are replayed
// through the headless CLI, 3) determinism check (two runs, sha256), 4) error exit codes.
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Game, emptyInput } from '../src/core/game.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs', 'proof', process.argv[2] || 'phase-1');
fs.mkdirSync(OUT, { recursive: true });
const T = JSON.parse(fs.readFileSync(path.join(ROOT, 'game.contract.json'), 'utf8')).tuning;
const contract = JSON.parse(fs.readFileSync(path.join(ROOT, 'game.contract.json'), 'utf8'));
const node = process.execPath;
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0, 16);

function headless(args) {
  const r = spawnSync(node, ['src/headless.js', ...args], { cwd: ROOT, encoding: 'utf8' });
  return { code: r.status, stderr: r.stderr.trim() };
}
const readLines = (f) => fs.readFileSync(f, 'utf8').trim().split('\n').map((l) => JSON.parse(l));

// ---- 1. tests
const t = spawnSync(node, ['--test', '--test-reporter=spec', ...fs.readdirSync(path.join(ROOT, 'tests')).filter((f) => f.endsWith('.test.js')).map((f) => `tests/${f}`)], { cwd: ROOT, encoding: 'utf8' });
const testOut = (t.stdout + t.stderr).replace(/\x1b\[[0-9;]*m/g, '');
fs.writeFileSync(path.join(OUT, 'test-output.txt'), testOut);
const passLine = testOut.match(/ℹ pass (\d+)/)?.[1];
const failLine = testOut.match(/ℹ fail (\d+)/)?.[1];

// ---- 2. bot playthrough (records inputs, then replays via CLI) — every night
const DEG = Math.PI / 180;
function waypoint(night, p, target) {
  const [px, py, pz] = p.pos, [tx, ty, tz] = target.pos;
  if (night === 2) {
    const side = (x) => (x < 35 ? 0 : 1);
    if (side(px) !== side(tx)) {
      if (Math.abs(pz) > 1.2 || px < 25 || px > 45) return side(px) === 0 ? [25, 0, 0] : [45, 0, 0];
      return side(px) === 0 ? [46, 0, 0] : [24, 0, 0];
    }
    return target.pos;
  }
  if (night === 3) {
    const ang = Math.atan2(pz, px);
    const rampAng = Math.abs(ang - 30 * DEG) < Math.abs(ang - 150 * DEG) ? 30 : 150;
    const ux = Math.cos(rampAng * DEG), uz = Math.sin(rampAng * DEG);
    const ramp = (rr) => [rr * ux, 0, rr * uz];
    if (ty > py + 1) {
      if (py < 1) {
        const along = px * ux + pz * uz;
        const perp = Math.abs(px * uz - pz * ux);
        if (perp < 0.6 && along <= 32.5) return ramp(20);
        return ramp(32);
      }
      if (ty >= 5) return [0, 3, 13];
      return target.pos;
    }
    if (py < 1 && ty < 1) {
      for (let f = 0.1; f <= 1; f += 0.1) {
        const x = px + (tx - px) * f, z = pz + (tz - pz) * f, rr = Math.hypot(x, z);
        if (rr < 9 || (z > -1 && rr < 25.5)) {
          const a = Math.atan2(pz, px), b = Math.atan2(tz, tx);
          let d = b - a;
          if (d > Math.PI) d -= 2 * Math.PI;
          if (d < -Math.PI) d += 2 * Math.PI;
          const na = a + Math.sign(d || 1) * 25 * DEG;
          return [33 * Math.cos(na), 0, 33 * Math.sin(na)];
        }
      }
    }
    return target.pos;
  }
  return target.pos;
}
function botInputs(night, seed, maxTicks) {
  const g = new Game(T, { seed, night });
  const frames = [];
  let prev = null;
  const inp = emptyInput();
  for (let k = 0; k < maxTicks && g.state === 'playing'; k++) {
    const p = g.player;
    const d = (a) => Math.hypot(a.pos[0] - p.pos[0], a.pos[2] - p.pos[2]) + Math.abs(a.pos[1] - p.pos[1]) * 4;
    const lantern = g.lanterns.filter((l) => !l.lit).sort((a, b) => d(a) - d(b))[0];
    const need = lantern ? T.lantern_cost - lantern.deposited : 0;
    const near = (q, r) => Math.hypot(q.pos[0] - p.pos[0], q.pos[2] - p.pos[2]) < r;
    const threat = g.shades.find((s) => (s.state === 'chase' || s.state === 'wander') && near(s, 3.5));
    const thief = g.drifters.find((x) => x.state === 'chase' && near(x, 4));
    inp.pulse = !!(threat || thief) && p.carried >= T.pulse_cost && p.pulseCd === 0 && !prev?.pulse;
    inp.dash = !!threat && !inp.pulse && p.dashCd === 0 && !prev?.dash;
    const goLantern = p.carried >= Math.min(need, T.carry_capacity) || g.motes.length === 0;
    const target = goLantern ? lantern : [...g.motes].sort((a, b) => d(a) - d(b))[0];
    inp.interact = false;
    if (target === lantern && near(lantern, T.interact_radius * 0.8) && Math.abs(lantern.pos[1] - p.pos[1]) < 1) {
      inp.move = [0, 0];
      inp.interact = !prev?.interact;
    } else {
      const w = waypoint(night, p, target);
      let dx = w[0] - p.pos[0], dz = w[2] - p.pos[2];
      const L = Math.hypot(dx, dz) || 1;
      dx /= L;
      dz /= L;
      // avoidance: steer away from active shades within 6 m (outside safe zones only)
      for (const s of g.shades) {
        if (s.state !== 'chase' && s.state !== 'wander') continue;
        const ex = p.pos[0] - s.pos[0], ez = p.pos[2] - s.pos[2], e = Math.hypot(ex, ez);
        if (e < 6 && e > 1e-6) {
          dx += (ex / e) * (6 - e) * 0.6;
          dz += (ez / e) * (6 - e) * 0.6;
        }
      }
      const M = Math.hypot(dx, dz) || 1;
      inp.move = [Math.round((dx / M) * 1000) / 1000, Math.round((dz / M) * 1000) / 1000];
    }
    const frame = { tick: k };
    for (const key of ['move', 'interact', 'pulse', 'dash']) {
      if (!prev || JSON.stringify(prev[key]) !== JSON.stringify(inp[key])) frame[key] = inp[key];
    }
    if (Object.keys(frame).length > 1) frames.push(frame);
    prev = { move: [...inp.move], interact: inp.interact, pulse: inp.pulse, dash: inp.dash };
    g.step(inp);
  }
  return { frames };
}

const plays = [];
for (const night of [1, 2, 3]) {
  for (const seed of [1, 2, 3]) {
    const ticks = T[`night${night}_duration_s`] * 60;
    const inputsFile = path.join(OUT, `bot-n${night}-s${seed}.inputs.json`);
    fs.writeFileSync(inputsFile, JSON.stringify(botInputs(night, seed, ticks)));
    const out = path.join(OUT, `bot-n${night}-s${seed}.jsonl`);
    const r = headless(['--seed', String(seed), '--night', String(night), '--inputs', inputsFile, '--ticks', String(ticks), '--out', out, '--snapshot-every', '600']);
    const lines = readLines(out);
    const ev = lines.filter((l) => l.type === 'event');
    const count = (n) => ev.filter((e) => e.name === n).length;
    plays.push({ night, seed, code: r.code, end: lines.at(-1), go: ev.find((e) => e.name === 'game_over')?.data, motes: count('mote_picked'), lit: count('lantern_lit'), total: lines.find((l) => l.type === 'snapshot').lanterns.length, hits: count('player_hit'), pulses: count('pulse'), steals: count('drifter_steal'), file: rel(out) });
  }
}

// ---- 3. determinism
const d1 = path.join(OUT, 'determinism-run1.jsonl');
const d2 = path.join(OUT, 'determinism-run2.jsonl');
const dArgs = (o) => ['--seed', '1', '--night', '2', '--inputs', path.join(OUT, 'bot-n2-s1.inputs.json'), '--ticks', '19800', '--out', o];
headless(dArgs(d1));
headless(dArgs(d2));
const same = fs.readFileSync(d1, 'utf8') === fs.readFileSync(d2, 'utf8');
const h1 = sha(d1), h2 = sha(d2);
fs.rmSync(d2);

// ---- 4. error handling
const bad = path.join(OUT, '_bad.json');
fs.writeFileSync(bad, '{"frames":[{"tick":3},{"tick":1}]}');
const e1 = headless(['--seed', '1', '--night', '1', '--inputs', bad, '--ticks', '10', '--out', path.join(OUT, '_x.jsonl')]);
fs.writeFileSync(bad, '{oops');
const e2 = headless(['--seed', '1', '--night', '1', '--scenario', bad, '--ticks', '10', '--out', path.join(OUT, '_x.jsonl')]);
const e3 = headless(['--seed', '1', '--night', '1', '--ticks', '10']);
fs.rmSync(bad);
fs.rmSync(path.join(OUT, '_x.jsonl'), { force: true });

// ---- 5. speed
fs.writeFileSync(path.join(OUT, '_immortal.json'), '{"player":{"flames":100000}}');
const t0 = performance.now();
headless(['--seed', '9', '--night', '3', '--ticks', '21600', '--out', path.join(OUT, '_speed.jsonl'), '--snapshot-every', '60', '--scenario', path.join(OUT, '_immortal.json')]);
const ms = Math.round(performance.now() - t0);
fs.rmSync(path.join(OUT, '_speed.jsonl'));
fs.rmSync(path.join(OUT, '_immortal.json'));

const md = `# Bằng chứng ${path.basename(OUT)} (tự sinh bởi \`npm run proof\`)

Sinh lúc: ${new Date().toISOString()} · Node ${process.version} · ${process.platform}
Tuning dùng: \`game.contract.json\` (contract ${contract.contract_version}).

## 1. Test tự động (${passLine} đạt / ${failLine} trượt)
Toàn văn: [test-output.txt](test-output.txt). Test chạy **CLI headless thật** giống cách giảng viên chấm.

## 2. Bot chơi trọn từng Đêm (input ghi lại → phát lại qua CLI headless)
Bot tham lam: gom đom đóm gần nhất → về đèn chưa thắp gần nhất → interact; né Bóng Mực trong 6 m, tỏa sáng/lướt khi bị áp sát.
Đêm 2 đi qua cầu; Đêm 3 leo dốc 30°/150° và dùng bục nhảy lên tầng 2. Bot **không** né khéo, nên thua cũng là kết quả thật.

| đêm | seed | exit | kết quả | lý do | tick | điểm | đom đóm | đèn | bị chạm | tỏa sáng | bị cướp | output |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
${plays.map((p) => `| ${p.night} | ${p.seed} | ${p.code} | ${p.end.state} | ${p.go?.reason ?? '-'} | ${p.end.ticks} | ${p.end.score} | ${p.motes} | ${p.lit}/${p.total} | ${p.hits} | ${p.pulses} | ${p.steals} | [jsonl](${path.basename(p.file)}) |`).join('\n')}

## 3. Tính tất định
Hai lần chạy Đêm 2, cùng seed 1 + cùng inputs của bot: giống hệt nhau = **${same}** (sha256 ${h1} / ${h2}).

## 4. Xử lý lỗi
| Trường hợp | Mã thoát | stderr |
|---|---|---|
| inputs tick giảm | ${e1.code} | \`${e1.stderr}\` |
| scenario JSON hỏng | ${e2.code} | \`${e2.stderr}\` |
| thiếu --out | ${e3.code} | \`${e3.stderr}\` |

## 5. Tốc độ
Đêm 3 trọn 21 600 tick (bất tử để chạy hết) chạy headless trong **${ms} ms** (gồm khởi động Node).
`;
fs.writeFileSync(path.join(OUT, 'README.md'), md);
console.log(md);
