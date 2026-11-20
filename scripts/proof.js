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

// ---- 2. bot playthrough (records inputs, then replays via CLI)
function botInputs(seed, maxTicks = 300 * 60) {
  const g = new Game(T, { seed });
  const frames = [];
  let prev = null;
  const inp = emptyInput();
  for (let k = 0; k < maxTicks && g.state === 'playing'; k++) {
    const p = g.player;
    const d = (a) => Math.hypot(a.pos[0] - p.pos[0], a.pos[2] - p.pos[2]);
    const unlit = g.lanterns.filter((l) => !l.lit).sort((a, b) => d(a) - d(b));
    const lantern = unlit[0];
    const need = lantern ? T.lantern_cost - lantern.deposited : 0;
    let target;
    const threat = g.shades.find((s) => s.state !== 'stunned' && d(s) < 3);
    inp.pulse = !!threat && p.carried >= T.pulse_cost && !prev?.pulse;
    if (p.carried >= Math.min(need, T.carry_capacity) || g.motes.length === 0) target = lantern;
    else target = [...g.motes].sort((a, b) => d(a) - d(b))[0];
    inp.interact = false;
    if (target === lantern && d(lantern) <= T.interact_radius * 0.8) {
      inp.move = [0, 0];
      inp.interact = !prev?.interact;
    } else {
      const dx = target.pos[0] - p.pos[0], dz = target.pos[2] - p.pos[2];
      const L = Math.hypot(dx, dz) || 1;
      inp.move = [Math.round((dx / L) * 1000) / 1000, Math.round((dz / L) * 1000) / 1000];
    }
    const frame = { tick: k };
    for (const key of ['move', 'interact', 'pulse']) {
      if (!prev || JSON.stringify(prev[key]) !== JSON.stringify(inp[key])) frame[key] = inp[key];
    }
    if (Object.keys(frame).length > 1) frames.push(frame);
    prev = { move: [...inp.move], interact: inp.interact, pulse: inp.pulse };
    g.step(inp);
  }
  return { frames };
}

const plays = [];
for (const seed of [1, 2, 3]) {
  const inputsFile = path.join(OUT, `bot-seed${seed}.inputs.json`);
  fs.writeFileSync(inputsFile, JSON.stringify(botInputs(seed)));
  const out = path.join(OUT, `bot-seed${seed}.jsonl`);
  const r = headless(['--seed', String(seed), '--night', '1', '--inputs', inputsFile, '--ticks', String(300 * 60), '--out', out, '--snapshot-every', '600']);
  const lines = readLines(out);
  const ev = lines.filter((l) => l.type === 'event');
  const count = (n) => ev.filter((e) => e.name === n).length;
  plays.push({ seed, code: r.code, end: lines.at(-1), go: ev.find((e) => e.name === 'game_over')?.data, motes: count('mote_picked'), lit: count('lantern_lit'), hits: count('player_hit'), pulses: count('pulse'), spawned: count('shade_spawned'), file: rel(out) });
}

// ---- 3. determinism
const d1 = path.join(OUT, 'determinism-run1.jsonl');
const d2 = path.join(OUT, 'determinism-run2.jsonl');
const dArgs = (o) => ['--seed', '1', '--night', '1', '--inputs', path.join(OUT, 'bot-seed1.inputs.json'), '--ticks', '18000', '--out', o];
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
const t0 = performance.now();
headless(['--seed', '9', '--night', '1', '--ticks', '18000', '--out', path.join(OUT, '_speed.jsonl'), '--snapshot-every', '60']);
const ms = Math.round(performance.now() - t0);
fs.rmSync(path.join(OUT, '_speed.jsonl'));

const md = `# Bằng chứng ${path.basename(OUT)} (tự sinh bởi \`npm run proof\`)

Sinh lúc: ${new Date().toISOString()} · Node ${process.version} · ${process.platform}
Tuning dùng: \`game.contract.json\` (contract ${contract.contract_version}).

## 1. Test tự động (${passLine} đạt / ${failLine} trượt)
Toàn văn: [test-output.txt](test-output.txt). Test chạy **CLI headless thật** giống cách giảng viên chấm.

## 2. Chơi trọn Đêm 1 bằng bot (input ghi lại → phát lại qua CLI headless)
Bot tham lam: gom đom đóm gần nhất → về đèn chưa thắp gần nhất → nhấn interact; tỏa sáng khi Bóng Mực < 3 m.

| seed | exit | kết quả | lý do | tick kết thúc | điểm | đom đóm | đèn thắp | bị chạm | tỏa sáng | Bóng Mực sinh thêm | output |
|---|---|---|---|---|---|---|---|---|---|---|---|
${plays.map((p) => `| ${p.seed} | ${p.code} | ${p.end.state} | ${p.go?.reason ?? '-'} | ${p.end.ticks} | ${p.end.score} | ${p.motes} | ${p.lit} | ${p.hits} | ${p.pulses} | ${p.spawned} | [jsonl](${path.basename(p.file)}) |`).join('\n')}

## 3. Tính tất định
Hai lần chạy cùng seed 1 + cùng inputs: giống hệt nhau = **${same}** (sha256 ${h1} / ${h2}).

## 4. Xử lý lỗi
| Trường hợp | Mã thoát | stderr |
|---|---|---|
| inputs tick giảm | ${e1.code} | \`${e1.stderr}\` |
| scenario JSON hỏng | ${e2.code} | \`${e2.stderr}\` |
| thiếu --out | ${e3.code} | \`${e3.stderr}\` |

## 5. Tốc độ
18 000 tick (= 300 s, trọn một đêm) chạy headless trong **${ms} ms** (gồm khởi động Node).
`;
fs.writeFileSync(path.join(OUT, 'README.md'), md);
console.log(md);
