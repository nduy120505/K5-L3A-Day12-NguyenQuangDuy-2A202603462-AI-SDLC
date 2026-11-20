import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const TUNING = JSON.parse(fs.readFileSync(path.join(ROOT, 'game.contract.json'), 'utf8')).tuning;

let n = 0;
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ddl-'));
const tmp = (name) => path.join(tmpDir, `${process.pid}-${n++}-${name}`);

/**
 * Run the real headless CLI (as the grader would).
 * scenario / inputs may be objects (written to JSON) or raw strings.
 */
export function runHeadless({ seed = 1, ticks = 60, scenario, inputs, every, extra = [] } = {}) {
  const out = tmp('out.jsonl');
  const args = ['src/headless.js', '--seed', String(seed), '--night', '1', '--ticks', String(ticks), '--out', out];
  if (every) args.push('--snapshot-every', String(every));
  for (const [flag, val] of [['--scenario', scenario], ['--inputs', inputs]]) {
    if (val === undefined) continue;
    const f = tmp(flag.slice(2) + '.json');
    fs.writeFileSync(f, typeof val === 'string' ? val : JSON.stringify(val));
    args.push(flag, f);
  }
  args.push(...extra);
  const r = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8' });
  const res = { code: r.status, stderr: r.stderr, lines: [], raw: '' };
  if (fs.existsSync(out)) {
    res.raw = fs.readFileSync(out, 'utf8');
    res.lines = res.raw.trim().split('\n').map((l) => JSON.parse(l));
  }
  res.snaps = res.lines.filter((l) => l.type === 'snapshot');
  res.events = res.lines.filter((l) => l.type === 'event');
  res.end = res.lines[res.lines.length - 1];
  res.ev = (name) => res.events.filter((e) => e.name === name);
  res.last = res.snaps[res.snaps.length - 1];
  return res;
}

/** Scenario with nothing random: empty island unless specified. */
export function quiet(extra = {}) {
  return { random_motes: false, random_shades: false, motes: [], shades: [], ...extra };
}

export const allLitExcept = (id) =>
  ['L1', 'L2', 'L3', 'L4', 'L5'].filter((x) => x !== id).map((x) => ({ id: x, lit: true }));
