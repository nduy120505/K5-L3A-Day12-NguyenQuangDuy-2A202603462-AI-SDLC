// Browser entry: runs the SAME core sim as headless at fixed 60 Hz and renders it with three.js.
// Render-only extras (sky lanterns, hat-lantern glow, etc.) never touch game state.
import * as THREE from 'three';
import { Game, DT, WORLD, emptyInput } from './core/game.js';

const contract = await (await fetch('game.contract.json')).json();
const T = contract.tuning;

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const DARK = new THREE.Color('#120a24');
const WARM_SKY = new THREE.Color('#3b2340');
scene.background = DARK.clone();
scene.fog = new THREE.FogExp2(DARK.clone(), 0.035);

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 400);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const hemi = new THREE.HemisphereLight('#6b5a9e', '#1a0f24', 0.35);
scene.add(hemi);
const moon = new THREE.DirectionalLight('#9fa8ff', 0.25);
moon.position.set(-30, 50, -20);
scene.add(moon);

// deterministic render-only rng for decoration
let decoSeed = 7;
const drand = () => ((decoSeed = (decoSeed * 16807) % 2147483647) / 2147483647);

// island
const islandMat = new THREE.MeshStandardMaterial({ color: '#2d3b3a', roughness: 0.95 });
const island = new THREE.Mesh(new THREE.CylinderGeometry(WORLD.islandRadius + 1, WORLD.islandRadius - 4, 5, 64), islandMat);
island.position.y = -2.5;
scene.add(island);
const grassMat = new THREE.MeshStandardMaterial({ color: '#24402f', roughness: 1 });
const grass = new THREE.Mesh(new THREE.CircleGeometry(WORLD.islandRadius + 0.9, 64), grassMat);
grass.rotation.x = -Math.PI / 2;
grass.position.y = 0.01;
scene.add(grass);
// decoration: trees & rocks
const treeMat = new THREE.MeshStandardMaterial({ color: '#1f3a2c', roughness: 1 });
const trunkMat = new THREE.MeshStandardMaterial({ color: '#3a2a22' });
for (let i = 0; i < 40; i++) {
  const a = drand() * Math.PI * 2;
  const r = 8 + drand() * 31;
  const x = Math.sin(a) * r, z = Math.cos(a) * r;
  if (Math.abs(r - WORLD.lanternRingRadius) < 4) continue;
  const g = new THREE.Group();
  const h = 2 + drand() * 2.5;
  const crown = new THREE.Mesh(new THREE.ConeGeometry(0.9 + drand() * 0.6, h, 7), treeMat);
  crown.position.y = h / 2 + 0.8;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.8), trunkMat);
  trunk.position.y = 0.4;
  g.add(trunk, crown);
  g.position.set(x, 0, z);
  scene.add(g);
}
// cloud sea
const cloudMat = new THREE.MeshStandardMaterial({ color: '#3a2d5c', roughness: 1, transparent: true, opacity: 0.85 });
const clouds = [];
for (let i = 0; i < 70; i++) {
  const a = drand() * Math.PI * 2;
  const r = 46 + drand() * 60;
  const c = new THREE.Mesh(new THREE.SphereGeometry(4 + drand() * 6, 12, 8), cloudMat);
  c.position.set(Math.sin(a) * r, -6 - drand() * 4, Math.cos(a) * r);
  c.scale.y = 0.45;
  clouds.push(c);
  scene.add(c);
}
// stars
const starGeo = new THREE.BufferGeometry();
const starPos = [];
for (let i = 0; i < 600; i++) {
  const a = drand() * Math.PI * 2, e = drand() * 1.2 + 0.15, R = 180;
  starPos.push(Math.cos(e) * Math.sin(a) * R, Math.sin(e) * R, Math.cos(e) * Math.cos(a) * R);
}
starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: '#fff3dc', size: 0.9, fog: false })));

// ---------- entities ----------
const WARM = new THREE.Color('#ffb347');

function makeLantern() {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: '#4a2f22' });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 3.2), wood);
  pole.position.y = 1.6;
  const arm = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 0.12), wood);
  arm.position.set(0.5, 3.1, 0);
  const shellMat = new THREE.MeshStandardMaterial({ color: '#5a2a2a', emissive: '#000000', roughness: 0.6 });
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), shellMat);
  shell.scale.y = 1.25;
  shell.position.set(1.0, 2.45, 0);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 0.15), wood);
  cap.position.set(1.0, 3.15, 0);
  const light = new THREE.PointLight('#ffb347', 0, 22, 1.6);
  light.position.set(1.0, 2.4, 0);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(T.safe_radius - 0.12, T.safe_radius, 64),
    new THREE.MeshBasicMaterial({ color: '#ffb347', transparent: true, opacity: 0, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  g.add(pole, arm, shell, cap, light, ring);
  return { g, shellMat, light, ring, litAt: -1 };
}

function makePlayer() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.42, 1.0, 12), new THREE.MeshStandardMaterial({ color: '#3d6fa8' }));
  body.position.y = 0.5;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), new THREE.MeshStandardMaterial({ color: '#f1c9a5' }));
  head.position.y = 1.3;
  // nón lá (conical hat)
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.45, 24), new THREE.MeshStandardMaterial({ color: '#e8cf8a', roughness: 0.8 }));
  hat.position.y = 1.62;
  // small lantern hanging from hat brim
  const string = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.35), new THREE.MeshBasicMaterial({ color: '#222' }));
  string.position.set(0, 1.28, 0.62);
  const lampMat = new THREE.MeshStandardMaterial({ color: '#ff8a3d', emissive: '#ff8a3d', emissiveIntensity: 1 });
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), lampMat);
  lamp.scale.y = 1.3;
  lamp.position.set(0, 1.05, 0.62);
  const lampLight = new THREE.PointLight('#ffb347', 2, 9, 1.5);
  lampLight.position.copy(lamp.position);
  g.add(body, head, hat, string, lamp, lampLight);
  return { g, lamp, lampMat, lampLight };
}

function makeShade() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#1a0b2e', emissive: '#3b1466', emissiveIntensity: 0.6, transparent: true, opacity: 0.92, roughness: 0.3 });
  const blob = new THREE.Mesh(new THREE.SphereGeometry(0.8, 18, 14), mat);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.0, 14), mat);
  tail.rotation.x = Math.PI;
  tail.position.y = -0.8;
  const eyeMat = new THREE.MeshBasicMaterial({ color: '#d9b8ff' });
  const e1 = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), eyeMat);
  const e2 = e1.clone();
  e1.position.set(-0.25, 0.15, 0.7);
  e2.position.set(0.25, 0.15, 0.7);
  g.add(blob, tail, e1, e2);
  return { g, mat, eyeMat };
}

const moteGeo = new THREE.SphereGeometry(0.16, 10, 8);
const moteMat = new THREE.MeshBasicMaterial({ color: '#ffe27a' });
const haloMat = new THREE.MeshBasicMaterial({ color: '#ffb347', transparent: true, opacity: 0.25 });
const haloGeo = new THREE.SphereGeometry(0.4, 10, 8);
function makeMote() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(moteGeo, moteMat), new THREE.Mesh(haloGeo, haloMat));
  return { g, phase: 0 };
}

// ---------- game state / input ----------
let game, view, effects, simTime, acc, started = false, ended = false;
const input = emptyInput();
const keys = new Set();
let camYaw = 0;

function newGame() {
  for (const o of view?.all ?? []) scene.remove(o);
  const seed = (Date.now() & 0x7fffffff) >>> 0;
  game = new Game(T, { seed, onEvent: onGameEvent });
  view = { lanterns: new Map(), shades: new Map(), motes: new Map(), all: [] };
  effects = [];
  simTime = 0;
  acc = 0;
  ended = false;
  camYaw = 0;
  for (const l of game.lanterns) {
    const v = makeLantern();
    v.g.position.set(l.pos[0], 0, l.pos[2]);
    v.g.rotation.y = Math.atan2(-l.pos[0], -l.pos[2]) + Math.PI / 2;
    view.lanterns.set(l.id, v);
    add(v.g);
  }
  view.player = makePlayer();
  add(view.player.g);
  document.getElementById('end').classList.add('hidden');
  document.getElementById('lanterns').innerHTML = game.lanterns.map(() => '<span></span>').join('');
}
function add(o) {
  scene.add(o);
  view.all.push(o);
}

addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (!started && (e.code === 'Enter' || e.code === 'Space')) startGame();
  else if (ended && (e.code === 'KeyR' || e.code === 'Enter')) newGame();
  else if (e.code === 'KeyR' && started && !ended) newGame();
  if (['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
let dragging = false, lastX = 0;
renderer.domElement.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; });
addEventListener('pointerup', () => (dragging = false));
addEventListener('pointermove', (e) => {
  if (!dragging) return;
  camYaw -= (e.clientX - lastX) * 0.006;
  lastX = e.clientX;
});
document.getElementById('startBtn').onclick = startGame;
document.getElementById('againBtn').onclick = newGame;

function startGame() {
  started = true;
  document.getElementById('start').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  document.getElementById('controls').classList.remove('hidden');
}

function readInput() {
  // camera looks along (sin yaw, cos yaw); screen-right is contract -x.
  let x = 0, z = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) z += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) z -= 1;
  if (keys.has('KeyA')) x += 1;
  if (keys.has('KeyD')) x -= 1;
  if (keys.has('ArrowLeft')) camYaw += 0.035;
  if (keys.has('ArrowRight')) camYaw -= 0.035;
  input.move = [x, z];
  input.cam_yaw_deg = (camYaw * 180) / Math.PI;
  input.jump = keys.has('Space');
  input.interact = keys.has('KeyE');
  input.pulse = keys.has('KeyF');
}

// ---------- events → feedback ----------
const toastEl = document.getElementById('toast');
let toastTimer = 0;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.style.opacity = 1;
  toastTimer = 2.2;
}
let shake = 0;
function onGameEvent(e) {
  const p = game.player.pos;
  switch (e.name) {
    case 'lantern_lit': {
      const v = view.lanterns.get(e.data.lantern_id);
      v.litAt = simTime;
      toast(`Đèn ${e.data.lantern_id} đã sáng lại!`);
      spawnSkyLanterns(v.g.position);
      break;
    }
    case 'deposit': toast(`Nạp ${e.data.amount} ánh sáng (${e.data.deposited}/${T.lantern_cost})`); break;
    case 'pulse': {
      const ring = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshBasicMaterial({ color: '#ffd98a', transparent: true, opacity: 0.5 }));
      ring.position.set(p[0], 0.8, p[2]);
      add(ring);
      effects.push({ obj: ring, t: 0, dur: 0.45, kind: 'pulse' });
      if (e.data.stunned_ids.length) toast(`Xua được ${e.data.stunned_ids.length} Bóng Mực!`);
      break;
    }
    case 'player_hit': shake = 0.4; toast(`Bóng Mực chạm vào Mây! Rơi mất ${e.data.dropped} ánh sáng`); break;
    case 'shade_spawned': toast('Một Bóng Mực mới trồi lên từ sương...'); break;
    case 'game_over': showEnd(e.data); break;
  }
}

// creative (render-only): each lit lantern releases little sky lanterns that drift upward
function spawnSkyLanterns(pos) {
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.17, 0.42, 8), new THREE.MeshBasicMaterial({ color: '#ffb347', transparent: true, opacity: 0.95 }));
    m.position.set(pos.x + (Math.random() - 0.5) * 3, 3, pos.z + (Math.random() - 0.5) * 3);
    add(m);
    effects.push({ obj: m, t: 0, dur: 9, kind: 'sky', vx: (Math.random() - 0.5) * 0.6, vz: (Math.random() - 0.5) * 0.6, vy: 1.4 + Math.random() });
  }
}

function showEnd({ result, reason }) {
  ended = true;
  const reasons = { all_lit: 'Mọi Đèn Lồng Lớn đã sáng. Đảo Bến ấm áp trở lại!', dawn: 'Bình minh đã tới khi đảo vẫn còn chìm trong sương.', no_flames: 'Ngọn lửa của Mây đã tắt...' };
  document.getElementById('endTitle').textContent = result === 'won' ? 'Chiến thắng!' : 'Thất bại';
  document.getElementById('endText').innerHTML = `${reasons[reason]}<br><br>Điểm: <b style="color:var(--warm2);font-size:26px">${game.score}</b>`;
  setTimeout(() => document.getElementById('end').classList.remove('hidden'), 900);
}

// ---------- sync view with sim ----------
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
  for (const [id, v] of map) if (!seen.has(id)) { scene.remove(v.g); map.delete(id); }
}

const hintEl = document.getElementById('hint');
function render(now) {
  const t = now / 1000;
  const p = game.player;
  // player
  const pv = view.player;
  pv.g.position.set(p.pos[0], p.pos[1], p.pos[2]);
  pv.g.rotation.y = p.facing;
  pv.g.visible = p.invuln === 0 || Math.floor(t * 12) % 2 === 0;
  // creative: hat lantern glows brighter with the light Mây carries
  const glow = 0.6 + (p.carried / T.carry_capacity) * 2.4;
  pv.lampLight.intensity = glow * (0.9 + 0.1 * Math.sin(t * 9));
  pv.lampMat.emissiveIntensity = glow;
  pv.lamp.rotation.z = Math.sin(t * 3) * 0.25;

  // lanterns
  let lit = 0;
  for (const l of game.lanterns) {
    const v = view.lanterns.get(l.id);
    v.g.position.set(l.pos[0], 0, l.pos[2]);
    const frac = l.lit ? 1 : l.deposited / T.lantern_cost;
    if (l.lit) lit++;
    v.shellMat.emissive.copy(WARM);
    v.shellMat.emissiveIntensity = l.lit ? 1.6 + 0.2 * Math.sin(t * 4) : frac * 0.6;
    v.shellMat.color.set(l.lit ? '#ffcf7a' : '#5a2a2a');
    v.light.intensity = l.lit ? 30 : frac * 4;
    v.ring.material.opacity = l.lit ? 0.35 : 0;
  }
  // island brightens as lanterns are lit
  const k = lit / game.lanterns.length;
  scene.background.copy(DARK).lerp(WARM_SKY, k);
  scene.fog.color.copy(scene.background);
  scene.fog.density = 0.035 - 0.02 * k;
  hemi.intensity = 0.35 + 0.6 * k;
  grassMat.color.set('#24402f').lerp(new THREE.Color('#4f7a45'), k);
  cloudMat.color.set('#3a2d5c').lerp(new THREE.Color('#a87a8f'), k);

  // motes
  syncMap(view.motes, game.motes, makeMote);
  for (const m of game.motes) {
    const v = view.motes.get(m.id);
    v.g.position.set(m.pos[0] + Math.sin(t + v.phase) * 0.15, 0.8 + Math.sin(t * 2 + v.phase) * 0.25, m.pos[2]);
  }
  // shades
  syncMap(view.shades, game.shades, makeShade);
  for (const s of game.shades) {
    const v = view.shades.get(s.id);
    const stunned = s.state === 'stunned';
    v.g.position.set(s.pos[0], s.pos[1] + Math.sin(t * 2 + v.phase) * 0.2, s.pos[2]);
    v.g.lookAt(p.pos[0], v.g.position.y, p.pos[2]);
    v.mat.opacity = stunned ? 0.45 : 0.92;
    v.eyeMat.color.set(stunned ? '#ffd98a' : '#d9b8ff');
    v.g.rotation.z = stunned ? Math.sin(t * 10) * 0.3 : 0;
  }
  // effects
  for (let i = effects.length - 1; i >= 0; i--) {
    const fx = effects[i];
    fx.t += 1 / 60;
    if (fx.kind === 'pulse') {
      const s = 1 + (fx.t / fx.dur) * (T.pulse_radius - 1);
      fx.obj.scale.setScalar(s);
      fx.obj.material.opacity = 0.5 * (1 - fx.t / fx.dur);
    } else {
      fx.obj.position.x += fx.vx / 60;
      fx.obj.position.z += fx.vz / 60;
      fx.obj.position.y += fx.vy / 60;
      fx.obj.material.opacity = Math.min(1, (fx.dur - fx.t) / 2);
    }
    if (fx.t >= fx.dur) { scene.remove(fx.obj); effects.splice(i, 1); }
  }
  for (const c of clouds) c.position.x += Math.sin(t * 0.1 + c.position.z) * 0.005;

  // camera (third person, behind along yaw)
  const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
  const target = new THREE.Vector3(p.pos[0], p.pos[1] + 1.2, p.pos[2]);
  const desired = new THREE.Vector3(p.pos[0] - fx * 9, p.pos[1] + 5, p.pos[2] - fz * 9);
  camera.position.lerp(desired, 0.15);
  if (shake > 0) {
    camera.position.x += (Math.random() - 0.5) * shake;
    camera.position.y += (Math.random() - 0.5) * shake;
    shake = Math.max(0, shake - 0.02);
  }
  camera.lookAt(target);

  // HUD
  document.getElementById('flames').innerHTML = Array.from({ length: Math.max(T.flames, p.flames) }, (_, i) => `<i class="flame ${i < p.flames ? '' : 'off'}"></i>`).join(' ');
  document.getElementById('carried').textContent = `${p.carried} / ${T.carry_capacity}`;
  document.getElementById('litcount').textContent = `${lit}/${game.lanterns.length}`;
  [...document.getElementById('lanterns').children].forEach((el, i) => el.classList.toggle('lit', game.lanterns[i].lit));
  const left = Math.max(0, Math.ceil(game.timeLeft()));
  document.getElementById('time').textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  document.getElementById('score').textContent = game.score;
  const cdTotal = Math.round(T.pulse_cooldown_s * 60);
  const ready = p.carried >= T.pulse_cost ? 1 - game.pulseCooldown / cdTotal : 0;
  document.querySelector('#cool > div').style.width = `${ready * 100}%`;
  // contextual hint
  let hint = '';
  if (!ended) {
    const nearL = game.lanterns.find((l) => !l.lit && Math.hypot(l.pos[0] - p.pos[0], l.pos[2] - p.pos[2]) <= T.interact_radius);
    if (nearL) hint = p.carried > 0 ? `Nhấn E để nạp ánh sáng vào đèn ${nearL.id} (${nearL.deposited}/${T.lantern_cost})` : `Đèn ${nearL.id} cần ${T.lantern_cost - nearL.deposited} ánh sáng nữa. Hãy gom đom đóm!`;
    else if (p.carried >= T.carry_capacity) hint = 'Đã mang đầy ánh sáng. Hãy về thắp đèn!';
  }
  hintEl.textContent = hint;
  if (toastTimer > 0 && (toastTimer -= 1 / 60) <= 0) toastEl.style.opacity = 0;

  renderer.render(scene, camera);
}

// ---------- main loop: fixed 60 Hz sim, render every frame ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (started && !ended) {
    readInput();
    acc += dt;
    while (acc >= DT) {
      game.step(input);
      simTime += DT;
      acc -= DT;
    }
  }
  render(now);
  requestAnimationFrame(frame);
}
newGame();
requestAnimationFrame(frame);
