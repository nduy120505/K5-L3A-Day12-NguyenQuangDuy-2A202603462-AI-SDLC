// Automated UI smoke check (Playwright): walks menu → intro → play (3 nights) → pause → settings → loss → name → leaderboard.
// Fails on any page error. Saves screenshots to docs/proof/phase-4/screens/. Usage: node scripts/ui-check.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs/proof/phase-4/screens');
fs.mkdirSync(OUT, { recursive: true });
const db = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ddl-ui-')), 'lb.json');
const PORT = 5192;
const srv = spawn(process.execPath, ['scripts/serve.js', String(PORT)], { cwd: ROOT, env: { ...process.env, DDL_LEADERBOARD: db }, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((r) => srv.stdout.once('data', r));
const browser = await chromium.launch({ args: ['--window-size=1280,720'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const shot = (n) => page.screenshot({ path: path.join(OUT, `${n}.png`) });
const wait = (ms) => page.waitForTimeout(ms);
const log = [];
const step = async (name, fn) => {
  await fn();
  log.push(`${errors.length ? '✖' : '✔'} ${name}${errors.length ? ' — ' + errors.join(' | ') : ''}`);
};
try {
  await page.goto(`http://localhost:${PORT}/`);
  await step('menu', async () => { await wait(800); await shot('01-menu'); });
  await step('intro night 1', async () => { await page.click('#bPlay'); await wait(400); await shot('02-intro'); });
  await step('play night 1 (move, jump, dash, pulse, interact)', async () => {
    await page.click('#bGo');
    await page.keyboard.down('KeyW'); await wait(1500);
    await page.keyboard.press('Space'); await page.keyboard.press('ShiftLeft'); await page.keyboard.press('KeyF'); await page.keyboard.press('KeyE');
    await wait(1500); await page.keyboard.up('KeyW');
    await page.evaluate(() => { const g = window.__ddl.game; g.lanterns[0].lit = true; g.lanterns[0].fuelU = 1500; g.lanterns[0].everLit = true; });
    await wait(5500); await shot('03-night1');
  });
  await step('pause menu', async () => { await page.keyboard.press('Escape'); await wait(300); await shot('04-pause'); });
  await step('settings (keys, colour-blind, reduce motion, large text)', async () => {
    await page.click('#bSettings2'); await wait(200);
    await page.click('#keyList button[data-a="jump"]'); await page.keyboard.press('ShiftLeft'); await wait(100);
    await shot('05-settings-duplicate-key');
    const warn = await page.textContent('#keyWarn');
    if (!warn.includes('Trùng')) errors.push('duplicate key not reported');
    await page.click('#bKeysReset'); await page.check('#sCb'); await page.check('#sLarge'); await wait(100);
    await shot('06-settings');
    await page.click('#bBack'); await page.click('#bResume'); await wait(1500); await shot('07-colourblind-large');
    await page.click('#bResume').catch(() => {});
  });
  await step('loss → result → name entry → leaderboard', async () => {
    await page.evaluate(() => { window.__ddl.game.player.flames = 0; });
    await wait(1800); await shot('08-result-name');
    await page.fill('#nameIn', 'x'); await page.click('#bSave'); await wait(100);
    if (!(await page.textContent('#nameErr')).includes('3–12')) errors.push('invalid name accepted');
    await page.fill('#nameIn', 'Mây_đẹp'); await page.click('#bSave'); await wait(600);
    await shot('09-leaderboard');
    if (!(await page.textContent('#lbBody')).includes('Mây_đẹp')) errors.push('entry not in leaderboard');
  });
  for (const n of [2, 3]) {
    await step(`night ${n}`, async () => {
      await page.goto(`http://localhost:${PORT}/?night=${n}`);
      await page.click('#bPlay'); await wait(300); await page.click('#bGo');
      await page.keyboard.down('KeyW'); await wait(2500); await page.keyboard.up('KeyW'); await wait(500);
      await shot(`1${n}-night${n}`);
    });
  }
  const exp = path.join(path.dirname(db), 'export.json');
  await new Promise((r) => spawn(process.execPath, ['scripts/serve.js', '--export-leaderboard', exp], { cwd: ROOT, env: { ...process.env, DDL_LEADERBOARD: db } }).on('exit', r));
  log.push(`export: ${fs.readFileSync(exp, 'utf8').replace(/\s+/g, ' ')}`);
} finally {
  await browser.close();
  srv.kill();
}
const report = `# UI check (Playwright, Chromium, 1280×720)\n\n${log.map((l) => `- ${l}`).join('\n')}\n\nPage errors: ${errors.length}\n`;
fs.writeFileSync(path.join(ROOT, 'docs/proof/phase-4/ui-check.md'), report);
console.log(report);
process.exit(errors.length ? 1 : 0);
