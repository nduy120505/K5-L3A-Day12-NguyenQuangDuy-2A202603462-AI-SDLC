// Browser entry: runs the SAME core sim as headless at fixed 60 Hz and renders it with three.js.
// UI flow: menu → night intro → play → result → next night … → dawn. Render-only extras never touch state.
import * as THREE from 'three';
import { Game, DT, STD, emptyInput } from './core/game.js';
import { MAPS } from './core/maps.js';
import { buildWorld, PAL } from './render/world.js';
import { benchScenario, benchCamera, frameStats } from './core/bench.js';
import { addEntry, sortEntries, validName, normalizeName } from './core/leaderboard.js';
import { Audio } from './render/audio.js';

const contract = await (await fetch('game.contract.json')).json();
const T = contract.tuning;
const $ = (id) => document.getElementById(id);
const QS = new URLSearchParams(location.search);
const BENCH = QS.get('bench') ? { seed: +(QS.get('seed') || 42), duration: +(QS.get('duration') || 30), warmup: 3 } : null;

// ---------- settings (persisted) ----------
const DEFAULT_KEYS = { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', jump: 'Space', dash: 'ShiftLeft', interact: 'KeyE', pulse: 'KeyF', pause: 'Escape' };
const KEY_LABELS = { up: 'Đi tới', down: 'Đi lùi', left: 'Sang trái', right: 'Sang phải', jump: 'Nhảy', dash: 'Lướt', interact: 'Tương tác (nạp/châm)', pulse: 'Tỏa sáng', pause: 'Tạm dừng' };
const settings = { volume: 0.6, sens: 1, cb: false, reduce: false, large: false, keys: { ...DEFAULT_KEYS } };
try {
  Object.assign(settings, JSON.parse(localStorage.getItem('ddl-settings') || '{}'));
} catch {}
settings.keys = { ...DEFAULT_KEYS, ...(settings.keys || {}) };
const saveSettings = () => {
  try {
    localStorage.setItem('ddl-settings', JSON.stringify(settings));
  } catch {}
};
const audio = new Audio();
audio.setVolume(settings.volume);

// ---------- renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
const SKY = new THREE.Color(PAL.sky), FOG = new THREE.Color(PAL.fog), WARMSKY = new THREE.Color('#3a2c4a');
scene.background = SKY.clone();
scene.fog = new THREE.FogExp2(FOG.clone(), 0.03);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 500);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
const ambient = new THREE.AmbientLight('#aab4ff', 0.15);
const moon = new THREE.DirectionalLight('#9fb0ff', 0.75);
moon.position.set(-30, 60, -20);
scene.add(ambient, moon);
// stars
{
  const pos = [];
  for (let i = 0; i < 700; i++) {
    const a = Math.random() * Math.PI * 2, e = 0.15 + Math.random() * 1.2, R = 240;
    pos.push(Math.cos(e) * Math.cos(a) * R, Math.sin(e) * R, Math.cos(e) * Math.sin(a) * R);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: PAL.text, size: 1, fog: false })));
}

// ---------- entity models ----------
const C = (c) => new THREE.Color(c);
function makeLantern() {
  const g = new THREE.Group();
  const wood = new THREE.MeshLambertMaterial({ color: PAL.wood });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 3.2), wood);
  pole.position.y = 1.6;
  const shellMat = new THREE.MeshLambertMaterial({ color: PAL.off, emissive: '#000' });
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 12), shellMat);
  shell.scale.y = 1.3;
  shell.position.y = 3.6;
  const coreMat = new THREE.MeshBasicMaterial({ color: PAL.core, transparent: true, opacity: 0 });
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 8), coreMat);
  core.position.y = 3.6;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.4, 0.18), wood);
  cap.position.y = 4.4;
  const light = new THREE.PointLight(PAL.lit, 0, 24, 1.6);
  light.position.y = 3.6;
  const ring = new THREE.Mesh(new THREE.RingGeometry(T.safe_radius - 0.12, T.safe_radius, 64), new THREE.MeshBasicMaterial({ color: PAL.lit, transparent: true, opacity: 0, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.05;
  // fuel bar (Ticket-03) + torn-paper marks shown when the lantern is out (colour-independent cue)
  const barBg = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.16), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
  barBg.position.y = 5.0;
  const barMat = new THREE.MeshBasicMaterial({ color: PAL.lit, side: THREE.DoubleSide });
  const bar = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.16), barMat);
  bar.position.set(0, 5.0, 0.01);
  const tear = new THREE.Group();
  const tearMat = new THREE.MeshBasicMaterial({ color: '#1a1a22', side: THREE.DoubleSide });
  for (const [x, y, r] of [[0.25, 3.8, 0.6], [-0.3, 3.4, -0.5], [0.05, 3.2, 1.1]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.45), tearMat);
    m.position.set(x, y, 0.6);
    m.rotation.z = r;
    tear.add(m);
  }
  g.add(pole, shell, core, cap, light, ring, barBg, bar, tear);
  return { g, shell, shellMat, coreMat, light, ring, bar, barBg, barMat, tear };
}
function makePlayer() {
  const g = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: PAL.shirt });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.42, 1.0, 12), shirt);
  body.position.y = 0.5;
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.08, 8, 16), new THREE.MeshLambertMaterial({ color: PAL.scarf }));
  scarf.rotation.x = Math.PI / 2;
  scarf.position.y = 1.02;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), new THREE.MeshLambertMaterial({ color: '#f1c9a5' }));
  head.position.y = 1.3;
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.78, 0.45, 24), new THREE.MeshLambertMaterial({ color: PAL.sand }));
  hat.position.y = 1.62;
  const lampMat = new THREE.MeshBasicMaterial({ color: PAL.lit });
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), lampMat);
  lamp.scale.y = 1.3;
  lamp.position.set(0, 1.08, 0.64);
  const lampLight = new THREE.PointLight(PAL.lit, 2, 10, 1.5);
  lampLight.position.copy(lamp.position);
  g.add(body, scarf, head, hat, lamp, lampLight);
  return { g, lamp, lampLight };
}
function makeShade() {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: PAL.shade, emissive: PAL.shadeRim, emissiveIntensity: 0.25, transparent: true, opacity: 0.95 });
  const blob = new THREE.Mesh(new THREE.SphereGeometry(0.8, 16, 12), mat);
  const rimMat = new THREE.MeshBasicMaterial({ color: PAL.shadeRim, transparent: true, opacity: 0.35, side: THREE.BackSide });
  const rim = new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 12), rimMat);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.0, 12), mat);
  tail.rotation.x = Math.PI;
  tail.position.y = -0.8;
  const eyeMat = new THREE.MeshBasicMaterial({ color: '#d9b8ff' });
  const e1 = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), eyeMat);
  const e2 = e1.clone();
  e1.position.set(-0.25, 0.15, 0.72);
  e2.position.set(0.25, 0.15, 0.72);
  g.add(blob, rim, tail, e1, e2);
  return { g, mat, rimMat, eyeMat };
}
function makeDrifter() {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: PAL.drifter, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
  const ribbon = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.35, 12, 1), mat);
  g.add(ribbon);
  const loot = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), new THREE.MeshBasicMaterial({ color: PAL.moteHalo }));
  loot.position.y = -0.3;
  g.add(loot);
  return { g, ribbon, loot };
}
function makeCharm() {
  const g = new THREE.Group();
  const paper = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.04), new THREE.MeshBasicMaterial({ color: PAL.scarf }));
  const border = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.92, 0.02), new THREE.MeshBasicMaterial({ color: PAL.gold }));
  g.add(border, paper);
  return { g };
}
const moteGeo = new THREE.SphereGeometry(0.15, 10, 8), haloGeo = new THREE.SphereGeometry(0.38, 10, 8);
const moteMat = new THREE.MeshBasicMaterial({ color: PAL.moteCore });
const haloMat = new THREE.MeshBasicMaterial({ color: PAL.moteHalo, transparent: true, opacity: 0.28 });
function makeMote() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(moteGeo, moteMat), new THREE.Mesh(haloGeo, haloMat));
  return { g };
}

// ---------- instanced pools (performance: a few draw calls for hundreds of shades / motes) ----------
const MAXI = 512;
function pool(geo, mat, n = MAXI) {
  const m = new THREE.InstancedMesh(geo, mat, n);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.count = 0;
  m.frustumCulled = false;
  scene.add(m);
  return m;
}
const shadeBodyMat = new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: PAL.shadeRim, emissiveIntensity: 0.25 });
const shadeRimMat = new THREE.MeshBasicMaterial({ color: PAL.shadeRim, transparent: true, opacity: 0.4, side: THREE.BackSide, depthWrite: false });
const shadeEyeMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
const P = {
  body: pool(new THREE.SphereGeometry(0.8, 14, 10), shadeBodyMat),
  tail: pool(new THREE.ConeGeometry(0.6, 1.0, 10).rotateX(Math.PI).translate(0, -0.8, 0), shadeBodyMat),
  rim: pool(new THREE.SphereGeometry(0.92, 14, 10), shadeRimMat),
  eye: pool(new THREE.SphereGeometry(0.11, 6, 6), shadeEyeMat, MAXI * 2),
  mote: pool(new THREE.SphereGeometry(0.15, 8, 6), new THREE.MeshBasicMaterial({ color: PAL.moteCore })),
  halo: pool(new THREE.SphereGeometry(0.38, 8, 6), new THREE.MeshBasicMaterial({ color: PAL.moteHalo, transparent: true, opacity: 0.28, depthWrite: false })),
};
const dummy = new THREE.Object3D();
const eyeV = new THREE.Vector3();
const eyeM = new THREE.Matrix4();
const camGoal = new THREE.Vector3();
const projV = new THREE.Vector3();
const tmpC = new THREE.Color();
const phaseOf = (id) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 1000;
  return h / 159;
};

// ---------- app state ----------
const app = { mode: 'menu', night: 1, totals: {}, game: null, view: null, world: null, settingsFrom: 'menu' };
window.__ddl = app; // read-only handle for the automated UI check (scripts/ui-check.js)
const input = emptyInput();
const keys = new Set();
let camYaw = 0, acc = 0, simT = 0;
const totalScore = () => Object.values(app.totals).reduce((a, b) => a + b, 0);

const INTRO = {
  1: 'Đảo Bến là nơi thuyền mây cập bến. Cháu hãy thắp lại năm ngọn đèn để người đi biển mây tìm được đường về. Nhớ kỹ: Bóng Mực sợ ánh đèn.',
  2: 'Đảo Cau có hai hòn nối nhau bằng cây cầu tre. Bục vàng sẽ hất cháu bay sang đảo bên kia. Coi chừng Gió Lạc, nó thích giật đom đóm của người mang nhiều.',
  3: 'Đảo Chuông cao nhất quần đảo. Leo dốc lên tầng trên, nhảy bục lên tới chân tháp chuông. Gió ở đây mạnh lắm, thấy lá bay thì đứng vững nhé!',
};

function show(id) {
  for (const o of ['menu', 'intro', 'result', 'pause', 'settings', 'board']) $(o).classList.toggle('hidden', o !== id);
  $('hud').classList.toggle('hidden', !(app.mode === 'play' || app.mode === 'pause'));
}

function loadNight(n, opts = {}) {
  if (app.world) scene.remove(app.world.group);
  for (const o of app.view?.all ?? []) scene.remove(o);
  app.night = n;
  const map = MAPS[n];
  const seed = (Date.now() & 0x7fffffff) >>> 0;
  app.game = new Game(T, { seed: opts.seed ?? seed, night: n, onEvent, scenario: opts.scenario ?? null, bench: opts.bench ?? null });
  if (app.runSeed == null) app.runSeed = opts.seed ?? seed;
  app.world = buildWorld(map);
  scene.add(app.world.group);
  const view = (app.view = { lanterns: new Map(), shades: new Map(), motes: new Map(), drifters: new Map(), charms: new Map(), all: [], fx: [] });
  for (const l of app.game.lanterns) {
    const v = makeLantern();
    v.g.position.set(...l.pos);
    view.lanterns.set(l.id, v);
    add(v.g);
  }
  view.player = makePlayer();
  add(view.player.g);
  $('hMotes').innerHTML = Array.from({ length: T.carry_capacity }, () => '<div class="cell"></div>').join('');
  camYaw = n === 3 ? 0 : 0;
  acc = 0;
  simT = 0;
  lastSec = -1;
}
function add(o) {
  scene.add(o);
  app.view.all.push(o);
}

function startIntro(n) {
  loadNight(n);
  app.mode = 'intro';
  $('iNight').textContent = `Đêm ${n}`;
  $('iName').textContent = MAPS[n].name;
  $('iQuote').textContent = `Ông Đăng: “${INTRO[n]}”`;
  show('intro');
}
function play() {
  audio.ensure();
  audio.ctx?.resume();
  audio.startMusic();
  app.mode = 'play';
  show(null);
  toast(`Đêm ${app.night} – ${MAPS[app.night].name}`);
}
function pauseGame() {
  if (app.mode !== 'play') return;
  app.mode = 'pause';
  keys.clear();
  show('pause');
}
function resume() {
  app.mode = 'play';
  show(null);
}
function toMenu() {
  app.mode = 'menu';
  app.totals = {};
  show('menu');
}
function openSettings(from) {
  app.settingsFrom = from;
  $('sVol').value = settings.volume;
  $('sSens').value = settings.sens;
  $('sCb').checked = !!settings.cb;
  $('sReduce').checked = !!settings.reduce;
  $('sLarge').checked = !!settings.large;
  rebinding = null;
  renderKeys();
  show('settings');
}

$('bPlay').onclick = () => {
  audio.ensure();
  app.totals = {};
  app.runSeed = null;
  startIntro(+(new URLSearchParams(location.search).get('night') || 1));
};
$('bGo').onclick = play;
$('bResume').onclick = resume;
$('bRestart').onclick = () => startIntro(app.night);
$('bMenu').onclick = toMenu;
$('bMenu2').onclick = toMenu;
$('bSettings1').onclick = () => openSettings('menu');
$('bSettings2').onclick = () => openSettings('pause');
$('bBack').onclick = () => show(app.settingsFrom);
$('sVol').oninput = (e) => {
  settings.volume = +e.target.value;
  audio.setVolume(settings.volume);
  saveSettings();
};
$('sCb').onchange = (e) => {
  settings.cb = e.target.checked;
  document.body.classList.toggle('cb', settings.cb);
  saveSettings();
};
document.body.classList.toggle('cb', !!settings.cb);
$('sSens').oninput = (e) => {
  settings.sens = +e.target.value;
  saveSettings();
};
$('bNext').onclick = () => nextAction();
let nextAction = () => {};

// ---------- accessibility settings ----------
const applyBodyFlags = () => {
  document.body.classList.toggle('reduce', !!settings.reduce);
  document.body.classList.toggle('large', !!settings.large);
};
applyBodyFlags();
$('sReduce').onchange = (e) => { settings.reduce = e.target.checked; applyBodyFlags(); saveSettings(); };
$('sLarge').onchange = (e) => { settings.large = e.target.checked; applyBodyFlags(); saveSettings(); };
const keyName = (c) => (c || '—').replace(/^Key/, '').replace(/^Digit/, '').replace('ShiftLeft', 'Shift trái').replace('ShiftRight', 'Shift phải').replace('Space', 'Space');
let rebinding = null;
function renderKeys() {
  const used = {};
  for (const [a, c] of Object.entries(settings.keys)) (used[c] ??= []).push(a);
  const dups = Object.values(used).filter((l) => l.length > 1);
  $('keyList').innerHTML = Object.keys(DEFAULT_KEYS)
    .map((a) => `<span>${KEY_LABELS[a]}</span><button data-a="${a}" class="${used[settings.keys[a]].length > 1 ? 'dup' : ''}">${rebinding === a ? 'Nhấn phím…' : keyName(settings.keys[a])}</button>`)
    .join('');
  $('keyWarn').textContent = dups.length ? `⚠ Trùng phím: ${dups.map((l) => l.map((a) => KEY_LABELS[a]).join(' / ')).join('; ')}` : '';
  for (const b of $('keyList').querySelectorAll('button')) b.onclick = () => { rebinding = b.dataset.a; renderKeys(); };
}
$('bKeysReset').onclick = () => { settings.keys = { ...DEFAULT_KEYS }; rebinding = null; saveSettings(); renderKeys(); };

// ---------- leaderboard (server file on disk; localStorage fallback for static hosting) ----------
async function lbLoad() {
  try {
    const r = await fetch('api/leaderboard');
    if (r.ok) return (await r.json()).entries;
  } catch {}
  try { return sortEntries(JSON.parse(localStorage.getItem('ddl-leaderboard') || '[]')); } catch { return []; }
}
async function lbSave(entry) {
  try {
    const r = await fetch('api/leaderboard', { method: 'POST', body: JSON.stringify(entry) });
    if (r.ok) return (await r.json()).entries;
  } catch {}
  const list = addEntry(await lbLoad(), entry);
  try { localStorage.setItem('ddl-leaderboard', JSON.stringify(list)); } catch {}
  return list;
}
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
async function openBoard(highlight) {
  const list = await lbLoad();
  $('lbBody').innerHTML = list.length
    ? list.map((e, i) => `<tr style="${highlight && e.name === highlight.name && e.score === highlight.score ? 'color:var(--gold);font-weight:700' : ''}"><td>${i + 1}</td><td>${esc(e.name)}</td><td>${e.score}</td><td>${e.nights_won}</td><td>${esc(e.achieved_at.slice(0, 16).replace('T', ' '))}</td></tr>`).join('')
    : '<tr><td colspan="5">Chưa có ai. Hãy là người đầu tiên!</td></tr>';
  show('board');
}
$('bBoard').onclick = () => openBoard();
$('bBoardBack').onclick = () => show('menu');
$('bSave').onclick = async () => {
  const name = normalizeName($('nameIn').value);
  if (!validName(name)) {
    $('nameErr').textContent = '⚠ Tên cần 3–12 ký tự: chữ (có thể có dấu), số hoặc _';
    return;
  }
  const entry = { name, score: totalScore(), nights_won: Object.keys(app.totals).length, seed: app.runSeed ?? 0 };
  await lbSave(entry);
  $('nameBox').classList.add('hidden');
  openBoard(entry);
  $('bBoardBack').onclick = () => { $('bBoardBack').onclick = () => show('menu'); show('result'); };
};

function showResult({ result, reason }) {
  const g = app.game;
  app.mode = 'result';
  const won = result === 'won';
  if (won) app.totals[app.night] = g.score;
  audio.sfx(won ? 'win' : 'lose');
  const why = { dawn_survived: 'Đảo vẫn sáng khi bình minh lên!', dawn: 'Bình minh tới nhưng quá ít đèn còn sáng.', no_flames: 'Ngọn lửa của Mây đã tắt...' }[reason];
  setTimeout(() => {
    if (won && app.night === 3) {
      $('rTitle').textContent = 'Bình Minh';
      $('rText').innerHTML = `Mặt trời lên trên biển mây. Cả ba hòn đảo đã sáng đèn trở lại.<br><br>Tổng điểm: <b style="color:var(--gold);font-size:30px">${totalScore()}</b>`;
      $('bNext').textContent = 'Chơi lại từ đầu';
      nextAction = () => { app.totals = {}; startIntro(1); };
      document.body.style.background = '#f7b37a';
    } else if (won) {
      $('rTitle').textContent = `Đêm ${app.night}: Thắng!`;
      $('rText').innerHTML = `${why}<br>Điểm đêm: <b style="color:var(--gold)">${g.score}</b> · Tổng: <b style="color:var(--gold)">${totalScore()}</b>`;
      $('bNext').textContent = `Sang Đêm ${app.night + 1}`;
      nextAction = () => startIntro(app.night + 1);
    } else {
      $('rTitle').textContent = `Đêm ${app.night}: Thất bại`;
      $('rText').innerHTML = `${why}<br>Tổng điểm hiện tại: <b style="color:var(--gold)">${totalScore()}</b>`;
      $('bNext').textContent = 'Chơi lại Đêm này';
      nextAction = () => startIntro(app.night);
    }
    const askName = (won && app.night === 3) || !won;
    $('nameBox').classList.toggle('hidden', !askName);
    $('nameErr').textContent = '';
    show('result');
    if (askName) setTimeout(() => $('nameIn').focus(), 50);
  }, 1000);
}

// ---------- input ----------
addEventListener('keydown', (e) => {
  if (rebinding) {
    e.preventDefault();
    settings.keys[rebinding] = e.code;
    rebinding = null;
    saveSettings();
    renderKeys();
    return;
  }
  if (document.activeElement === $('nameIn')) {
    if (e.code === 'Enter') $('bSave').onclick();
    return;
  }
  if (e.code === settings.keys.pause || (e.code === 'KeyP' && !Object.values(settings.keys).includes('KeyP'))) {
    if (app.mode === 'play') pauseGame();
    else if (app.mode === 'pause') resume();
    return;
  }
  if (e.code === 'Enter') {
    if (app.mode === 'intro') play();
    else if (app.mode === 'result') nextAction();
    else if (app.mode === 'menu') $('bPlay').onclick();
  }
  keys.add(e.code);
  if (['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => {
  keys.clear();
  pauseGame();
});
let dragging = false, lastX = 0;
renderer.domElement.addEventListener('pointerdown', (e) => {
  dragging = true;
  lastX = e.clientX;
});
addEventListener('pointerup', () => (dragging = false));
addEventListener('pointermove', (e) => {
  if (!dragging) return;
  camYaw -= (e.clientX - lastX) * 0.005 * settings.sens;
  lastX = e.clientX;
});
function readInput() {
  // camera looks along (sin yaw, cos yaw); contract +x is screen-left at yaw 0
  let x = 0, z = 0;
  const K = settings.keys;
  if (keys.has(K.up) || keys.has('ArrowUp')) z += 1;
  if (keys.has(K.down) || keys.has('ArrowDown')) z -= 1;
  if (keys.has(K.left)) x += 1;
  if (keys.has(K.right)) x -= 1;
  if (keys.has('ArrowLeft')) camYaw += 0.03 * settings.sens;
  if (keys.has('ArrowRight')) camYaw -= 0.03 * settings.sens;
  input.move = [x, z];
  input.cam_yaw_deg = (camYaw * 180) / Math.PI;
  input.jump = keys.has(K.jump);
  input.interact = keys.has(K.interact);
  input.pulse = keys.has(K.pulse);
  input.dash = keys.has(K.dash) || (K.dash === 'ShiftLeft' && keys.has('ShiftRight'));
}

// ---------- events → feedback ----------
let toastTimer = 0, shake = 0, lastSec = -1;
let shadeArrow = null; // { id, until }
const lowWarned = new Set();
function caption(msg) {
  const el = document.createElement('div');
  el.textContent = msg;
  $('hCaption').appendChild(el);
  while ($('hCaption').children.length > 4) $('hCaption').firstChild.remove();
  setTimeout(() => el.remove(), 3500);
}
function toast(msg) {
  $('hToast').textContent = msg;
  $('hToast').style.opacity = 1;
  toastTimer = 2.2;
}
function onEvent(e) {
  const p = app.game.player.pos;
  const fx = app.view.fx;
  switch (e.name) {
    case 'mote_picked': audio.sfx('pick'); break;
    case 'deposit': audio.sfx('deposit'); toast(`Nạp ${e.data.amount} ánh sáng (${e.data.deposited}/${T.lantern_cost})`); break;
    case 'lantern_out': audio.sfx('lose'); toast(`Đèn ${e.data.lantern_id} đã cạn dầu và tắt!`); break;
    case 'refuel': audio.sfx('deposit'); toast(`Châm ${e.data.amount} đom đóm → dầu ${e.data.fuel}`); break;
    case 'lantern_lit': {
      audio.sfx('lit');
      toast(e.data.relight ? `Đèn ${e.data.lantern_id} được thắp lại!` : `Đèn ${e.data.lantern_id} đã sáng!`);
      skyLanterns(app.view.lanterns.get(e.data.lantern_id).g.position);
      break;
    }
    case 'pulse': {
      audio.sfx('pulse');
      if (settings.reduce) break;
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshBasicMaterial({ color: PAL.core, transparent: true, opacity: 0.5 }));
      m.position.set(p[0], p[1] + STD.pulseCenterY, p[2]);
      add(m);
      fx.push({ obj: m, t: 0, dur: 0.45, kind: 'pulse' });
      if (e.data.stunned_ids.length) toast(`Xua được ${e.data.stunned_ids.length} Bóng Mực!`);
      break;
    }
    case 'player_hit':
      audio.sfx('hit');
      if (!settings.reduce) shake = 0.45;
      toast(e.data.by === 'fall' ? `Mây rơi xuống biển mây! Mất ${e.data.lost} đom đóm` : `Bóng Mực chạm vào Mây! Rơi ${e.data.dropped} đom đóm`);
      break;
    case 'shade_spawned':
      audio.sfx('shade');
      caption(`👁 Bóng Mực xuất hiện (${e.data.id})`);
      shadeArrow = { id: e.data.id, until: performance.now() + 3500 };
      break;
    case 'dash': audio.sfx('dash'); break;
    case 'charm_picked': audio.sfx('charm'); toast('Bùa Gió! Chạy nhanh hơn, lướt không hồi chiêu'); break;
    case 'drifter_steal': audio.sfx('steal'); toast(`Gió Lạc cướp mất ${e.data.amount} đom đóm!`); break;
    case 'drifter_drop': toast(`Gió Lạc đánh rơi ${e.data.amount} đom đóm`); break;
    case 'game_over': showResult(e.data); break;
  }
}
// creative (render-only): sky lanterns rise when a Great Lantern is relit
function skyLanterns(pos) {
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.17, 0.42, 8), new THREE.MeshBasicMaterial({ color: PAL.lit, transparent: true }));
    m.position.set(pos.x + (Math.random() - 0.5) * 3, pos.y + 4, pos.z + (Math.random() - 0.5) * 3);
    add(m);
    app.view.fx.push({ obj: m, t: 0, dur: 9, kind: 'sky', v: [(Math.random() - 0.5) * 0.6, 1.3 + Math.random(), (Math.random() - 0.5) * 0.6] });
  }
}
// wind warning leaves (render-only)
const leafGeo = new THREE.PlaneGeometry(0.25, 0.12);
const leafMat = new THREE.MeshBasicMaterial({ color: '#7fae6a', side: THREE.DoubleSide, transparent: true });
function windLeaves(dirDeg) {
  const p = app.game.player.pos;
  const a = ((dirDeg ?? 0) * Math.PI) / 180;
  for (let i = 0; i < 25; i++) {
    const m = new THREE.Mesh(leafGeo, leafMat);
    m.position.set(p[0] - Math.cos(a) * 12 + (Math.random() - 0.5) * 16, p[1] + 0.5 + Math.random() * 3, p[2] - Math.sin(a) * 12 + (Math.random() - 0.5) * 16);
    add(m);
    app.view.fx.push({ obj: m, t: 0, dur: 2.5, kind: 'leaf', v: [Math.cos(a) * 9, 0.3, Math.sin(a) * 9] });
  }
}

// ---------- view sync ----------
function syncMap(map, list, make) {
  const seen = new Set();
  for (const ent of list) {
    seen.add(ent.id);
    if (!map.has(ent.id)) {
      const v = make();
      v.phase = Math.random() * 6.28;
      map.set(ent.id, v);
      add(v.g);
    }
  }
  for (const [id, v] of map) if (!seen.has(id)) {
    scene.remove(v.g);
    map.delete(id);
  }
}

const tmpV = new THREE.Vector3();
let windWarnShown = false;
function render(now) {
  const t = now / 1000, g = app.game, v = app.view, p = g.player;
  // player (jump SFX detected render-side: left the ground moving up)
  if (v.wasGrounded && !p.grounded && p.vel[1] > 0 && !p.launch) audio.sfx('jump');
  v.wasGrounded = p.grounded;
  v.player.g.position.set(...p.pos);
  v.player.g.rotation.y = Math.atan2(p.facing[0], p.facing[1]);
  v.player.g.visible = p.dead === 0 && (p.invuln === 0 || settings.reduce || Math.floor(t * 12) % 2 === 0);
  const glow = 0.6 + (p.carried / T.carry_capacity) * 2.4; // creative: hat lantern glows with carried light
  v.player.lampLight.intensity = glow * (0.9 + 0.1 * Math.sin(t * 9));
  v.player.lamp.rotation.z = Math.sin(t * 3) * 0.25;
  // lanterns + island brightening
  let lit = 0;
  for (const l of g.lanterns) {
    const lv = v.lanterns.get(l.id);
    const cost = l.everLit ? T.relight_cost : T.lantern_cost;
    const frac = l.lit ? 1 : l.deposited / cost;
    const fuel = l.fuelU / 60;
    const low = l.lit && fuel < T.low_fuel_threshold;
    const blinkOn = !low || Math.floor(t * 2) % 2 === 0; // 1 Hz slow blink when fuel < 30
    if (l.lit) lit++;
    lv.shellMat.color.set(l.lit ? PAL.lit : PAL.off);
    lv.shellMat.emissive.set(PAL.lit);
    lv.shellMat.emissiveIntensity = l.lit ? (blinkOn ? 0.9 : 0.15) : frac * 0.5;
    lv.coreMat.opacity = l.lit ? (blinkOn ? 1 : 0.2) : frac * 0.6;
    lv.light.intensity = l.lit ? (blinkOn ? 30 : 8) * (0.4 + 0.6 * fuel / T.fuel_max) : frac * 4;
    lv.ring.material.opacity = l.lit && !low ? 0.35 : 0;
    lv.shell.scale.set(1, l.lit ? 1.3 : 1.3 * 0.8, 1); // out → deflated 20 %
    lv.tear.visible = !l.lit;
    lv.bar.visible = lv.barBg.visible = l.lit && blinkOn;
    lv.bar.scale.x = Math.max(0.001, fuel / T.fuel_max);
    lv.bar.position.x = -0.8 * (1 - fuel / T.fuel_max);
    lv.barMat.color.set(low ? (settings.cb ? '#FFFFFF' : PAL.danger) : PAL.lit);
    lv.bar.lookAt(camera.position);
    lv.barBg.lookAt(camera.position);
  }
  const k = lit / g.lanterns.length;
  ambient.intensity = 0.15 + 0.55 * k;
  scene.background.copy(SKY).lerp(WARMSKY, k * 0.6);
  scene.fog.color.copy(FOG).lerp(WARMSKY, k * 0.6);
  scene.fog.density = 0.03 - 0.018 * k;
  // motes (instanced)
  let mi = 0;
  for (const m of g.motes) {
    if (m.kind === 'dropped' && m.ttl < 90 && Math.floor(t * 8) % 2 && !settings.reduce) continue;
    const ph = phaseOf(m.id);
    dummy.position.set(m.pos[0], m.pos[1] + 0.8 + Math.sin(t * 2 + ph) * 0.25, m.pos[2]);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    P.mote.setMatrixAt(mi, dummy.matrix);
    P.halo.setMatrixAt(mi, dummy.matrix);
    mi++;
  }
  P.mote.count = P.halo.count = mi;
  P.mote.instanceMatrix.needsUpdate = P.halo.instanceMatrix.needsUpdate = true;
  // shades (instanced: body, tail, rim, 2 eyes)
  const rimC = settings.cb ? '#00B3FF' : PAL.shadeRim;
  shadeRimMat.color.set(rimC);
  shadeBodyMat.emissive.set(rimC);
  shadeEyeMat.color.set(settings.cb ? '#00B3FF' : '#d9b8ff');
  let si = 0;
  for (const s of g.shades) {
    const stun = s.state === 'stunned';
    const ph = phaseOf(s.id);
    const rise = s.state === 'spawning' ? 1 - s.ticks / STD.spawningTicks : 1;
    dummy.position.set(s.pos[0], s.pos[1] - (1 - rise) * 2 + Math.sin(t * 2 + ph) * 0.2, s.pos[2]);
    dummy.rotation.set(0, Math.atan2(p.pos[0] - s.pos[0], p.pos[2] - s.pos[2]), stun && !settings.reduce ? Math.sin(t * 10) * 0.3 : 0);
    const pulse = s.state === 'drain' ? 1 + 0.08 * Math.sin(t * 8) : 1;
    dummy.scale.setScalar(pulse);
    dummy.updateMatrix();
    P.body.setMatrixAt(si, dummy.matrix);
    P.tail.setMatrixAt(si, dummy.matrix);
    P.rim.setMatrixAt(si, dummy.matrix);
    P.body.setColorAt(si, tmpC.set(stun ? PAL.shadeStun : PAL.shade));
    for (const [k, ex] of [[0, -0.25], [1, 0.25]]) {
      eyeV.set(ex, 0.15, 0.72).applyEuler(dummy.rotation).multiplyScalar(pulse).add(dummy.position);
      P.eye.setMatrixAt(si * 2 + k, eyeM.makeTranslation(eyeV.x, eyeV.y, eyeV.z));
      P.eye.setColorAt(si * 2 + k, tmpC.set(stun ? PAL.core : '#ffffff'));
    }
    si++;
  }
  P.body.count = P.tail.count = P.rim.count = si;
  P.eye.count = si * 2;
  for (const m of [P.body, P.tail, P.rim, P.eye]) {
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }
  // drifters
  syncMap(v.drifters, g.drifters.filter((d) => d.state !== 'removed'), makeDrifter);
  for (const d of g.drifters) {
    const dv = v.drifters.get(d.id);
    if (!dv) continue;
    dv.g.position.set(d.pos[0], d.pos[1] + Math.sin(t * 3 + dv.phase) * 0.3, d.pos[2]);
    dv.g.rotation.y = t * 2 + dv.phase;
    const pos = dv.ribbon.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 2 + t * 8) * 0.25);
    pos.needsUpdate = true;
    dv.loot.visible = d.stolen > 0;
  }
  // charms
  syncMap(v.charms, g.charms.filter((c) => c.available), makeCharm);
  for (const c of g.charms) {
    const cv = v.charms.get(c.id);
    if (cv) {
      cv.g.position.set(c.pos[0], c.pos[1] + 1 + Math.sin(t * 2) * 0.15, c.pos[2]);
      cv.g.rotation.y = t * 1.5;
    }
  }
  for (const padMesh of app.world.pads) padMesh.material.color.set(PAL.gold).multiplyScalar(0.8 + 0.2 * Math.sin(t * 5));
  // wind warning
  if (g.wind.warn && !g.wind.active && !windWarnShown) {
    windWarnShown = true;
    caption('🍃 Gió sắp thổi mạnh!');
    windLeaves(g.wind.next);
    audio.sfx('wind');
  }
  if (!g.wind.warn) windWarnShown = false;
  if (g.wind.active && Math.random() < 0.15) windLeaves(g.wind.dir_deg);
  // effects
  for (let i = v.fx.length - 1; i >= 0; i--) {
    const f = v.fx[i];
    f.t += 1 / 60;
    if (f.kind === 'pulse') {
      f.obj.scale.setScalar(1 + (f.t / f.dur) * (T.pulse_radius - 1));
      f.obj.material.opacity = 0.5 * (1 - f.t / f.dur);
    } else {
      f.obj.position.x += f.v[0] / 60;
      f.obj.position.y += f.v[1] / 60;
      f.obj.position.z += f.v[2] / 60;
      if (f.kind === 'leaf') f.obj.rotation.set(t * 5 + i, t * 3, 0);
      else f.obj.material.opacity = Math.min(1, (f.dur - f.t) / 2);
    }
    if (f.t >= f.dur) {
      scene.remove(f.obj);
      v.fx.splice(i, 1);
    }
  }
  // camera
  if (BENCH) {
    const c = benchCamera(benchT);
    camera.position.set(c[0], c[1], c[2]);
    camera.lookAt(0, 0, 0);
    hud(lit);
    renderer.render(scene, camera);
    return;
  }
  const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
  const target = tmpV.set(p.pos[0], p.pos[1] + 1.2, p.pos[2]);
  camera.position.lerp(camGoal.set(p.pos[0] - fx * 9, p.pos[1] + 5, p.pos[2] - fz * 9), 0.15);
  if (shake > 0) {
    camera.position.x += (Math.random() - 0.5) * shake;
    camera.position.y += (Math.random() - 0.5) * shake;
    shake = Math.max(0, shake - 0.02);
  }
  camera.lookAt(target);
  hud(lit);
  renderer.render(scene, camera);
}

const htmlCache = {};
function setHTML(id, html) {
  if (htmlCache[id] === html) return;
  htmlCache[id] = html;
  $(id).innerHTML = html;
}
function setText(id, txt) {
  if (htmlCache[id] === txt) return;
  htmlCache[id] = txt;
  $(id).textContent = txt;
}
function hud(lit) {
  const g = app.game, p = g.player;
  setHTML('hFlames', Array.from({ length: Math.max(T.flames, p.flames) }, (_, i) => `<div class="flame ${i < p.flames ? '' : 'off'}"></div>`).join(''));
  const left = Math.max(0, Math.ceil(g.timeLeft() - 1e-9));
  const clock = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
  $('hClock').classList.toggle('danger', left <= 30);
  setText('hClock', (settings.cb && left <= 30 ? '⚠ ' : '') + clock);
  if (app.mode === 'play' && left <= 10 && left > 0 && left !== lastSec) {
    audio.sfx('tick');
    if (left === 10) caption('⏳ 10 giây cuối trước bình minh!');
  }
  for (const l of g.lanterns) {
    const low = l.lit && l.fuelU < g.FU.low;
    if (low && !lowWarned.has(l.id)) caption(`${settings.cb ? '⚠ ' : '🪔 '}Đèn ${l.id} sắp cạn dầu (< ${T.low_fuel_threshold})`);
    if (low) lowWarned.add(l.id);
    else lowWarned.delete(l.id);
  }
  lastSec = left;
  const need = Math.ceil(T.win_ratio * g.lanterns.length - 1e-9);
  setText('hLit', `${lit}/${g.lanterns.length} (cần ${need})`);
  const cap = g.capacity();
  if ($('hMotes').children.length !== cap) $('hMotes').innerHTML = Array.from({ length: cap }, () => '<div class="cell"></div>').join('');
  setText('hCap', `${p.carried}/${cap}`);
  setText('hScore', String(totalScore() + g.score));
  [...$('hMotes').children].forEach((c, i) => c.classList.toggle('on', i < p.carried));
  const dashReady = p.charm > 0 ? 1 : 1 - p.dashCd / g.T.dashCd;
  const pulseReady = p.carried < T.pulse_cost ? 0 : 1 - p.pulseCd / g.T.pulseCd;
  $('cdDash').style.setProperty('--p', `${dashReady * 100}%`);
  setHTML('cdDashL', `Lướt<br>${keyName(settings.keys.dash)}`);
  setHTML('cdPulseL', `Tỏa sáng<br>${keyName(settings.keys.pulse)}`);
  $('cdPulse').style.setProperty('--p', `${pulseReady * 100}%`);
  // hint near lantern
  let hint = '';
  const nearL = g.lanterns.find((l) => Math.hypot(l.pos[0] - p.pos[0], l.pos[2] - p.pos[2]) <= T.interact_radius);
  if (nearL && !nearL.lit) hint = `E — Nạp ánh sáng (${nearL.deposited}/${nearL.everLit ? T.relight_cost : T.lantern_cost})${nearL.everLit ? ' · thắp lại' : ''}`;
  else if (nearL && nearL.fuelU < g.FU.max) hint = `E — Châm dầu (${(nearL.fuelU / 60).toFixed(0)}/${T.fuel_max})`;
  else if (p.carried >= cap) hint = 'Đã mang đầy ánh sáng, hãy về thắp hoặc châm đèn!';
  const weak = g.lanterns.filter((l) => l.lit && l.fuelU < g.FU.low).length;
  if (weak) hint = (hint ? hint + ' · ' : '') + `${settings.cb ? '⚠ ' : ''}${weak} đèn sắp cạn dầu!`;
  setText('hHint', hint);
  const st = [];
  if (p.charm > 0) st.push(`<span style="color:${PAL.scarf}">Bùa Gió ${Math.ceil(p.charm / 60)}s</span>`);
  if (g.wind.warn && !g.wind.active) st.push('<span style="color:#a6d98a">Gió sắp nổi!</span>');
  if (g.wind.active) st.push('<span style="color:#a6d98a">Gió mạnh!</span>');
  if (p.dead > 0) st.push(`<span style="color:${PAL.danger}">Đang hồi sinh...</span>`);
  setHTML('hStatus', st.join(' · '));
  // arrow to nearest unlit lantern when off-screen
  const arrow = $('hArrow');
  const unlit = g.lanterns.filter((l) => !l.lit).sort((a, b) => Math.hypot(a.pos[0] - p.pos[0], a.pos[2] - p.pos[2]) - Math.hypot(b.pos[0] - p.pos[0], b.pos[2] - p.pos[2]))[0];
  arrow.style.display = 'none';
  if (unlit) {
    const v = projV.set(unlit.pos[0], unlit.pos[1] + 3.6, unlit.pos[2]).project(camera);
    const behind = v.z > 1;
    const on = !behind && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1;
    if (!on) {
      let x = behind ? -v.x : v.x, y = behind ? -v.y : v.y;
      const m = Math.max(Math.abs(x), Math.abs(y)) || 1;
      x /= m;
      y /= m;
      const W = innerWidth, H = innerHeight;
      const sx = (x * 0.9 * W) / 2 + W / 2, sy = (-y * 0.85 * H) / 2 + H / 2;
      arrow.style.display = 'block';
      arrow.style.left = `${sx - 14}px`;
      arrow.style.top = `${sy - 14}px`;
      arrow.style.transform = `rotate(${Math.atan2(x, y)}rad)`;
    }
  }
  const sa = $('hShadeArrow');
  sa.style.display = 'none';
  const sh = shadeArrow && performance.now() < shadeArrow.until && g.shades.find((x) => x.id === shadeArrow.id);
  if (sh) {
    const v = projV.set(sh.pos[0], sh.pos[1], sh.pos[2]).project(camera);
    const behind = v.z > 1;
    if (behind || Math.abs(v.x) > 1 || Math.abs(v.y) > 1) {
      let x = behind ? -v.x : v.x, y = behind ? -v.y : v.y;
      const m = Math.max(Math.abs(x), Math.abs(y)) || 1;
      x /= m;
      y /= m;
      sa.style.display = 'block';
      sa.style.left = `${(x * 0.88 * innerWidth) / 2 + innerWidth / 2 - 14}px`;
      sa.style.top = `${(-y * 0.8 * innerHeight) / 2 + innerHeight / 2 - 14}px`;
      sa.style.transform = `rotate(${Math.atan2(x, y)}rad)`;
    }
  }
  if (toastTimer > 0 && (toastTimer -= 1 / 60) <= 0) $('hToast').style.opacity = 0;
}

// ---------- main loop ----------
let last = performance.now(), fpsN = 0, fpsT = 0, fpsAvg = [];
let benchT = 0, benchStart = null;
const benchDts = [];
function frame(now) {
  const rawMs = now - last;
  const dt = Math.min(0.1, rawMs / 1000);
  last = now;
  if (BENCH && app.mode === 'play') {
    if (benchStart === null) {
      benchStart = now;
      window.__benchFirstFrameEpoch = performance.timeOrigin + now;
    } else {
      benchT = (now - benchStart) / 1000;
      if (benchT > BENCH.warmup && benchT <= BENCH.warmup + BENCH.duration) benchDts.push(rawMs);
      if (benchT > BENCH.warmup + BENCH.duration && !window.__benchResult) {
        const gl = renderer.getContext();
        const dbg = gl.getExtension('WEBGL_debug_renderer_info');
        window.__benchResult = {
          ...frameStats(benchDts),
          renderer: `three.js r${THREE.REVISION} WebGL2 · ${dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)}`,
          canvas: [renderer.domElement.width, renderer.domElement.height],
          js_heap_mb: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
          entities: { shades: app.game.shades.length, motes: app.game.motes.length },
        };
      }
    }
  }
  if (app.mode === 'play') {
    readInput();
    acc += dt;
    while (acc >= DT && app.mode === 'play') {
      app.game.step(input);
      simT += DT;
      acc -= DT;
    }
  }
  if (app.game) render(now);
  // FPS meter (shown bottom-left; average of the last 30 s logged for evidence)
  fpsN++;
  fpsT += dt;
  if (fpsT >= 1) {
    const fps = fpsN / fpsT;
    fpsAvg.push(fps);
    if (fpsAvg.length > 30) fpsAvg.shift();
    const avg = fpsAvg.reduce((a, b) => a + b, 0) / fpsAvg.length;
    $('hFps').textContent = `${Math.round(fps)} FPS · TB 30s: ${avg.toFixed(1)} · ${innerWidth}×${innerHeight}`;
    window.__fps = { now: fps, avg30: avg, size: [innerWidth, innerHeight] };
    fpsN = 0;
    fpsT = 0;
  }
  requestAnimationFrame(frame);
}
if (BENCH) {
  renderer.setPixelRatio(1);
  loadNight(1, { seed: BENCH.seed, scenario: benchScenario(BENCH.seed), bench: {} });
  app.mode = 'play';
  show(null);
} else {
  loadNight(1);
  show('menu');
}
requestAnimationFrame(frame);
