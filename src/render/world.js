// Builds the visual terrain for each night from the standard maps (render-only).
import * as THREE from 'three';

export const PAL = {
  sky: '#0E1430', fog: '#1B2350', grass: '#2F5D50', sand: '#C9B48A', wood: '#6B4A2F', sea: '#12384A',
  lit: '#FFB347', core: '#FFE9B0', off: '#5B5F6E', moteCore: '#FFF6C2', moteHalo: '#FFE58A',
  shade: '#120A1A', shadeRim: '#7A3CFF', shadeStun: '#3A3450', shirt: '#E8E2D0', scarf: '#C8102E',
  gold: '#F2C14E', drifter: '#8FA3B8', danger: '#FF5A5F', text: '#F5F1E6',
};

let seed = 11;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

function islandDisc(group, cx, cz, r, mats, height = 5) {
  const rock = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.6, r - 4, height, 48), mats.sand);
  rock.position.set(cx, -height / 2 - 0.05, cz);
  const top = new THREE.Mesh(new THREE.CircleGeometry(r, 48), mats.grass);
  top.rotation.x = -Math.PI / 2;
  top.position.set(cx, 0.01, cz);
  const beach = new THREE.Mesh(new THREE.RingGeometry(r - 1.2, r + 0.6, 48), mats.sand);
  beach.rotation.x = -Math.PI / 2;
  beach.position.set(cx, 0.02, cz);
  group.add(rock, top, beach);
}

function trees(group, mats, count, place) {
  const crownGeo = new THREE.ConeGeometry(1, 1, 7);
  const trunkGeo = new THREE.CylinderGeometry(0.15, 0.2, 0.8);
  for (let i = 0; i < count; i++) {
    const p = place();
    if (!p) continue;
    const h = 2 + rnd() * 2.5;
    const crown = new THREE.Mesh(crownGeo, mats.tree);
    crown.scale.set(0.9 + rnd() * 0.6, h, 0.9 + rnd() * 0.6);
    crown.position.set(p[0], p[1] + h / 2 + 0.8, p[2]);
    const trunk = new THREE.Mesh(trunkGeo, mats.woodDark);
    trunk.position.set(p[0], p[1] + 0.4, p[2]);
    group.add(crown, trunk);
  }
}

function pad(group, pos, mats) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.15, 24), mats.pad);
  m.position.set(pos[0], pos[1] + 0.08, pos[2]);
  group.add(m);
  return m;
}

export function buildWorld(map) {
  seed = 11 + map.night;
  const g = new THREE.Group();
  const mats = {
    grass: new THREE.MeshLambertMaterial({ color: PAL.grass }),
    sand: new THREE.MeshLambertMaterial({ color: PAL.sand }),
    wood: new THREE.MeshLambertMaterial({ color: PAL.wood }),
    woodDark: new THREE.MeshLambertMaterial({ color: '#4a3220' }),
    tree: new THREE.MeshLambertMaterial({ color: '#244a3e' }),
    sea: new THREE.MeshLambertMaterial({ color: PAL.sea, transparent: true, opacity: 0.9 }),
    stone: new THREE.MeshLambertMaterial({ color: '#7d7a8c' }),
    pad: new THREE.MeshBasicMaterial({ color: PAL.gold }),
  };
  const pads = [];
  // cloud sea
  const sea = new THREE.Mesh(new THREE.CircleGeometry(260, 48), mats.sea);
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(map.bounds.cx, -9, map.bounds.cz);
  g.add(sea);
  const puffGeo = new THREE.SphereGeometry(1, 10, 8);
  for (let i = 0; i < 60; i++) {
    const a = rnd() * Math.PI * 2, r = map.bounds.r + 8 + rnd() * 70;
    const c = new THREE.Mesh(puffGeo, mats.sea);
    const s = 4 + rnd() * 6;
    c.scale.set(s, s * 0.4, s);
    c.position.set(map.bounds.cx + Math.cos(a) * r, -7 - rnd() * 3, map.bounds.cz + Math.sin(a) * r);
    g.add(c);
  }

  if (map.night === 1) {
    islandDisc(g, 0, 0, 40, mats);
    trees(g, mats, 40, () => {
      const a = rnd() * Math.PI * 2, r = 6 + rnd() * 32;
      return Math.abs(r - 25) < 4 || Math.abs(r - 33) < 2 || Math.abs(r - 12) < 2 ? null : [Math.cos(a) * r, 0, Math.sin(a) * r];
    });
  } else if (map.night === 2) {
    islandDisc(g, 0, 0, 28, mats);
    islandDisc(g, 70, 0, 28, mats);
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(18, 0.3, 4), mats.wood);
    bridge.position.set(35, -0.13, 0);
    g.add(bridge);
    for (let x = 27; x <= 43; x += 1.2) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.32, 4.05), mats.woodDark);
      plank.position.set(x, -0.1, 0);
      g.add(plank);
    }
    for (const p of map.jumpPads) pads.push(pad(g, p.pos, mats));
    // areca palms (cau)
    const palm = () => {
      const isB = rnd() < 0.5, a = rnd() * Math.PI * 2, r = 4 + rnd() * 21;
      if (Math.abs(r - 10) < 1.5 || Math.abs(r - 22) < 1.5 || Math.abs(r - 20) < 3) return null;
      return [(isB ? 70 : 0) + Math.cos(a) * r, 0, Math.sin(a) * r];
    };
    const stemGeo = new THREE.CylinderGeometry(0.12, 0.16, 5);
    const leafGeo = new THREE.ConeGeometry(1.4, 0.8, 6);
    for (let i = 0; i < 30; i++) {
      const p = palm();
      if (!p) continue;
      const stem = new THREE.Mesh(stemGeo, mats.woodDark);
      stem.position.set(p[0], 2.5, p[2]);
      const leaf = new THREE.Mesh(leafGeo, mats.tree);
      leaf.position.set(p[0], 5.2, p[2]);
      g.add(stem, leaf);
    }
  } else {
    islandDisc(g, 0, 0, 45, mats);
    // tier 1: half annulus 12–24 m on z > 0, height 3
    const shape = new THREE.Shape();
    const N = 40;
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI;
      const fn = i === 0 ? 'moveTo' : 'lineTo';
      shape[fn](24 * Math.cos(a), -24 * Math.sin(a));
    }
    for (let i = N; i >= 0; i--) {
      const a = (i / N) * Math.PI;
      shape.lineTo(12 * Math.cos(a), -12 * Math.sin(a));
    }
    const tier1 = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 3, bevelEnabled: false }), [mats.grass, mats.stone]);
    tier1.rotation.x = -Math.PI / 2;
    g.add(tier1);
    const tier2 = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 6, 40), [mats.stone, mats.grass, mats.stone]);
    tier2.position.y = 3;
    g.add(tier2);
    // ramps at 30° and 150°
    for (const d of [30, 150]) {
      const a = (d * Math.PI) / 180;
      const len = Math.hypot(6, 3);
      const ramp = new THREE.Mesh(new THREE.BoxGeometry(3, 0.3, len), mats.wood);
      ramp.position.set(Math.cos(a) * 27, 1.5 - 0.15, Math.sin(a) * 27);
      ramp.lookAt(Math.cos(a) * 24, 3 - 0.15, Math.sin(a) * 24);
      g.add(ramp);
    }
    // bell tower
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 8, 20), mats.stone);
    tower.position.y = 10;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.8, 2.2, 20), mats.wood);
    roof.position.y = 15.1;
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 10, 0, Math.PI * 2, 0, Math.PI / 1.6), new THREE.MeshLambertMaterial({ color: PAL.gold }));
    bell.position.y = 13.4;
    g.add(tower, roof, bell);
    for (const p of map.jumpPads) pads.push(pad(g, p.pos, mats));
    trees(g, mats, 36, () => {
      const a = rnd() * Math.PI * 2, r = 26 + rnd() * 17;
      return Math.abs(r - 34) < 2 || Math.abs(r - 30) < 3.5 ? null : [Math.cos(a) * r, 0, Math.sin(a) * r];
    });
  }
  return { group: g, mats, pads };
}
