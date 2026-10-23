// Models in the Breezy Isle look (four-step cel shading, dark brown outlines).
// Every person and monster stands on one jointed rig: hips, knees, shoulders, elbows, hands, neck and head, so they
// walk with bending knees and swing with bending elbows. Heroes wear what they equip, piece by piece.
// Many small parts make a detailed figure; bake() merges the parts of each joint into one mesh (with vertex colours)
// and one outline, so a whole monster draws in a couple of dozen calls. Monster templates are built once and cloned.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MOBS, BASES, CLASSES, itemColor, SET_BY_ID } from './data.js?v=4';

export const GRAD = (() => { const d = new Uint8Array([70, 150, 210, 255]); const t = new THREE.DataTexture(d, 4, 1, THREE.RedFormat); t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t; })();
const mats = new Map();
export function mat(color, o = {}) {
  const k = color + JSON.stringify(o);
  if (!mats.has(k)) mats.set(k, new THREE.MeshToonMaterial({ color, gradientMap: GRAD, ...o }));
  return mats.get(k);
}
export const glow = (c, i = 1.6) => mat(c, { emissive: c, emissiveIntensity: i });
export const OUTLINE = new THREE.MeshBasicMaterial({ color: '#2e1e12', side: THREE.BackSide });
const VCOL = new THREE.MeshToonMaterial({ color: '#ffffff', gradientMap: GRAD, vertexColors: true });
const geos = new Map();
const geo = (k, f) => { if (!geos.has(k)) geos.set(k, f()); return geos.get(k); };
const box = (w, h, d) => geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
const sph = (r, a = 12, b = 10) => geo(`s${r},${a},${b}`, () => new THREE.SphereGeometry(r, a, b));
const hemi = (r, a = 12) => geo(`h${r},${a}`, () => new THREE.SphereGeometry(r, a, 8, 0, Math.PI * 2, 0, Math.PI / 2));
const cyl = (t, b, h, n = 10) => geo(`c${t},${b},${h},${n}`, () => new THREE.CylinderGeometry(t, b, h, n));
const cone = (r, h, n = 8) => geo(`k${r},${h},${n}`, () => new THREE.ConeGeometry(r, h, n));
const cap = (r, l) => geo(`p${r},${l}`, () => new THREE.CapsuleGeometry(r, l, 4, 10));
const tor = (r, t, arc = Math.PI * 2, n = 18) => geo(`t${r},${t},${arc.toFixed(3)},${n}`, () => new THREE.TorusGeometry(r, t, 6, n, arc));
const ext = (key, pts, depth, bevel = 0.015) => geo('x' + key, () => { const s = new THREE.Shape(); pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y))); const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1 }); g.translate(0, 0, -depth / 2); return g; });
const flat = (key, pts) => geo('f' + key, () => { const s = new THREE.Shape(); pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y))); return new THREE.ShapeGeometry(s); });
function put(parent, g, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = true; parent.add(o); return o; }
const scl = (o, x, y = x, z = x) => { o.scale.set(x, y, z); return o; };
const shade = (hex, k) => { const c = new THREE.Color(hex); c.multiplyScalar(k); return '#' + c.getHexString(); };

// ------------------------------------------------------------------ baking: one mesh and one outline per joint
const mergeable = (m) => m.isMesh && !m.children.length && !Object.keys(m.userData).length && m.material.isMeshToonMaterial && !m.material.transparent && !(m.material.emissiveIntensity > 0.01 && m.material.emissive && m.material.emissive.getHex()) && m.material.side !== THREE.DoubleSide;
// half sizes of a part in its parent's units (before rotation)
function halves(m) { const bb = m.geometry.boundingBox || (m.geometry.computeBoundingBox(), m.geometry.boundingBox), v = new THREE.Vector3(); bb.getSize(v).multiplyScalar(0.5); return [v.x * Math.abs(m.scale.x), v.y * Math.abs(m.scale.y), v.z * Math.abs(m.scale.z)]; }
function prep(m, w = 0) {
  m.updateMatrix();
  let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  if (w) {   // grow the outline shell by the same amount on every side, around the part's own centre
    const h = halves(m), c = new THREE.Vector3(); m.geometry.boundingBox.getCenter(c);
    g.translate(-c.x, -c.y, -c.z); g.scale(1 + w / Math.max(0.012, h[0]), 1 + w / Math.max(0.012, h[1]), 1 + w / Math.max(0.012, h[2])); g.translate(c.x, c.y, c.z);
  }
  g.applyMatrix4(m.matrix);
  return g;
}
export function outline(root, w = 0.022) {
  const groups = []; root.traverse((o) => { if (!o.isMesh) groups.push(o); });
  for (const grp of groups) {
    const parts = grp.children.filter(mergeable);
    if (parts.length) {
      const body = [], line = [];
      for (const m of parts) {
        const g = prep(m), c = m.material.color, n = g.attributes.position.count, col = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
        g.setAttribute('color', new THREE.BufferAttribute(col, 3)); body.push(g);
        if (Math.max(...halves(m)) > 0.035) line.push(prep(m, w));   // eyes, teeth and rivets need no outline
      }
      const merged = new THREE.Mesh(mergeGeometries(body), VCOL); merged.castShadow = true;
      for (const m of parts) grp.remove(m);
      grp.add(merged);
      if (line.length) { const ol = new THREE.Mesh(mergeGeometries(line), OUTLINE); ol.userData.noOutline = true; grp.add(ol); }
    }
  }
  return root;
}

// ------------------------------------------------------------------ the rig
// facing +z, feet at y 0, about 2 units tall. Joint groups are named so a cloned template can find them again.
const JOINTS = ['body', 'head', 'legL', 'legR', 'kneeL', 'kneeR', 'armL', 'armR', 'elbowL', 'elbowR', 'handL', 'handR'];
function rig(dress, o = {}) {
  const root = new THREE.Group(), body = new THREE.Group(); body.name = 'body'; root.add(body);
  const J = (parent, x, y, z, name) => { const g = new THREE.Group(); g.position.set(x, y, z); g.name = name; parent.add(g); return g; };
  const w = o.wide || 1;
  const hip = { L: J(body, -0.13 * w, 0.98, 0, 'legL'), R: J(body, 0.13 * w, 0.98, 0, 'legR') };
  const knee = { L: J(hip.L, 0, -0.44, 0, 'kneeL'), R: J(hip.R, 0, -0.44, 0, 'kneeR') };
  const sh = { L: J(body, -0.31 * w, 1.5, 0, 'armL'), R: J(body, 0.31 * w, 1.5, 0, 'armR') };
  const elb = { L: J(sh.L, 0, -0.34, 0, 'elbowL'), R: J(sh.R, 0, -0.34, 0, 'elbowR') };
  const hand = { L: J(elb.L, 0, -0.31, 0.02, 'handL'), R: J(elb.R, 0, -0.31, 0.02, 'handR') };
  const hd = J(body, 0, 1.78, 0.01, 'head');
  dress.torso && dress.torso(body);
  dress.head && dress.head(hd);
  for (const s of ['L', 'R']) { const k = s === 'L' ? -1 : 1; dress.thigh && dress.thigh(hip[s], k); dress.shin && dress.shin(knee[s], k); dress.upper && dress.upper(sh[s], k); dress.fore && dress.fore(elb[s], k); dress.hand && dress.hand(hand[s], k); }
  root.userData = { body, head: hd, legL: hip.L, legR: hip.R, kneeL: knee.L, kneeR: knee.R, armL: sh.L, armR: sh.R, elbowL: elb.L, elbowR: elb.R, handL: hand.L, handR: hand.R, phase: Math.random() * 6 };
  return root;
}
// a face: skull, jaw, ears, nose, eyes, brows, mouth
function face(h, o) {
  const S = mat(o.skin), E = o.eyeGlow ? glow(o.eyes, 2.4) : mat(o.eyes || '#1a1420'), H = mat(o.hair || '#3a2414');
  scl(put(h, sph(1, 16, 12), S), 0.18, 0.21, 0.19);
  scl(put(h, sph(1, 12, 8), S, 0, -0.1, 0.035), 0.14, 0.1, 0.14);
  for (const s of [-1, 1]) { scl(put(h, sph(1, 8, 6), S, s * 0.18, -0.005, -0.005), 0.025, 0.05, 0.04); scl(put(h, sph(1, 8, 6), E, s * 0.068, 0.03, 0.165), 0.026, o.eyeGlow ? 0.018 : 0.032, 0.016); if (!o.noBrows) put(h, box(0.075, 0.017, 0.02), H, s * 0.07, 0.083, 0.17, 0, 0, s * (o.angry ? 0.35 : -0.08)); }
  put(h, cone(0.026, 0.075, 6), S, 0, -0.02, 0.2, Math.PI / 2);
  put(h, box(o.grin ? 0.09 : 0.065, o.grin ? 0.03 : 0.013, 0.012), mat(o.grin ? '#3a0a0a' : '#7a3a2a'), 0, -0.105, 0.165);
  if (o.grin) for (let i = -2; i <= 2; i++) put(h, cone(0.008, 0.02, 4), mat('#fff8e0'), i * 0.017, -0.1, 0.17, Math.PI);
  if (o.beard) { scl(put(h, sph(1, 10, 8), H, 0, -0.14, 0.07), 0.14, 0.1, 0.11); scl(put(h, sph(1, 8, 6), H, 0, -0.07, 0.17), 0.07, 0.022, 0.03); }
}
// hair and headgear without a helmet
function hair(h, style, c) {
  const H = mat(c);
  if (style === 'short') { scl(put(h, sph(1, 14, 10), H, 0, 0.07, -0.02), 0.19, 0.16, 0.2); for (let i = 0; i < 5; i++) put(h, cone(0.05, 0.1, 5), H, -0.1 + i * 0.05, 0.17, 0.12, 0.9, 0, 0); }
  else if (style === 'long') { scl(put(h, sph(1, 14, 10), H, 0, 0.07, -0.03), 0.195, 0.17, 0.205); scl(put(h, cap(0.11, 0.32), H, 0, -0.2, -0.11), 1.6, 1, 0.6); for (const s of [-1, 1]) scl(put(h, cap(0.05, 0.2), H, s * 0.16, -0.12, 0.04), 1, 1, 0.8); }
  else if (style === 'wild') { for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; put(h, sph(0.08, 8, 6), H, Math.cos(a) * 0.15, 0.12 + Math.sin(i * 1.7) * 0.03, Math.sin(a) * 0.15 - 0.03); } scl(put(h, sph(1, 12, 8), H, 0, 0.1, -0.03), 0.19, 0.14, 0.2); }
  else if (style === 'sparse') { for (let i = 0; i < 4; i++) put(h, cone(0.03, 0.12, 4), H, -0.08 + i * 0.05, 0.2, -0.02 + (i % 2) * 0.05, (i % 2 ? 0.4 : -0.3), 0, (i - 1.5) * 0.3); }
  else if (style === 'hood') { scl(put(h, sph(1, 14, 10), H, 0, 0.03, -0.05), 0.235, 0.255, 0.215); put(h, cone(0.12, 0.3, 8), H, 0, 0.0, -0.24, -1.9); scl(put(h, tor(0.2, 0.03, Math.PI * 1.2), mat(shade(c, 0.7)), 0, 0.02, 0.1, 0, 0, Math.PI * 0.9), 1, 1.15, 1); }
}
// a person: hips, waist, chest, neck; sleeves and trousers; a robe if any
function human(o) {
  const S = mat(o.skin), T = mat(o.shirt), P = mat(o.pants), F = mat(o.shoes || '#3a2a1a'), w = o.build || 1;
  return rig({
    torso(b) {
      put(b, cyl(0.185 * w, 0.205 * w, 0.22, 12), P, 0, 0.98, 0);
      put(b, cyl(0.2 * w, 0.185 * w, 0.24, 12), T, 0, 1.17, 0);
      scl(put(b, sph(1, 14, 10), T, 0, 1.38, 0.01), 0.29 * w, 0.24, 0.19 * Math.sqrt(w));
      put(b, cyl(0.062, 0.075, 0.16, 8), S, 0, 1.6, 0);
      if (o.robe) { const len = o.robe.len || 0.8; put(b, cyl(0.21 * w, o.robe.w || 0.4, len, 14), mat(o.robe.c), 0, 1.02 - len / 2, 0); put(b, tor(0.205 * w, 0.03), mat(o.robe.trim || shade(o.robe.c, 0.7)), 0, 1.06, 0, Math.PI / 2); }
      if (o.torso) o.torso(b);
    },
    head(h) { face(h, o); if (o.hairStyle) hair(h, o.hairStyle, o.hair || '#3a2414'); if (o.headFn) o.headFn(h); },
    thigh(g) { put(g, cap(0.088 * Math.sqrt(w), 0.3), P, 0, -0.22, 0); },
    shin(g) { put(g, cap(0.07 * Math.sqrt(w), 0.3), P, 0, -0.21, 0); put(g, box(0.13, 0.085, 0.26), F, 0, -0.44, 0.05); },
    upper(g) { put(g, sph(0.095 * Math.sqrt(w), 10, 8), T, 0, -0.01, 0); put(g, cap(0.066 * Math.sqrt(w), 0.22), T, 0, -0.17, 0); },
    fore(g) { put(g, cap(0.056 * Math.sqrt(w), 0.2), o.bareArms ? S : T, 0, -0.15, 0); put(g, cyl(0.045, 0.05, 0.05, 8), S, 0, -0.28, 0); },
    hand(g, k) { put(g, box(0.085, 0.1, 0.055), S, 0, -0.03, 0); put(g, cap(0.02, 0.045), S, k * -0.05, -0.0, 0.025, 0.4, 0, k * 0.5); if (o.claws) for (let i = 0; i < 3; i++) put(g, cone(0.012, 0.06, 4), mat('#2a1a10'), -0.025 + i * 0.025, -0.1, 0.01, Math.PI); },
  }, { wide: w });
}

// ------------------------------------------------------------------ weapons and shields
function weaponMesh(type, tier, col = null) {
  const g = new THREE.Group(), metal = mat(col || (tier >= 3 ? '#e8d07a' : tier >= 2 ? '#c8d0e0' : '#a8a8b0')), dark = mat(shade(col || (tier >= 3 ? '#c8a050' : '#8890a0'), 0.7)), wood = mat('#7a4a2a'), wrap = mat('#4a2a1a'), gold = mat('#d8b040'), gem = col ? glow(col, 1.3) : null;
  if (type === 'sword') {
    const L = 0.75 + tier * 0.12;
    put(g, cyl(0.022, 0.022, 0.2, 6), wrap, 0, 0, 0.02, Math.PI / 2); put(g, sph(0.035, 8, 6), gold, 0, 0, -0.1);
    put(g, box(0.24 + tier * 0.03, 0.04, 0.05), gold, 0, 0, 0.13); for (const s of [-1, 1]) put(g, sph(0.03, 6, 5), gold, s * (0.12 + tier * 0.015), 0, 0.13);
    put(g, ext('blade' + tier, [[-0.035, 0], [0.035, 0], [0.03, L], [0, L + 0.09], [-0.03, L]], 0.016, 0.006), metal, 0, 0, 0.15, Math.PI / 2, 0, 0);
    put(g, box(0.012, 0.02, L * 0.7), dark, 0, 0.014, 0.15 + L * 0.38);
    if (gem) put(g, sph(0.03, 6, 5), gem, 0, 0.03, 0.13);
  } else if (type === 'axe') {
    put(g, cyl(0.025, 0.03, 1.0 + tier * 0.1, 6), wood, 0, 0, 0.35, Math.PI / 2); for (let i = 0; i < 3; i++) put(g, cyl(0.032, 0.032, 0.03, 6), wrap, 0, 0, -0.05 + i * 0.05, Math.PI / 2);
    put(g, ext('axe' + tier, [[0, -0.05], [0.12, -0.14 - tier * 0.03], [0.24, -0.18 - tier * 0.04], [0.22, 0], [0.24, 0.18 + tier * 0.04], [0.12, 0.14 + tier * 0.03], [0, 0.05]], 0.03), metal, 0, 0.02, 0.78, 0, Math.PI / 2, Math.PI / 2);
    if (tier >= 3) put(g, ext('axe3b', [[0, -0.04], [-0.14, -0.12], [-0.12, 0], [-0.14, 0.12], [0, 0.04]], 0.03), metal, 0, -0.02, 0.78, 0, Math.PI / 2, Math.PI / 2);
    if (gem) put(g, sph(0.035, 6, 5), gem, 0, 0, 0.78);
  } else if (type === 'mace') {
    put(g, cyl(0.025, 0.03, 0.85 + tier * 0.1, 6), wood, 0, 0, 0.3, Math.PI / 2);
    put(g, sph(0.1 + tier * 0.02, 10, 8), metal, 0, 0, 0.75 + tier * 0.05);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; put(g, box(0.02, 0.09 + tier * 0.02, 0.14), dark, Math.cos(a) * 0.1, Math.sin(a) * 0.1, 0.75 + tier * 0.05, 0, 0, a); }
    if (tier >= 2) put(g, cone(0.04, 0.12, 5), dark, 0, 0, 0.88 + tier * 0.05, Math.PI / 2);
    if (gem) put(g, sph(0.035, 6, 5), gem, 0, 0.12, 0.75);
  } else if (type === 'bow') {
    const R = 0.5 + tier * 0.05, wd = mat(col || (tier >= 3 ? '#3a2a1a' : '#8a5a2a'));
    const b = put(g, tor(R, 0.028, Math.PI * 0.9, 16), wd, 0, 0, 0.1); b.rotation.set(0, Math.PI / 2, Math.PI / 2 + Math.PI * 0.05);
    for (const s of [-1, 1]) put(g, cone(0.025, 0.08, 5), wd, 0, s * R * 0.99, 0.1 + 0.08, s > 0 ? -0.6 : Math.PI + 0.6);
    put(g, cyl(0.035, 0.035, 0.14, 6), wrap, 0, 0, 0.1 + R - 0.02);
    put(g, cyl(0.005, 0.005, R * 1.95, 3), mat('#f4f4f4'), 0, 0, 0.1 + R * 0.15);
    if (gem) put(g, sph(0.03, 6, 5), gem, 0, 0.08, 0.1 + R);
  } else if (type === 'staff') {
    put(g, cyl(0.03, 0.04, 1.75, 7), wood, 0, 0.35, 0.1); for (let i = 0; i < 3; i++) put(g, tor(0.04, 0.012), gold, 0, 0.0 + i * 0.4, 0.1, Math.PI / 2);
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; put(g, cone(0.02, 0.22, 4), wood, Math.cos(a) * 0.06, 1.28, 0.1 + Math.sin(a) * 0.06, Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4); }
    put(g, sph(0.1, 10, 8), glow(col || (tier >= 3 ? '#ff7a3a' : '#7ab8ff'), 1.4), 0, 1.32, 0.1);
  } else if (type === 'wand') {
    put(g, cyl(0.016, 0.026, 0.42, 6), mat(tier >= 2 ? '#e8e0c8' : '#7a4a2a'), 0, 0, 0.18, Math.PI / 2); put(g, tor(0.03, 0.01), gold, 0, 0, 0.36);
    if (tier >= 2) put(g, sph(0.05, 8, 6), mat('#e8e0c8'), 0, 0, 0.42); put(g, sph(0.045, 8, 6), glow(col || '#c87aff', 1.4), 0, 0, 0.46);
  }
  g.rotation.x = -0.35;
  return g;
}
function shieldMesh(B, col) {
  const g = new THREE.Group(), c = col || (B.tier >= 3 ? '#8a8a9a' : B.tier >= 2 ? '#3a5a9a' : '#8a5a3a'), rim = mat(col ? shade(col, 1.4) : B.tier >= 2 ? '#c8ccd8' : '#6a6a70'), face0 = mat(c);
  if (B.id === 'buckler') { put(g, cyl(0.26, 0.26, 0.05, 16), face0, 0, 0, 0, 0, 0, Math.PI / 2); put(g, tor(0.26, 0.025, Math.PI * 2, 20), rim, 0.02, 0, 0, 0, Math.PI / 2); put(g, hemi(0.08, 10), rim, 0.03, 0, 0, 0, 0, -Math.PI / 2); }
  else if (B.id === 'kite') { put(g, ext('kite', [[0, 0.36], [0.25, 0.28], [0.27, 0.05], [0, -0.48], [-0.27, 0.05], [-0.25, 0.28]], 0.04, 0.02), face0, 0, -0.04, 0, 0, Math.PI / 2); put(g, box(0.03, 0.62, 0.06), rim, 0.04, -0.06, 0); put(g, box(0.03, 0.06, 0.44), rim, 0.04, 0.12, 0); put(g, sph(0.05, 8, 6), rim, 0.05, 0.12, 0); }
  else if (B.id === 'tower') { put(g, ext('tower', [[-0.28, 0.5], [0.28, 0.5], [0.3, -0.45], [0, -0.58], [-0.3, -0.45]], 0.05, 0.02), face0, 0, -0.05, 0, 0, Math.PI / 2); for (const y of [0.38, -0.4]) for (const z of [-0.2, 0.2]) put(g, sph(0.03, 6, 5), rim, 0.04, y, z); put(g, box(0.03, 0.9, 0.06), rim, 0.04, -0.05, 0); put(g, box(0.03, 0.06, 0.5), rim, 0.04, 0.15, 0); }
  else { put(g, sph(0.15, 12, 10), glow(col || '#8ab8ff', 1.2), 0, 0.02, 0.08); for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; put(g, cone(0.02, 0.18, 4), mat('#d8b040'), Math.cos(a) * 0.1, -0.06, 0.08 + Math.sin(a) * 0.1, Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5); } }
  return g;
}

// ------------------------------------------------------------------ heroes
const LOOKS = {
  warrior: { skin: '#e8b88a', shirt: '#6a3a24', pants: '#4a3a2a', shoes: '#3a2414', hair: '#5a3418', hairStyle: 'short', beard: true, build: 1.12 },
  ranger: { skin: '#f2c9a0', shirt: '#3a6a3a', pants: '#5a4a32', shoes: '#4a2e18', hair: '#2a5a2a', hairStyle: 'hood', build: 1 },
  sorc: { skin: '#f6d2b0', shirt: '#4a3a9a', pants: '#2a2a5a', shoes: '#2a1a3a', hair: '#f2d26a', hairStyle: 'long', build: 0.9, robe: { c: '#3a2a8a', len: 0.86, w: 0.42, trim: '#e8c84a' } },
  druid: { skin: '#d8a878', shirt: '#5a6a2a', pants: '#4a3a22', shoes: '#3a2a14', hair: '#6a3a1a', hairStyle: 'wild', beard: true, build: 1.05, robe: { c: '#4a5a24', len: 0.5, w: 0.34, trim: '#8a6a3a' } },
  necro: { skin: '#e0dcd0', shirt: '#2a2238', pants: '#1a1424', shoes: '#140f1c', hair: '#2a2238', hairStyle: 'hood', build: 0.95, robe: { c: '#221a30', len: 0.9, w: 0.44, trim: '#8a7aa8' } },
};
export function makeHero(cls, equip = {}) {
  const C = CLASSES[cls], L = LOOKS[cls] || LOOKS.warrior, col = C.color;
  const B = (s) => equip[s] && BASES[equip[s].base], tint = (s) => itemColor(equip[s]);
  const h = B('head'), hc = tint('head'), bd = B('body'), bodyT = bd ? bd.tier : 0, bc = tint('body');
  const armorC = bc || (bodyT >= 3 ? '#b8bcc8' : bodyT === 2 ? '#8a8e9a' : bodyT === 1 ? '#8a6a44' : null);
  const look = { ...L, robe: bodyT >= 2 ? null : L.robe };
  look.headFn = (hd) => {
    if (!h) {
      if (cls === 'druid') for (let i = 0; i < 7; i++) { const a = -0.5 + i * 0.17; scl(put(hd, sph(1, 6, 5), mat(i % 2 ? '#6aaa3a' : '#3a8a2a'), Math.sin(a * 3) * 0.17, 0.19 + Math.cos(a * 3) * 0.02, Math.cos(a * 3) * 0.09 - 0.02), 0.05, 0.02, 0.08); }
      if (cls === 'sorc') { put(hd, tor(0.19, 0.012), mat('#e8c84a'), 0, 0.11, 0, Math.PI / 2 - 0.25); put(hd, sph(0.025, 6, 5), glow(col, 1.6), 0, 0.16, 0.18); }
      if (cls === 'necro') for (const s of [-1, 1]) put(hd, cone(0.02, 0.12, 4), mat('#e8e0c8'), s * 0.12, 0.2, -0.05, 0, 0, -s * 0.5);
      return;
    }
    const c = hc || (h.tier >= 3 ? '#e8c84a' : h.tier >= 2 ? '#b8c0d0' : '#8a5a3a'), M = mat(c), D = mat(shade(c, 0.75));
    if (h.id === 'crown') { put(hd, cyl(0.2, 0.19, 0.08, 12), M, 0, 0.16, -0.01); for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; put(hd, cone(0.03, 0.09, 4), M, Math.cos(a) * 0.19, 0.24, Math.sin(a) * 0.19 - 0.01); put(hd, sph(0.018, 5, 4), glow(i % 2 ? '#ff4a5a' : '#5ab0ff', 1.4), Math.cos(a) * 0.2, 0.16, Math.sin(a) * 0.2 - 0.01); } }
    else if (h.id === 'circlet') { put(hd, tor(0.195, 0.014), M, 0, 0.1, 0, Math.PI / 2 - 0.2); put(hd, sph(0.03, 8, 6), glow(hc || '#8ab8ff', 1.5), 0, 0.14, 0.19); }
    else if (h.tier >= 2) {   // a great helm with a visor slit and a crest
      scl(put(hd, sph(1, 14, 10), M, 0, 0.03, -0.01), 0.215, 0.235, 0.22); put(hd, box(0.3, 0.025, 0.05), mat('#1a1418'), 0, 0.02, 0.2); put(hd, box(0.025, 0.11, 0.04), D, 0, -0.05, 0.215);
      put(hd, tor(0.215, 0.015), D, 0, -0.06, 0, Math.PI / 2); put(hd, box(0.03, 0.08, 0.32), D, 0, 0.24, -0.02);
      if (hc) { put(hd, ext('plume', [[0, 0], [0.04, 0.12], [0.02, 0.26], [-0.03, 0.3], [-0.12, 0.2], [-0.2, 0.06]], 0.03), glow(hc, 0.9), 0, 0.24, -0.05, 0, Math.PI / 2); for (const s of [-1, 1]) put(hd, cone(0.03, 0.16, 5), mat('#e8e0c8'), s * 0.21, 0.13, 0, 0, 0, -s * 0.8); }
    } else { scl(put(hd, sph(1, 14, 10), M, 0, 0.06, -0.015), 0.2, 0.17, 0.21); put(hd, tor(0.195, 0.018), D, 0, 0.02, -0.01, Math.PI / 2 - 0.1); }
  };
  if (h && h.tier >= 2 && h.id !== 'circlet') look.hairStyle = null;
  else if (h && cls !== 'sorc') look.hairStyle = h.id === 'cap' ? null : look.hairStyle;
  look.torso = (b) => {
    const A = armorC ? mat(armorC) : null, D = armorC ? mat(shade(armorC, 0.72)) : null, Lt = armorC ? mat(shade(armorC, 1.2)) : null;
    // the class's own clothes
    if (cls === 'warrior' && bodyT < 2) { put(b, box(0.42, 0.34, 0.03), mat(col), 0, 1.15, 0.19, -0.08); put(b, box(0.42, 0.04, 0.035), mat('#d8b040'), 0, 1.3, 0.19); }
    if (cls === 'ranger') { put(b, cyl(0.07, 0.07, 0.55, 8), mat('#6a4a2a'), 0.12, 1.32, -0.24, 0, 0, 0.35); for (let i = 0; i < 4; i++) { put(b, cyl(0.008, 0.008, 0.3, 3), mat('#c8b080'), 0.04 + i * 0.03, 1.66, -0.25 - (i % 2) * 0.03, 0, 0, 0.35); put(b, cone(0.02, 0.05, 3), mat('#e8e8e8'), 0.0 + i * 0.03, 1.81, -0.25 - (i % 2) * 0.03, 0, 0, 0.35); } put(b, box(0.56, 0.7, 0.03), mat('#2f5a2f'), 0, 1.15, -0.22, 0.12); }
    if (cls === 'druid') for (const s of [-1, 1]) for (let i = 0; i < 4; i++) put(b, sph(0.07, 8, 6), mat(i % 2 ? '#7a5a3a' : '#9a7a52'), s * (0.12 + i * 0.07), 1.56 - i * 0.03, -0.03);
    if (cls === 'necro') for (const s of [-1, 1]) for (let i = 0; i < 3; i++) put(b, cone(0.025, 0.14, 4), mat('#e8e0c8'), s * (0.24 + i * 0.05), 1.58 + (i === 1 ? 0.04 : 0), -0.02, 0, 0, -s * (0.3 + i * 0.25));
    if (cls === 'sorc') put(b, tor(0.12, 0.02, Math.PI), mat('#e8c84a'), 0, 1.47, 0.05, Math.PI / 2 + 0.3, 0, 0);
    // body armour
    if (bodyT === 1) { scl(put(b, sph(1, 14, 10), A, 0, 1.36, 0.01), 0.305, 0.25, 0.205); for (let i = 0; i < 3; i++) put(b, tor(0.205 - i * 0.004, 0.012, Math.PI * 2, 16), D, 0, 1.12 + i * 0.1, 0, Math.PI / 2); put(b, tor(0.08, 0.025), D, 0, 1.6, 0, Math.PI / 2); }
    if (bodyT >= 2) {
      scl(put(b, sph(1, 14, 10), A, 0, 1.37, 0.012), 0.31, 0.255, 0.215); put(b, cyl(0.215, 0.2, 0.26, 12), A, 0, 1.17, 0);
      put(b, cyl(0.215, bodyT >= 3 ? 0.27 : 0.3, 0.3, 12), bodyT >= 3 ? D : A, 0, 0.9, 0);   // chain skirt / faulds
      put(b, tor(0.085, 0.03), D, 0, 1.6, 0, Math.PI / 2);
    }
    if (bodyT >= 3) {
      put(b, box(0.03, 0.42, 0.04), Lt, 0, 1.3, 0.21, -0.1); for (const s of [-1, 1]) { put(b, box(0.14, 0.2, 0.03), A, s * 0.1, 0.78, 0.2, 0.1); put(b, box(0.14, 0.03, 0.035), D, s * 0.1, 0.87, 0.21); }
      put(b, cyl(0.1, 0.13, 0.08, 10), A, 0, 1.63, 0);   // gorget
    }
    if (bc) put(b, sph(0.04, 8, 6), glow(bc, 1.4), 0, 1.4, 0.22);
    // belt
    const bl = B('belt');
    if (bl) { const c = tint('belt') || (bl.tier >= 3 ? '#7a7a8a' : bl.tier >= 2 ? '#5a4a3a' : '#7a5a3a'); put(b, tor(0.205, 0.032, Math.PI * 2, 20), mat(c), 0, 1.06, 0, Math.PI / 2); put(b, box(0.09, 0.08, 0.03), mat(tint('belt') ? shade(c, 1.4) : '#d8b040'), 0, 1.06, 0.215); put(b, box(0.09, 0.1, 0.07), mat(shade(c, 0.8)), 0.17, 1.0, 0.1, 0, 0.6); if (bl.tier >= 2) for (const s of [-1, 1]) put(b, box(0.06, 0.06, 0.06), mat(shade(c, 0.9)), s * 0.2, 1.0, -0.06); }
    // amulet
    if (equip.amulet) { put(b, tor(0.11, 0.008, Math.PI * 2, 14), mat('#d8b040'), 0, 1.55, 0.06, Math.PI / 2 - 0.7); put(b, sph(0.035, 8, 6), glow(tint('amulet') || '#7ab8ff', 1.6), 0, 1.45, 0.205); }
    // three or more pieces of one set: a cape in the set's colour
    const sets = {}; for (const it of Object.values(equip)) if (it && it.set) (sets[it.set] = sets[it.set] || new Set()).add(it.sp);
    const full = Object.entries(sets).find(([, v]) => v.size >= 3);
    if (full) { const c = SET_BY_ID[full[0]].col; put(b, ext('cape', [[-0.26, 0], [0.26, 0], [0.36, -1.05], [0.12, -1.0], [0, -1.08], [-0.12, -1.0], [-0.36, -1.05]], 0.02, 0.005), mat(c), 0, 1.55, -0.22, 0.12); put(b, box(0.56, 0.06, 0.08), mat(shade(c, 0.7)), 0, 1.56, -0.2); }
  };
  const g = human(look), u = g.userData;
  // arms and legs: pauldrons, bracers and gauntlets, boots and greaves, rings
  const gl = B('gloves'), gc = tint('gloves') || (gl ? (gl.tier >= 2 ? '#a8a8b8' : '#7a4a2a') : null), bt = B('boots'), btc = tint('boots') || (bt ? (bt.tier >= 2 ? '#9a9aaa' : '#6a4228') : null);
  for (const [s, k] of [['L', -1], ['R', 1]]) {
    const arm = u['arm' + s], elb = u['elbow' + s], hand = u['hand' + s], knee = u['knee' + s];
    if (armorC && bodyT >= 2) { const A = mat(armorC), D = mat(shade(armorC, 0.72)); scl(put(arm, sph(1, 12, 8), A, k * 0.02, 0.02, 0), 0.14, 0.1, 0.14); if (bodyT >= 3) { scl(put(arm, sph(1, 12, 8), D, k * 0.03, -0.06, 0), 0.125, 0.07, 0.13); put(elb, sph(0.065, 8, 6), A, 0, 0, 0.01); put(arm, cyl(0.075, 0.07, 0.16, 8), A, 0, -0.2, 0); } }
    if (gc) { const G2 = mat(gc); put(elb, cyl(gl.tier >= 2 ? 0.075 : 0.062, 0.06, 0.16, 8), G2, 0, -0.24, 0); put(hand, box(0.1, 0.11, 0.065), G2, 0, -0.03, 0); if (gl.tier >= 3) for (let i = 0; i < 3; i++) put(hand, cone(0.012, 0.04, 4), mat('#e8e0c8'), -0.03 + i * 0.03, -0.02, 0.04, Math.PI / 2); }
    if (btc) { const Bm = mat(btc), Bd = mat(shade(btc, 0.75)); put(knee, cyl(0.082, 0.078, 0.24, 8), Bm, 0, -0.3, 0); put(knee, box(0.145, 0.095, 0.28), Bm, 0, -0.44, 0.055); put(knee, tor(0.08, 0.015), Bd, 0, -0.18, 0, Math.PI / 2); if (bt.tier >= 2) { put(knee, box(0.1, 0.24, 0.03), Bd, 0, -0.27, 0.075); put(knee, sph(0.07, 8, 6), Bm, 0, 0.0, 0.03); } if (bt.tier >= 3) put(knee, cone(0.05, 0.1, 5), Bm, 0, -0.45, 0.22, Math.PI / 2); }
    else if (cls === 'warrior' || cls === 'druid') put(knee, cyl(0.078, 0.072, 0.18, 8), mat('#4a2e1a'), 0, -0.34, 0);
    const ring = equip[s === 'R' ? 'ring1' : 'ring2']; if (ring) put(hand, tor(0.03, 0.008, Math.PI * 2, 10), glow(tint(s === 'R' ? 'ring1' : 'ring2') || '#e8c84a', 1.6), 0, -0.05, 0.03, Math.PI / 2);
  }
  const w = B('weapon');
  if (w) u.handR.add(weaponMesh(w.type, w.tier, tint('weapon')));
  const o = B('offhand');
  if (o) { const sh = shieldMesh(o, tint('offhand')); sh.position.set(-0.08, 0, 0.08); u.handL.add(sh); }
  u.bow = w && w.type === 'bow';
  return outline(g);
}

// ------------------------------------------------------------------ monsters
// a skeleton: skull with sockets and teeth, spine, ribs, pelvis, bony limbs
function boneman(c, o = {}) {
  const Bn = mat(c), Dk = mat(shade(c, 0.62)), Hole = mat('#1a1410'), E = glow(o.eye || '#ff4a2a', o.eyeGlow ? 2.4 : 1.2);
  const g = rig({
    torso(b) {
      for (let i = 0; i < 6; i++) put(b, cyl(0.035, 0.04, 0.07, 6), Bn, 0, 1.0 + i * 0.1, -0.06);
      scl(put(b, tor(0.12, 0.035, Math.PI * 2, 12), Bn, 0, 0.98, -0.01, Math.PI / 2), 1.3, 1, 0.8);
      for (let i = 0; i < 5; i++) { const r = 0.19 - Math.abs(i - 1.5) * 0.02; scl(put(b, tor(r, 0.022, Math.PI * 1.55, 12), Bn, 0, 1.22 + i * 0.075, -0.03, Math.PI / 2, 0, Math.PI * 0.725), 1, 0.85, 1); }
      put(b, box(0.04, 0.28, 0.03), Bn, 0, 1.36, 0.14); for (const s of [-1, 1]) put(b, cyl(0.018, 0.018, 0.26, 5), Bn, s * 0.14, 1.53, 0.04, 0, 0, Math.PI / 2 + s * 0.15);
      put(b, cyl(0.03, 0.035, 0.16, 6), Bn, 0, 1.62, -0.02);
      if (o.torso) o.torso(b);
    },
    head(h) {
      scl(put(h, sph(1, 14, 10), Bn), 0.17, 0.19, 0.185);
      put(h, box(0.2, 0.06, 0.15), Bn, 0, -0.12, 0.07); for (let i = -2; i <= 2; i++) put(h, box(0.022, 0.03, 0.02), mat('#fff8e8'), i * 0.03, -0.08, 0.15);
      for (const s of [-1, 1]) { scl(put(h, sph(1, 8, 6), Hole, s * 0.065, 0.01, 0.14), 0.05, 0.055, 0.05); put(h, sph(0.018, 6, 5), E, s * 0.065, 0.01, 0.17); }
      put(h, cone(0.025, 0.05, 3), Hole, 0, -0.045, 0.175, Math.PI);
      if (o.head) o.head(h);
    },
    thigh(gp) { put(gp, cyl(0.028, 0.028, 0.36, 6), Bn, 0, -0.22, 0); put(gp, sph(0.045, 6, 5), Bn, 0, 0, 0); put(gp, sph(0.045, 6, 5), Dk, 0, -0.42, 0); },
    shin(gp) { put(gp, cyl(0.024, 0.024, 0.36, 6), Bn, 0, -0.21, 0); put(gp, box(0.1, 0.05, 0.22), Bn, 0, -0.44, 0.05); },
    upper(gp) { put(gp, sph(0.05, 6, 5), Bn); put(gp, cyl(0.024, 0.024, 0.28, 6), Bn, 0, -0.17, 0); put(gp, sph(0.04, 6, 5), Dk, 0, -0.33, 0); },
    fore(gp) { put(gp, cyl(0.018, 0.018, 0.26, 5), Bn, -0.015, -0.15, 0); put(gp, cyl(0.016, 0.016, 0.26, 5), Bn, 0.015, -0.15, 0); },
    hand(gp) { put(gp, box(0.06, 0.05, 0.03), Bn, 0, -0.02, 0); for (let i = 0; i < 4; i++) put(gp, cyl(0.008, 0.006, 0.08, 4), Bn, -0.024 + i * 0.016, -0.08, 0.005, 0.2); },
  });
  return g;
}
function mobBat(c) {
  const g = new THREE.Group(), body = new THREE.Group(); body.name = 'body'; g.add(body);
  const M = mat(c), D = mat(shade(c, 0.6));
  scl(put(body, sph(1, 12, 10), M, 0, 1.6, 0), 0.22, 0.26, 0.2); scl(put(body, sph(1, 10, 8), M, 0, 1.86, 0.06), 0.16, 0.15, 0.15);
  for (const s of [-1, 1]) { put(body, cone(0.06, 0.18, 4), M, s * 0.09, 2.02, 0.03, 0, 0, -s * 0.35); put(body, sph(0.035, 6, 5), glow('#ff4a4a', 2.2), s * 0.06, 1.88, 0.18); put(body, cone(0.012, 0.05, 4), mat('#ffffff'), s * 0.03, 1.79, 0.19, Math.PI); put(body, cap(0.03, 0.1), D, s * 0.08, 1.38, 0.02); }
  scl(put(body, cone(0.05, 0.08, 5), D, 0, 1.84, 0.2, Math.PI / 2), 1, 1, 0.6);
  const wings = [];
  for (const s of [-1, 1]) {
    const w = new THREE.Group(); w.name = s < 0 ? 'wingL' : 'wingR'; w.position.set(s * 0.18, 1.66, 0); body.add(w);
    const m = put(w, flat('batwing', [[0, 0.06], [0.35, 0.22], [0.8, 0.16], [0.95, -0.02], [0.75, -0.12], [0.6, 0.0], [0.42, -0.18], [0.26, -0.02], [0.1, -0.12], [0, -0.08]]), mat(shade(c, 0.7), { side: THREE.DoubleSide }), 0, 0, 0, -Math.PI / 2, 0, 0); m.scale.x = s; m.userData.s = s;
    for (const [x, y] of [[0.8, 0.16], [0.6, 0.0], [0.42, -0.18]]) { const len = Math.hypot(x, y); put(w, box(len, 0.02, 0.02), D, s * x / 2, 0.01, -y / 2, 0, Math.atan2(y, s * x), 0); }   // finger bones
    wings.push(w);
  }
  g.userData = { body, wings, phase: Math.random() * 6, float: true };
  return g;
}
function mobBug(id, c) {   // the thunder scarab and the scorpion queen
  const g = new THREE.Group(), body = new THREE.Group(); body.name = 'body'; g.add(body);
  const M = mat(c), D = mat(shade(c, 0.6)), Lg = mat('#2a2230'), queen = id === 'queen';
  if (!queen) {
    for (const s of [-1, 1]) scl(put(body, sph(1, 12, 10, 0), M, s * 0.27, 0.55, -0.1), 0.3, 0.32, 0.62);
    put(body, box(0.02, 0.05, 1.1), mat('#1a1420'), 0, 0.86, -0.1);
    scl(put(body, sph(1, 12, 8), D, 0, 0.55, 0.55), 0.38, 0.24, 0.2); scl(put(body, sph(1, 10, 8), Lg, 0, 0.5, 0.76), 0.2, 0.14, 0.14);
    put(body, cone(0.05, 0.36, 6), glow('#7ab8ff', 1.4), 0, 0.72, 0.86, 0.9); for (const s of [-1, 1]) { put(body, cone(0.025, 0.16, 4), Lg, s * 0.1, 0.44, 0.88, 1.5, 0, s * 0.5); put(body, sph(0.03, 6, 5), glow('#bfe0ff', 2), s * 0.1, 0.56, 0.86); }
  } else {
    for (let i = 0; i < 3; i++) scl(put(body, sph(1, 12, 10), M, 0, 0.62 - i * 0.02, 0.45 - i * 0.42), 0.48 - i * 0.04, 0.3, 0.32);
    for (let i = 0; i < 3; i++) put(body, tor(0.34 - i * 0.03, 0.03, Math.PI, 12), D, 0, 0.66, 0.24 - i * 0.42, 0, Math.PI / 2, 0);
    scl(put(body, sph(1, 12, 8), D, 0, 0.66, 0.92), 0.3, 0.2, 0.22);
    put(body, cyl(0.2, 0.24, 0.12, 8), mat('#e8c84a'), 0, 0.88, 0.9); for (let i = 0; i < 5; i++) put(body, cone(0.03, 0.12, 4), mat('#e8c84a'), -0.14 + i * 0.07, 1.0, 0.95);
    for (const s of [-1, 1]) {
      put(body, sph(0.05, 6, 5), glow('#ffe25a', 2.5), s * 0.1, 0.72, 1.1);
      const arm = new THREE.Group(); arm.position.set(s * 0.32, 0.62, 1.0); body.add(arm);
      put(arm, cap(0.07, 0.4), M, s * 0.16, 0, 0.18, Math.PI / 2, 0, s * 0.6); scl(put(arm, sph(1, 10, 8), M, s * 0.34, 0.02, 0.62), 0.16, 0.12, 0.22);
      put(arm, ext('claw', [[0, 0], [0.06, 0.12], [0.02, 0.36], [-0.04, 0.32], [-0.02, 0.12]], 0.06), D, s * 0.4, 0.02, 0.76, Math.PI / 2, 0, s * 0.3);
      put(arm, ext('claw', [[0, 0], [0.06, 0.12], [0.02, 0.36], [-0.04, 0.32], [-0.02, 0.12]], 0.06), D, s * 0.26, 0.02, 0.76, Math.PI / 2, 0, -s * 0.3);
    }
    // the tail rises from the back end, curls up and over, and hangs the stinger forward above the body
    const tail = new THREE.Group(); tail.position.set(0, 0.6, -0.8); body.add(tail);
    const R = 0.55, cy = R, at = (q) => [-R * Math.sin(q), cy - R * Math.cos(q)];
    for (let i = 0; i < 8; i++) { const q = i * 0.48, [z, y] = at(q); put(tail, sph(0.17 - i * 0.012, 10, 8), i % 2 ? M : D, 0, y, z); }
    { const q = 8 * 0.48, [z, y] = at(q); put(tail, sph(0.1, 8, 6), M, 0, y, z); put(tail, cone(0.06, 0.3, 6), glow('#c8ff6a', 1.2), 0, y - 0.12, z + 0.12, 2.3); }
  }
  const legs = [];
  for (let i = 0; i < (queen ? 4 : 3); i++) for (const s of [-1, 1]) {
    const L = new THREE.Group(); L.position.set(s * (queen ? 0.4 : 0.32), 0.45, (queen ? 0.45 : 0.3) - i * (queen ? 0.32 : 0.3)); body.add(L);
    put(L, cyl(0.03, 0.035, 0.42, 5), Lg, s * 0.18, 0.12, 0, 0, 0, s * 1.0); put(L, cyl(0.025, 0.012, 0.5, 5), Lg, s * 0.4, -0.12, 0, 0, 0, -s * 0.35);
    L.name = 'qleg' + legs.length; legs.push(L);
  }
  g.userData = { body, legs, phase: Math.random() * 6, crawl: true };
  return g;
}
function mobHound(c) {
  const g = new THREE.Group(), body = new THREE.Group(); body.name = 'body'; g.add(body);
  const M = mat(c), D = mat(shade(c, 0.55)), Fire = glow('#ff6a1a', 1.8);
  scl(put(body, sph(1, 12, 10), M, 0, 0.8, 0.3), 0.28, 0.3, 0.36); scl(put(body, sph(1, 12, 10), M, 0, 0.72, -0.35), 0.24, 0.25, 0.32); put(body, cyl(0.2, 0.23, 0.5, 10), M, 0, 0.74, -0.02, Math.PI / 2);
  for (let i = 0; i < 4; i++) put(body, tor(0.22, 0.015, Math.PI * 0.8, 10), D, 0, 0.74, 0.18 - i * 0.1, 0, Math.PI / 2, Math.PI * 1.1);
  put(body, cyl(0.12, 0.16, 0.34, 8), M, 0, 1.0, 0.55, -0.9);
  const hd = new THREE.Group(); hd.name = 'head'; hd.position.set(0, 1.12, 0.72); body.add(hd);
  scl(put(hd, sph(1, 12, 10), M), 0.17, 0.16, 0.19); put(hd, box(0.14, 0.1, 0.22), M, 0, -0.04, 0.17); put(hd, box(0.12, 0.04, 0.2), D, 0, -0.11, 0.15, 0.25);
  put(hd, sph(0.03, 6, 5), mat('#1a1010'), 0, -0.01, 0.29); for (const s of [-1, 1]) { put(hd, cone(0.05, 0.14, 4), M, s * 0.1, 0.17, -0.04, -0.3, 0, -s * 0.3); put(hd, sph(0.03, 6, 5), glow('#ffcf3a', 2.5), s * 0.08, 0.04, 0.15); for (let i = 0; i < 2; i++) put(hd, cone(0.01, 0.04, 4), mat('#fff8e0'), s * 0.05, -0.08, 0.2 + i * 0.05, Math.PI); }
  for (let i = 0; i < 6; i++) put(body, cone(0.05, 0.18, 4), Fire, 0, 1.05 - i * 0.03, 0.35 - i * 0.12, -0.5);
  const tl = put(body, cone(0.06, 0.5, 6), M, 0, 0.88, -0.72, -2.1); tl.name = '';
  put(body, cone(0.05, 0.16, 5), Fire, 0, 1.08, -0.92, -2.4);
  const legs = [];
  for (const [x, z] of [[-0.17, 0.34], [0.17, 0.34], [-0.17, -0.38], [0.17, -0.38]]) {
    const l = new THREE.Group(); l.position.set(x, 0.72, z); l.name = 'qleg' + legs.length; body.add(l);
    put(l, cap(0.075, 0.24), M, 0, -0.18, 0); const k = new THREE.Group(); k.position.set(0, -0.36, 0); l.add(k); put(k, cap(0.05, 0.22), D, 0, -0.14, z > 0 ? 0.02 : -0.03); put(k, box(0.1, 0.05, 0.14), D, 0, -0.32, 0.04);
    legs.push(l);
  }
  g.userData = { body, head: hd, legs, phase: Math.random() * 6, quad: true };
  return g;
}
function mobWraith(c) {
  const T = mat(c, { transparent: true, opacity: 0.72 }), Dk = mat(shade(c, 0.5), { transparent: true, opacity: 0.85 });
  const g = rig({
    torso(b) {
      put(b, cyl(0.24, 0.5, 1.2, 12, 1, true), T, 0, 0.9, 0);
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; put(b, cone(0.12, 0.42, 5), T, Math.cos(a) * 0.42, 0.18, Math.sin(a) * 0.42, Math.PI); }
      scl(put(b, sph(1, 12, 10), T, 0, 1.42, 0), 0.3, 0.24, 0.22);
      for (let i = 0; i < 6; i++) put(b, tor(0.05, 0.015, Math.PI * 2, 8), mat('#6a7a8a'), 0.22 - i * 0.06, 1.25 - i * 0.07, 0.2, 0, i % 2 ? 0.8 : -0.8, 0);
    },
    head(h) { scl(put(h, sph(1, 14, 10), Dk, 0, 0.02, -0.04), 0.24, 0.26, 0.22); scl(put(h, sph(1, 12, 8), mat('#0a0a14'), 0, -0.02, 0.06), 0.15, 0.17, 0.12); for (const s of [-1, 1]) put(h, sph(0.03, 8, 6), glow('#e8f8ff', 3), s * 0.06, 0, 0.16); put(h, cone(0.12, 0.3, 8), Dk, 0, 0.05, -0.24, -1.9); },
    upper(gp) { put(gp, cap(0.07, 0.24), T, 0, -0.17, 0); },
    fore(gp) { put(gp, cyl(0.09, 0.05, 0.28, 8), T, 0, -0.14, 0); },
    hand(gp) { for (let i = 0; i < 4; i++) put(gp, cyl(0.009, 0.006, 0.14, 4), mat('#d8e8f0'), -0.03 + i * 0.02, -0.07, 0.01, 0.3); },
  });
  g.userData.legL.visible = g.userData.legR.visible = false; g.userData.float = true;
  return g;
}

const tplCache = new Map();
function relink(root, meta) {
  const u = { ...meta, phase: Math.random() * 6 };
  for (const n of JOINTS) { const o = root.getObjectByName(n); if (o) u[n] = o; }
  const wings = [], legs = [];
  root.traverse((o) => { if (/^wing[LR]$/.test(o.name)) wings.push(o); if (/^qleg\d+$/.test(o.name)) legs.push(o); });
  if (wings.length) u.wings = wings; if (legs.length) u.legs = legs.sort((a, b) => +a.name.slice(4) - +b.name.slice(4));
  root.userData = u;
  return root;
}
const META_KEYS = ['float', 'crawl', 'quad', 'bow', 'armBase', 'hunch', 'id'];
export function makeMob(id0) {
  if (!tplCache.has(id0)) {
    const g = buildMob(id0), meta = {};
    for (const k of META_KEYS) if (g.userData[k] !== undefined) meta[k] = g.userData[k];
    g.userData = {};
    tplCache.set(id0, { g, meta });
  }
  const { g, meta } = tplCache.get(id0);
  return relink(g.clone(true), meta);
}
function buildMob(id0) {
  const A = MOBS[id0], id = A.model || id0, M = MOBS[id], c = A.color || M.color;
  let g;
  if (id === 'skeleton' || id === 'archer' || id === 'boneking') {
    const king = id === 'boneking';
    g = boneman(c, {
      eye: king ? '#ff4a2a' : '#ffb03a', eyeGlow: king,
      head: (h) => { if (king) { put(h, cyl(0.19, 0.17, 0.1, 10), mat('#e8c84a'), 0, 0.17, 0); for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; put(h, cone(0.03, 0.14, 4), mat('#e8c84a'), Math.cos(a) * 0.18, 0.28, Math.sin(a) * 0.18); } } else if (id === 'archer') { scl(put(h, sph(1, 12, 8), mat('#4a3a2a'), 0, 0.04, -0.05), 0.22, 0.23, 0.2); } },
      torso: (b) => {
        if (king) { put(b, ext('cape', [[-0.3, 0], [0.3, 0], [0.42, -1.2], [0, -1.28], [-0.42, -1.2]], 0.02, 0.005), mat('#7a1a2a'), 0, 1.58, -0.18, 0.12); for (const s of [-1, 1]) scl(put(b, sph(1, 10, 8), mat('#a89a6a'), s * 0.3, 1.55, 0), 0.15, 0.1, 0.15); put(b, cyl(0.24, 0.3, 0.32, 10), mat('#5a1a22'), 0, 0.88, 0); }
        else if (id === 'archer') { put(b, box(0.08, 0.5, 0.06), mat('#4a3a2a'), 0, 1.3, 0.12, 0, 0, 0.6); put(b, cyl(0.06, 0.06, 0.5, 8), mat('#5a3a1a'), 0.1, 1.35, -0.2, 0, 0, 0.35); }
        else { put(b, cyl(0.2, 0.26, 0.28, 8), mat('#5a4a3a'), 0, 0.88, 0); scl(put(b, sph(1, 10, 8), mat('#8a8a90'), 0.3, 1.55, 0), 0.13, 0.08, 0.13); }
      },
    });
    const u = g.userData;
    u.handR.add(weaponMesh(id === 'archer' ? 'bow' : id === 'boneking' ? 'sword' : 'axe', king ? 3 : 1));
    if (id === 'skeleton') { const sh = shieldMesh({ id: 'buckler', tier: 1 }, '#7a6a5a'); sh.position.set(-0.08, 0, 0.08); u.handL.add(sh); }
    u.bow = id === 'archer';
  } else if (id === 'zombie') {
    g = human({ skin: c, shirt: '#5a6a4a', pants: '#4a4a3a', shoes: '#3a3428', hair: '#3a3a2a', hairStyle: 'sparse', eyes: '#e8e070', eyeGlow: true, grin: true, noBrows: true, bareArms: true, build: 1.05,
      torso: (b) => { for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; put(b, cone(0.06, 0.16, 3), mat('#5a6a4a'), Math.cos(a) * 0.19, 1.0, Math.sin(a) * 0.19, Math.PI); } for (let i = 0; i < 3; i++) put(b, tor(0.08, 0.012, Math.PI, 8), mat('#e8dcc0'), 0.12, 1.3 + i * 0.06, 0.17, 0, 0.4, 0); put(b, box(0.1, 0.06, 0.02), mat('#8a3a2a'), -0.1, 1.2, 0.2); } });
    g.userData.armBase = -1.4; g.userData.hunch = 0.3;
  } else if (id === 'mummy') {
    const W = mat('#e0d2aa'), W2 = mat('#c8b890');
    g = human({ skin: c, shirt: c, pants: c, shoes: c, eyes: '#5affc8', eyeGlow: true, noBrows: true, build: 1,
      torso: (b) => { for (let i = 0; i < 9; i++) put(b, tor(0.2 + (i > 5 ? 0.04 : 0), 0.02, Math.PI * 2, 14), i % 2 ? W : W2, 0, 0.9 + i * 0.08, 0, Math.PI / 2 + (i % 2 ? 0.15 : -0.12), 0, 0); put(b, box(0.05, 0.4, 0.015), W2, 0.12, 0.7, 0.18, 0, 0, 0.2); },
      headFn: (h) => { for (let i = 0; i < 5; i++) put(h, tor(0.19, 0.018, Math.PI * 2, 14), i % 2 ? W : W2, 0, -0.12 + i * 0.07, 0, Math.PI / 2 + (i % 2 ? 0.25 : -0.2), 0, 0); put(h, box(0.2, 0.03, 0.03), mat('#1a1410'), 0, 0.03, 0.17); } });
    const u = g.userData; for (const n of ['armL', 'armR', 'elbowL', 'elbowR', 'legL', 'legR', 'kneeL', 'kneeR']) for (let i = 0; i < 3; i++) put(u[n], tor(0.085, 0.015, Math.PI * 2, 10), i % 2 ? W : W2, 0, -0.08 - i * 0.1, 0, Math.PI / 2 + (i % 2 ? 0.3 : -0.3), 0, 0);
    u.armBase = -1.3;
  } else if (id === 'knight') {
    const Ar = mat(c), Dk = mat(shade(c, 0.55)), Hl = mat('#2a1a1a');
    g = human({ skin: '#2a1a1a', shirt: '#2a1416', pants: '#1e1012', shoes: '#140a0a', eyes: '#ff5a2a', eyeGlow: true, noBrows: true, build: 1.15,
      torso: (b) => { scl(put(b, sph(1, 14, 10), Ar, 0, 1.37, 0.012), 0.33, 0.26, 0.22); put(b, cyl(0.22, 0.28, 0.36, 10), Dk, 0, 0.9, 0); put(b, box(0.03, 0.42, 0.04), mat('#c83a2a'), 0, 1.3, 0.22, -0.1); put(b, ext('cape', [[-0.3, 0], [0.3, 0], [0.42, -1.15], [0, -1.22], [-0.42, -1.15]], 0.02, 0.005), mat('#4a0a12'), 0, 1.58, -0.22, 0.1); for (const s of [-1, 1]) { scl(put(b, sph(1, 10, 8), Ar, s * 0.34, 1.55, 0), 0.16, 0.12, 0.16); put(b, cone(0.04, 0.2, 5), mat('#e8e0c8'), s * 0.4, 1.66, 0, 0, 0, -s * 0.7); } },
      headFn: (h) => { scl(put(h, sph(1, 14, 10), Hl, 0, 0.03, 0), 0.22, 0.24, 0.225); put(h, box(0.28, 0.025, 0.05), glow('#ff5a2a', 1.8), 0, 0.02, 0.2); for (const s of [-1, 1]) { put(h, cone(0.05, 0.3, 6), mat('#e8e0c8'), s * 0.2, 0.2, 0, 0, 0, -s * 0.8); } } });
    const u = g.userData; u.handR.add(weaponMesh('sword', 3, '#c8c8d8'));
    for (const n of ['elbowL', 'elbowR']) put(u[n], cyl(0.08, 0.07, 0.2, 8), Ar, 0, -0.18, 0); for (const n of ['kneeL', 'kneeR']) { put(u[n], cyl(0.09, 0.085, 0.28, 8), Ar, 0, -0.26, 0); put(u[n], sph(0.075, 8, 6), Ar, 0, 0, 0.03); }
  } else if (id === 'imp' || id === 'fireimp') {
    const fire = id === 'fireimp', D = mat(shade(c, 0.6));
    g = human({ skin: c, shirt: c, pants: c, shoes: D.color ? shade(c, 0.5) : c, eyes: '#ffe25a', eyeGlow: true, grin: true, angry: true, claws: true, bareArms: true, build: 0.92,
      torso: (b) => { put(b, cyl(0.19, 0.24, 0.2, 10), mat('#5a3a1a'), 0, 0.9, 0); let p = new THREE.Vector3(0, 0.95, -0.15); for (let i = 0; i < 6; i++) { put(b, sph(0.04 - i * 0.003, 6, 5), mat(c), 0, p.y - i * 0.05 + i * i * 0.012, p.z - i * 0.09); } put(b, cone(0.06, 0.1, 4), D, 0, 1.15, -0.68, -1.2);
        for (const s of [-1, 1]) { const w = put(b, flat('impwing', [[0, 0], [0.3, 0.25], [0.45, 0.1], [0.36, -0.05], [0.24, 0.02], [0.14, -0.1]]), mat(shade(c, 0.5), { side: THREE.DoubleSide }), s * 0.08, 1.45, -0.18, 0, s > 0 ? -0.5 : Math.PI + 0.5, 0); w.userData.wing = s; } },
      headFn: (h) => { for (const s of [-1, 1]) { put(h, cone(0.035, 0.18, 5), mat('#3a1a1a'), s * 0.1, 0.2, 0, -0.3, 0, -s * 0.5); put(h, cone(0.03, 0.12, 4), mat(c), s * 0.2, 0.03, 0, 0, 0, -s * 1.3); } } });
    if (fire) { put(g.userData.handR, sph(0.09, 8, 6), glow('#ff8a2a', 2.5), 0, -0.05, 0.05); put(g.userData.head, cone(0.08, 0.2, 6), glow('#ff8a2a', 2), 0, 0.26, 0); }
    g.userData.hunch = 0.15;
  } else if (id === 'naga') {
    const D = mat(shade(c, 0.65));
    g = human({ skin: c, shirt: '#2a6a5a', pants: c, eyes: '#ffe25a', eyeGlow: true, noBrows: true,
      torso: (b) => { put(b, ext('frill', [[0, 0], [0.22, 0.1], [0.3, 0.34], [0.16, 0.5], [0, 0.42], [-0.16, 0.5], [-0.3, 0.34], [-0.22, 0.1]], 0.02, 0.005), mat('#2a6a5a'), 0, 1.6, -0.12, 0.1); for (let i = 0; i < 3; i++) put(b, tor(0.19, 0.012, Math.PI, 10), D, 0, 1.1 + i * 0.1, 0.02, 0, 0, Math.PI); put(b, cyl(0.2, 0.26, 0.3, 10), mat('#2a6a5a'), 0, 0.9, 0); for (let i = 0; i < 9; i++) { const a = i * 0.55; put(b, sph(0.2 - i * 0.017, 10, 8), i % 2 ? mat(c) : D, Math.sin(a) * 0.12 * (i / 9), 0.62 - Math.min(i, 3) * 0.17 + (i > 3 ? 0 : 0), -0.05 - i * 0.14); } },
      headFn: (h) => { scl(put(h, sph(1, 12, 8), mat(c), 0, 0.06, -0.05), 0.2, 0.18, 0.22); put(h, box(0.02, 0.04, 0.02), mat('#c83a5a'), 0, -0.14, 0.17); } });
    const u = g.userData; u.legL.visible = u.legR.visible = false; u.handR.add(weaponMesh('staff', 2));
  } else if (id === 'wraith') g = mobWraith(c);
  else if (id === 'bat') g = mobBat(c);
  else if (id === 'scarab' || id === 'queen') g = mobBug(id, c);
  else if (id === 'hound') g = mobHound(c);
  else if (id === 'lord') {
    const D = mat(shade(c, 0.5)), Ar = mat('#2a1418');
    g = human({ skin: c, shirt: '#3a0a12', pants: '#2a0a0a', shoes: '#1a0808', eyes: '#ffcf3a', eyeGlow: true, grin: true, angry: true, claws: true, bareArms: true, build: 1.35,
      torso: (b) => { for (const s of [-1, 1]) { scl(put(b, sph(1, 10, 8), Ar, s * 0.4, 1.56, 0), 0.19, 0.13, 0.19); for (let i = 0; i < 3; i++) put(b, cone(0.04, 0.22, 5), mat('#e8e0c8'), s * (0.32 + i * 0.07), 1.7, -0.02, 0, 0, -s * (0.2 + i * 0.3)); const w = put(b, flat('dwing2', [[0, 0.05], [0.45, 0.5], [0.95, 0.72], [1.15, 0.5], [1.0, 0.1], [0.82, 0.24], [0.66, -0.12], [0.5, 0.06], [0.32, -0.22], [0.18, -0.02], [0, -0.18]]), mat('#5a0a1c', { side: THREE.DoubleSide }), s * 0.26, 1.42, -0.28, 0, s > 0 ? -0.35 : Math.PI + 0.35, 0); w.userData.wing = s;
          for (const [x, y] of [[0.95, 0.72], [1.0, 0.1], [0.66, -0.12], [0.32, -0.22]]) { const len = Math.hypot(x, y); put(w, box(len, 0.035, 0.035), mat('#2a0a10'), x / 2, y / 2, 0.01, 0, 0, Math.atan2(y, x)); } }
        for (let i = 0; i < 5; i++) put(b, box(0.015, 0.14, 0.01), glow('#ff8a2a', 1.6), -0.12 + i * 0.06, 1.3 + (i % 2) * 0.08, 0.235, 0, 0, (i - 2) * 0.3); put(b, cyl(0.26, 0.32, 0.34, 10), Ar, 0, 0.88, 0); },
      headFn: (h) => { for (const s of [-1, 1]) for (let i = 0; i < 4; i++) put(h, cone(0.06 - i * 0.01, 0.16, 6), mat(i === 3 ? '#e8e0c8' : '#1a1010'), s * (0.15 + i * 0.07), 0.16 + i * 0.09 - (i > 1 ? (i - 1) * 0.04 : 0), -0.04 - i * 0.03, -0.3, 0, -s * (0.5 + i * 0.35)); } });
    g.userData.handR.add(weaponMesh('axe', 3, '#8a2a2a'));
  }
  g.scale.multiplyScalar(A.size || M.size);
  g.userData.id = id0;
  return outline(g);
}

// animation for people and monsters. Every joint eases toward a target pose, so moves blend instead of snapping.
//   speed 0..1+ · act '' | 'attack' | 'cast' · actT seconds into the act · dur the act's length · hit 0..1 a flinch
// A melee swing has three beats: wind-up (arm back, elbow bent, body twists away), strike (fast, the arm straightens
// as the body whips through) and follow-through; a bow is drawn and released; a spell is gathered and thrown.
const ease = (a, b, k) => a + (b - a) * k;
export function swingPose(p) {
  // p 0..1 through the swing → [arm angle, body twist, lean]
  if (p < 0.38) { const q = p / 0.38, e = q * q * (3 - 2 * q); return [-2.7 * e, 0.55 * e, -0.12 * e]; }
  if (p < 0.55) { const q = (p - 0.38) / 0.17, e = 1 - (1 - q) * (1 - q); return [-2.7 + 3.5 * e, 0.55 - 1.15 * e, -0.12 + 0.42 * e]; }
  const q = Math.min(1, (p - 0.55) / 0.45), e = q * q * (3 - 2 * q); return [0.8 * (1 - e), -0.6 * (1 - e), 0.3 * (1 - e)];
}
export function animate(g, dt, speed, act = '', actT = 0, dur = 0.5, hit = 0) {
  const u = g.userData; const s = Math.min(1.2, speed);
  u.phase += dt * (3 + s * 10); u.t = (u.t || 0) + dt;
  const k = 1 - Math.exp(-dt * 16), kf = 1 - Math.exp(-dt * 30);
  const sw = Math.sin(u.phase) * 0.8 * Math.min(1, s);
  let legL = sw, legR = -sw, armR = -sw * 0.6, armL = sw * 0.6, armRz = 0, armLz = 0, twist = 0, lean = s * 0.14, bob = Math.abs(Math.sin(u.phase)) * 0.06 * Math.min(1, s), head = 0;
  // knees bend as each leg swings through; elbows bend more at a run
  let kneeL = 0.06 + Math.max(0, Math.sin(u.phase - 1.2)) * 1.2 * Math.min(1, s), kneeR = 0.06 + Math.max(0, Math.sin(u.phase - 1.2 + Math.PI)) * 1.2 * Math.min(1, s);
  let elbR = -0.2 - 0.6 * Math.min(1, s), elbL = -0.2 - 0.6 * Math.min(1, s);
  if (s < 0.05) { const br = Math.sin(u.t * 2.2); armR = 0.06 + br * 0.03; armL = 0.06 - br * 0.03; armRz = 0.08; armLz = -0.08; bob = br * 0.012; lean = 0.02; elbR = elbL = -0.18 - br * 0.04; kneeL = kneeR = 0.05; }
  const p = Math.min(1, actT / Math.max(0.05, dur));
  let fast = false;
  if (act === 'attack' && u.bow) {
    // draw: bow arm straight out, string hand pulls back to the cheek; release at 70%
    const d = Math.min(1, p / 0.7); armL = -1.55; armLz = -0.1; elbL = -0.05; armR = -1.45 * d; armRz = 0.35 * d; elbR = -1.9 * d; twist = -0.35 * d; head = 0.15;
    if (p > 0.7) { armR = -1.2; armRz = -0.2; elbR = -0.3; twist = -0.15; fast = true; }
  } else if (act === 'attack') { const [a, tw, ln] = swingPose(p); armR = a; armRz = -0.2 + (p > 0.38 && p < 0.6 ? 0.5 : 0); twist = tw; lean = ln + s * 0.1; armL = -0.4 - tw * 0.6; elbR = p < 0.38 ? -0.4 - 0.8 * (p / 0.38) : p < 0.55 ? -1.2 + 1.1 * ((p - 0.38) / 0.17) : -0.1 - 0.2 * Math.min(1, (p - 0.55) / 0.45); elbL = -0.9; kneeL = 0.25; kneeR = 0.12; fast = p > 0.35 && p < 0.6; }
  else if (act === 'cast') { const up = p < 0.45 ? p / 0.45 : 1, thr = p < 0.45 ? 0 : Math.min(1, (p - 0.45) / 0.2); armR = armL = -1.9 * up + 0.5 * thr; armRz = -0.35 * up; armLz = 0.35 * up; elbR = elbL = -0.7 * up + 0.6 * thr; lean = -0.12 * up + 0.22 * thr; fast = thr > 0; }
  if (u.armBase !== undefined && !act) { armR = u.armBase + sw * 0.25; armL = u.armBase - sw * 0.25; elbR = elbL = -0.15; }
  lean += u.hunch || 0;
  lean -= hit * 0.35; twist += hit * 0.2 * Math.sin(u.t * 40);
  const kk = fast ? kf : k;
  if (u.legL) { u.legL.rotation.x = ease(u.legL.rotation.x, legL, k); u.legR.rotation.x = ease(u.legR.rotation.x, legR, k); }
  if (u.kneeL) { u.kneeL.rotation.x = ease(u.kneeL.rotation.x, kneeL, k); u.kneeR.rotation.x = ease(u.kneeR.rotation.x, kneeR, k); }
  if (u.armR) {
    u.armR.rotation.x = ease(u.armR.rotation.x, armR, kk); u.armR.rotation.z = ease(u.armR.rotation.z, armRz, kk);
    u.armL.rotation.x = ease(u.armL.rotation.x, armL, kk); u.armL.rotation.z = ease(u.armL.rotation.z, armLz, kk);
  }
  if (u.elbowR) { u.elbowR.rotation.x = ease(u.elbowR.rotation.x, elbR, kk); u.elbowL.rotation.x = ease(u.elbowL.rotation.x, elbL, kk); }
  if (u.head) u.head.rotation.x = ease(u.head.rotation.x, head - lean * 0.4, k);
  u.body.rotation.x = ease(u.body.rotation.x, u.float ? 0 : lean, kk);
  u.body.rotation.y = ease(u.body.rotation.y, twist, kk);
  if (u.wings) for (const w of u.wings) w.rotation.z = Math.sin(u.phase * 3) * 0.7 * (w.position.x > 0 ? 1 : -1);
  if (u.legs) u.legs.forEach((l, i) => { const ph = u.phase + (i % 2 ? Math.PI : 0) + (Math.floor(i / 2) % 2 ? Math.PI / 2 : 0); if (u.crawl) l.rotation.y = ease(l.rotation.y, Math.sin(ph) * 0.45 * Math.min(1, s + 0.15), k); else { l.rotation.x = ease(l.rotation.x, Math.sin(ph) * 0.7 * Math.min(1, s), k); const kn = l.children.find((c) => c.isGroup); if (kn) kn.rotation.x = ease(kn.rotation.x, Math.max(0, -Math.sin(ph)) * 0.9 * Math.min(1, s), k); } });
  const y = u.float ? Math.sin(u.t * 2.4) * 0.15 : bob - (kneeL + kneeR) * 0.015;
  u.body.position.y = ease(u.body.position.y, y, k);
  if (u.crawl || u.quad) u.body.rotation.x = ease(u.body.rotation.x, act === 'attack' ? (p < 0.4 ? -0.25 : 0.2) : 0, kk);
  g.traverse((o) => { if (o.userData.wing) o.rotation.x = Math.sin(u.t * 3) * 0.3; });
}

// ------------------------------------------------------------------ props and places
export function makeProp(kind) {
  const g = new THREE.Group();
  if (kind === 'urn') { scl(put(g, sph(1, 12, 10), mat('#b8784a'), 0, 0.45, 0), 0.4, 0.48, 0.4); put(g, cyl(0.18, 0.25, 0.2, 10), mat('#a8683a'), 0, 0.95, 0); put(g, tor(0.4, 0.025), mat('#7a4a2a'), 0, 0.5, 0, Math.PI / 2); for (const s of [-1, 1]) put(g, tor(0.08, 0.02, Math.PI), mat('#a8683a'), s * 0.3, 0.85, 0, 0, Math.PI / 2, 0); }
  else if (kind === 'barrel') { put(g, cyl(0.42, 0.42, 1, 12), mat('#8a5a34'), 0, 0.5, 0); for (const y of [0.15, 0.5, 0.85]) put(g, cyl(0.44, 0.44, 0.06, 12), mat('#4a4a4a'), 0, y, 0); for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; put(g, box(0.02, 0.98, 0.02), mat('#6a4224'), Math.cos(a) * 0.425, 0.5, Math.sin(a) * 0.425); } }
  else if (kind === 'chest') { put(g, box(1.1, 0.6, 0.7), mat('#8a5a34'), 0, 0.3, 0); for (const x of [-0.45, 0.45]) put(g, box(0.08, 0.62, 0.72), mat('#5a5a62'), x, 0.31, 0); const lid = put(g, box(1.12, 0.25, 0.72), mat('#7a4a2a'), 0, 0.72, 0); lid.userData.lid = true; put(g, box(0.16, 0.2, 0.05), mat('#e8c84a'), 0, 0.55, 0.37); }
  else if (kind === 'torch') { put(g, box(0.12, 0.5, 0.12), mat('#4a3a2a'), 0, 0, 0); put(g, cyl(0.1, 0.06, 0.1, 8), mat('#5a5a62'), 0, 0.26, 0); put(g, cone(0.16, 0.35, 6), glow('#ffb03a', 3), 0, 0.42, 0).userData.flame = true; }
  else if (kind === 'stairs') { for (let i = 0; i < 4; i++) put(g, box(2.6 - i * 0.4, 0.15, 2.6 - i * 0.4), mat(i % 2 ? '#3a3040' : '#4a4050'), 0, -0.05 - i * 0.12, 0); put(g, box(1, 0.05, 1), mat('#0a0810'), 0, -0.5, 0); }
  else if (kind === 'up') { for (let i = 0; i < 4; i++) put(g, box(2.2, 0.25, 0.6), mat('#6a6070'), 0, 0.12 + i * 0.25, -i * 0.5); }
  else if (kind === 'waypoint') { put(g, cyl(1.5, 1.6, 0.25, 16), mat('#8a8aa0'), 0, 0.12, 0); const ring = put(g, tor(1.1, 0.06, Math.PI * 2, 24), glow('#7ab8ff', 2.2), 0, 0.3, 0); ring.rotation.x = Math.PI / 2; ring.userData.spin = true; }
  else if (kind === 'portal') { const p = put(g, geo('ptl', () => new THREE.CircleGeometry(0.9, 24)), new THREE.MeshBasicMaterial({ color: '#5ab0ff', transparent: true, opacity: 0.75, side: THREE.DoubleSide }), 0, 1.3, 0); p.scale.y = 1.4; p.userData.portal = true; put(g, tor(0.92, 0.07, Math.PI * 2, 24), glow('#9ad0ff', 2.2), 0, 1.3, 0).scale.y = 1.4; }
  else if (kind === 'stash') { put(g, box(1.4, 0.8, 0.9), mat('#6a4a2a'), 0, 0.4, 0); put(g, box(1.44, 0.3, 0.94), mat('#e8c84a'), 0, 0.9, 0); }
  else if (kind === 'tent') { const t = put(g, cone(2.6, 2.6, 4), mat('#c8784a'), 0, 1.3, 0); t.rotation.y = Math.PI / 4; put(g, box(1, 1.4, 0.1), mat('#3a2a1a'), 0, 0.7, 1.75); }
  else if (kind === 'fire') { for (let i = 0; i < 6; i++) put(g, sph(0.15, 6, 5), mat('#7a7a7a'), Math.cos(i) * 0.5, 0.1, Math.sin(i) * 0.5); put(g, cone(0.3, 0.8, 6), glow('#ff8a2a', 2.5), 0, 0.45, 0).userData.flame = true; }
  return outline(g);
}
export function makeNPC(look) {
  return outline(human({ skin: look.skin, shirt: look.shirt, pants: '#4a3a2a', hair: look.hair, hairStyle: 'short', beard: look.beard, robe: look.robe }));
}
