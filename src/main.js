// Browser entry: runs the SAME core sim as headless at fixed 60 Hz and renders it with three.js.
// UI flow: menu → night intro → play → result → next night … → dawn. Render-only extras never touch state.
import * as THREE from 'three';
import { Game, DT, STD, emptyInput } from './core/game.js';
import { MAPS } from './core/maps.js';
import { buildWorld, PAL } from './render/world.js';
import { Audio } from './render/audio.js';

const contract = await (await fetch('game.contract.json')).json();
const T = contract.tuning;
const $ = (id) => document.getElementById(id);

// ---------- settings (persisted) ----------
const settings = { volume: 0.6, sens: 1 };
try {
  Object.assign(settings, JSON.parse(localStorage.getItem('ddl-settings') || '{}'));
} catch {}
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
const moon = new THREE.DirectionalLight('#9fb0ff', 0.35);
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
  g.add(pole, shell, core, cap, light, ring);
  return { g, shellMat, coreMat, light, ring };
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

// ---------- app state ----------
const app = { mode: 'menu', night: 1, totals: {}, game: null, view: null, world: null, settingsFrom: 'menu' };
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
  for (const o of ['menu', 'intro', 'result', 'pause', 'settings']) $(o).classList.toggle('hidden', o !== id);
  $('hud').classList.toggle('hidden', !(app.mode === 'play' || app.mode === 'pause'));
}

function loadNight(n) {
  if (app.world) scene.remove(app.world.group);
  for (const o of app.view?.all ?? []) scene.remove(o);
  app.night = n;
  const map = MAPS[n];
  const seed = (Date.now() & 0x7fffffff) >>> 0;
  app.game = new Game(T, { seed, night: n, onEvent });
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
  show('settings');
}

$('bPlay').onclick = () => {
  audio.ensure();
  app.totals = {};
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
$('sSens').oninput = (e) => {
  settings.sens = +e.target.value;
  saveSettings();
};
$('bNext').onclick = () => nextAction();
let nextAction = () => {};

function showResult({ result, reason }) {
  const g = app.game;
  app.mode = 'result';
  const won = result === 'won';
  if (won) app.totals[app.night] = g.score;
  audio.sfx(won ? 'win' : 'lose');
  const why = { all_lit: 'Mọi Đèn Lồng Lớn đã sáng!', dawn: 'Bình minh tới khi đảo vẫn chìm trong sương.', no_flames: 'Ngọn lửa của Mây đã tắt...' }[reason];
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
    show('result');
  }, 1000);
}

// ---------- input ----------
addEventListener('keydown', (e) => {
  if (e.code === 'Escape' || e.code === 'KeyP') {
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
  if (keys.has('KeyW') || keys.has('ArrowUp')) z += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) z -= 1;
  if (keys.has('KeyA')) x += 1;
  if (keys.has('KeyD')) x -= 1;
  if (keys.has('ArrowLeft')) camYaw += 0.03 * settings.sens;
  if (keys.has('ArrowRight')) camYaw -= 0.03 * settings.sens;
  input.move = [x, z];
  input.cam_yaw_deg = (camYaw * 180) / Math.PI;
  input.jump = keys.has('Space');
  input.interact = keys.has('KeyE');
  input.pulse = keys.has('KeyF');
  input.dash = keys.has('ShiftLeft') || keys.has('ShiftRight');
}

// ---------- events → feedback ----------
let toastTimer = 0, shake = 0, lastSec = -1;
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
    case 'lantern_lit': {
      audio.sfx('lit');
      toast(`Đèn ${e.data.lantern_id} đã sáng lại!`);
      skyLanterns(app.view.lanterns.get(e.data.lantern_id).g.position);
      break;
    }
    case 'pulse': {
      audio.sfx('pulse');
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshBasicMaterial({ color: PAL.core, transparent: true, opacity: 0.5 }));
      m.position.set(p[0], p[1] + STD.pulseCenterY, p[2]);
      add(m);
      fx.push({ obj: m, t: 0, dur: 0.45, kind: 'pulse' });
      if (e.data.stunned_ids.length) toast(`Xua được ${e.data.stunned_ids.length} Bóng Mực!`);
      break;
    }
    case 'player_hit':
      audio.sfx('hit');
      shake = 0.45;
      toast(e.data.by === 'fall' ? `Mây rơi xuống biển mây! Mất ${e.data.lost} đom đóm` : `Bóng Mực chạm vào Mây! Rơi ${e.data.dropped} đom đóm`);
      break;
    case 'shade_spawned': audio.sfx('shade'); break;
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
  // player
  v.player.g.position.set(...p.pos);
  v.player.g.rotation.y = Math.atan2(p.facing[0], p.facing[1]);
  v.player.g.visible = p.dead === 0 && (p.invuln === 0 || Math.floor(t * 12) % 2 === 0);
  const glow = 0.6 + (p.carried / T.carry_capacity) * 2.4; // creative: hat lantern glows with carried light
  v.player.lampLight.intensity = glow * (0.9 + 0.1 * Math.sin(t * 9));
  v.player.lamp.rotation.z = Math.sin(t * 3) * 0.25;
  // lanterns + island brightening
  let lit = 0;
  for (const l of g.lanterns) {
    const lv = v.lanterns.get(l.id);
    const frac = l.lit ? 1 : l.deposited / T.lantern_cost;
    if (l.lit) lit++;
    lv.shellMat.color.set(l.lit ? PAL.lit : PAL.off);
    lv.shellMat.emissive.set(PAL.lit);
    lv.shellMat.emissiveIntensity = l.lit ? 0.9 + 0.1 * Math.sin(t * 4) : frac * 0.5;
    lv.coreMat.opacity = l.lit ? 1 : frac * 0.6;
    lv.light.intensity = l.lit ? 30 : frac * 4;
    lv.ring.material.opacity = l.lit ? 0.35 : 0;
  }
  const k = lit / g.lanterns.length;
  ambient.intensity = 0.15 + 0.55 * k;
  scene.background.copy(SKY).lerp(WARMSKY, k * 0.6);
  scene.fog.color.copy(FOG).lerp(WARMSKY, k * 0.6);
  scene.fog.density = 0.03 - 0.018 * k;
  // motes
  syncMap(v.motes, g.motes, makeMote);
  for (const m of g.motes) {
    const mv = v.motes.get(m.id);
    mv.g.position.set(m.pos[0], m.pos[1] + 0.8 + Math.sin(t * 2 + mv.phase) * 0.25, m.pos[2]);
    mv.g.visible = !(m.kind === 'dropped' && m.ttl < 90 && Math.floor(t * 8) % 2);
  }
  // shades
  syncMap(v.shades, g.shades, makeShade);
  for (const s of g.shades) {
    const sv = v.shades.get(s.id);
    const stun = s.state === 'stunned';
    const rise = s.state === 'spawning' ? 1 - s.ticks / STD.spawningTicks : 1;
    sv.g.position.set(s.pos[0], s.pos[1] - (1 - rise) * 2 + Math.sin(t * 2 + sv.phase) * 0.2, s.pos[2]);
    sv.g.lookAt(p.pos[0], sv.g.position.y, p.pos[2]);
    sv.mat.color.set(stun ? PAL.shadeStun : PAL.shade);
    sv.mat.opacity = stun ? 0.6 : 0.95 * rise;
    sv.rimMat.opacity = s.state === 'chase' ? 0.55 : 0.3;
    sv.eyeMat.color.set(stun ? PAL.core : '#d9b8ff');
    sv.g.rotation.z = stun ? Math.sin(t * 10) * 0.3 : 0;
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
  const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
  const target = tmpV.set(p.pos[0], p.pos[1] + 1.2, p.pos[2]);
  camera.position.lerp(new THREE.Vector3(p.pos[0] - fx * 9, p.pos[1] + 5, p.pos[2] - fz * 9), 0.15);
  if (shake > 0) {
    camera.position.x += (Math.random() - 0.5) * shake;
    camera.position.y += (Math.random() - 0.5) * shake;
    shake = Math.max(0, shake - 0.02);
  }
  camera.lookAt(target);
  hud(lit);
  renderer.render(scene, camera);
}

function hud(lit) {
  const g = app.game, p = g.player;
  $('hFlames').innerHTML = Array.from({ length: Math.max(T.flames, p.flames) }, (_, i) => `<div class="flame ${i < p.flames ? '' : 'off'}"></div>`).join('');
  const left = Math.max(0, Math.ceil(g.timeLeft() - 1e-9));
  $('hClock').textContent = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
  $('hClock').classList.toggle('danger', left <= 30);
  if (app.mode === 'play' && left <= 10 && left > 0 && left !== lastSec) audio.sfx('tick');
  lastSec = left;
  $('hLit').textContent = `${lit}/${g.lanterns.length}`;
  $('hScore').textContent = totalScore() + g.score;
  [...$('hMotes').children].forEach((c, i) => c.classList.toggle('on', i < p.carried));
  const dashReady = p.charm > 0 ? 1 : 1 - p.dashCd / g.T.dashCd;
  const pulseReady = p.carried < T.pulse_cost ? 0 : 1 - p.pulseCd / g.T.pulseCd;
  $('cdDash').style.setProperty('--p', `${dashReady * 100}%`);
  $('cdPulse').style.setProperty('--p', `${pulseReady * 100}%`);
  // hint near lantern
  let hint = '';
  const nearL = g.lanterns.find((l) => !l.lit && Math.hypot(l.pos[0] - p.pos[0], l.pos[2] - p.pos[2]) <= T.interact_radius);
  if (nearL) hint = `E — Nạp ánh sáng (${nearL.deposited}/${T.lantern_cost})`;
  else if (p.carried >= T.carry_capacity) hint = 'Đã mang đầy ánh sáng, hãy về thắp đèn!';
  $('hHint').textContent = hint;
  const st = [];
  if (p.charm > 0) st.push(`<span style="color:${PAL.scarf}">Bùa Gió ${Math.ceil(p.charm / 60)}s</span>`);
  if (g.wind.warn && !g.wind.active) st.push('<span style="color:#a6d98a">Gió sắp nổi!</span>');
  if (g.wind.active) st.push('<span style="color:#a6d98a">Gió mạnh!</span>');
  if (p.dead > 0) st.push(`<span style="color:${PAL.danger}">Đang hồi sinh...</span>`);
  $('hStatus').innerHTML = st.join(' · ');
  // arrow to nearest unlit lantern when off-screen
  const arrow = $('hArrow');
  const unlit = g.lanterns.filter((l) => !l.lit).sort((a, b) => Math.hypot(a.pos[0] - p.pos[0], a.pos[2] - p.pos[2]) - Math.hypot(b.pos[0] - p.pos[0], b.pos[2] - p.pos[2]))[0];
  arrow.style.display = 'none';
  if (unlit) {
    const v = new THREE.Vector3(unlit.pos[0], unlit.pos[1] + 3.6, unlit.pos[2]).project(camera);
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
  if (toastTimer > 0 && (toastTimer -= 1 / 60) <= 0) $('hToast').style.opacity = 0;
}

// ---------- main loop ----------
let last = performance.now(), fpsN = 0, fpsT = 0, fpsAvg = [];
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
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
loadNight(1);
show('menu');
requestAnimationFrame(frame);
