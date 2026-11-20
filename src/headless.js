#!/usr/bin/env node
// Headless runner — Test Contract v1.1.
// node src/headless.js --seed <int> --night <1|2|3> [--scenario f.json] [--inputs f.json]
//                      --ticks <int> --out <file.jsonl> [--snapshot-every <int>]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Game, ScenarioError, emptyInput } from './core/game.js';
import { FormatError, validateInputs, validateScenario } from './core/validate.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

class UsageError extends Error {}

function parseArgs(argv) {
  const opts = { seed: 0, night: 1, snapshotEvery: 10 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => {
      if (i + 1 >= argv.length) throw new UsageError(`missing value for ${a}`);
      return argv[++i];
    };
    const int = (v) => {
      if (!/^-?\d+$/.test(v)) throw new UsageError(`${a} expects an integer, got "${v}"`);
      return parseInt(v, 10);
    };
    switch (a) {
      case '--seed': opts.seed = int(val()); break;
      case '--night': opts.night = int(val()); break;
      case '--scenario': opts.scenario = val(); break;
      case '--inputs': opts.inputs = val(); break;
      case '--ticks': opts.ticks = int(val()); break;
      case '--out': opts.out = val(); break;
      case '--snapshot-every': opts.snapshotEvery = int(val()); break;
      default: throw new UsageError(`unknown argument: ${a}`);
    }
  }
  if (opts.ticks === undefined || opts.ticks < 0) throw new UsageError('--ticks <int >= 0> is required');
  if (!opts.out) throw new UsageError('--out <file.jsonl> is required');
  if (![1, 2, 3].includes(opts.night)) throw new UsageError(`--night must be 1, 2 or 3 (got ${opts.night})`);
  if (opts.snapshotEvery < 1) throw new UsageError('--snapshot-every must be >= 1');
  return opts;
}

function readJson(file, label) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    throw new Error(`cannot read ${label} file "${file}": ${e.message}`);
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new FormatError(`${label}: invalid JSON (${e.message})`);
  }
}

export function run(opts) {
  const contract = JSON.parse(fs.readFileSync(path.join(ROOT, 'game.contract.json'), 'utf8'));
  const scenario = opts.scenario ? validateScenario(readJson(opts.scenario, 'scenario')) : null;
  const inputs = opts.inputs ? validateInputs(readJson(opts.inputs, 'inputs')) : { frames: [] };

  const lines = [];
  const game = new Game(contract.tuning, {
    seed: opts.seed,
    night: opts.night,
    scenario,
    onEvent: (e) => lines.push(JSON.stringify(e)),
  });
  const input = emptyInput();
  const frames = inputs.frames;
  let fi = 0;
  let lastSnap = -1;
  const snap = () => {
    lines.push(JSON.stringify(game.snapshot()));
    lastSnap = game.tick;
  };
  lines.push(JSON.stringify({ type: 'event', tick: 0, name: 'night_start', data: { night: opts.night } }));
  snap(); // tick 0: after scenario, before any input
  for (let k = 0; k < opts.ticks && game.state === 'playing'; k++) {
    while (fi < frames.length && frames[fi].tick === k) {
      const f = frames[fi++];
      for (const key of ['move', 'cam_yaw_deg', 'jump', 'interact', 'pulse', 'dash', 'pause']) {
        if (f[key] !== undefined) input[key] = f[key];
      }
    }
    game.step(input);
    if (game.tick % opts.snapshotEvery === 0) snap();
  }
  if (lastSnap !== game.tick) snap(); // final state always present
  lines.push(JSON.stringify({ type: 'end', ticks: game.tick, state: game.state, score: game.score }));
  fs.writeFileSync(opts.out, lines.join('\n') + '\n');
  return game;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    run(parseArgs(process.argv.slice(2)));
    process.exit(0);
  } catch (e) {
    process.stderr.write(`error: ${e.message}\n`);
    process.exit(e instanceof FormatError || e instanceof ScenarioError ? 2 : 1);
  }
}
