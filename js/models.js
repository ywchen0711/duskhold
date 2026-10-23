// Models in the Breezy Isle look (four-step cel shading, dark brown outlines): heroes that wear what they equip,
// every monster and boss, and the dungeon's props.
import * as THREE from 'three';
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
export function outline(g, w = 0.04) {
  const add = [];
  g.traverse((o) => { if (!o.isMesh || o.userData.noOutline || o.material === OUTLINE || o.material.transparent || o.material.emissiveIntensity > 1) return; const m = new THREE.Mesh(o.geometry, OUTLINE); m.userData.noOutline = true; const s = o.geometry.boundingSphere || (o.geometry.computeBoundingSphere(), o.geometry.boundingSphere); m.scale.setScalar(1 + w / Math.max(0.05, s.radius)); add.push([o, m]); });
  for (const [o, m] of add) o.add(m);
  return g;
}
const geos = new Map();
const geo = (k, f) => { if (!geos.has(k)) geos.set(k, f()); return geos.get(k); };
const box = (w, h, d) => geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
const sph = (r, a = 12, b = 10) => geo(`s${r},${a},${b}`, () => new THREE.SphereGeometry(r, a, b));
const cyl = (t, b, h, n = 10) => geo(`c${t},${b},${h},${n}`, () => new THREE.CylinderGeometry(t, b, h, n));
const cone = (r, h, n = 8) => geo(`k${r},${h},${n}`, () => new THREE.ConeGeometry(r, h, n));
const cap = (r, l) => geo(`p${r},${l}`, () => new THREE.CapsuleGeometry(r, l, 4, 10));
function put(parent, g, m, x = 0, y = 0, z = 0) { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; }
const limb = (body, x, y, len, r, m) => { const p = new THREE.Group(); p.position.set(x, y, 0); body.add(p); put(p, cap(r, len), m, 0, -len / 2 - r * 0.3, 0); return p; };

// ------------------------------------------------------------------ a humanoid (heroes, skeletons, zombies, mummies, knights…)
function biped({ skin, shirt, pants, head = null, scale = 1, hunch = 0, eyes = '#1a1420', eyeGlow = false }) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const S = mat(skin), T = mat(shirt), P = mat(pants);
  const legL = limb(body, -0.17, 0.62, 0.32, 0.12, P), legR = limb(body, 0.17, 0.62, 0.32, 0.12, P);
  const torso = put(body, cap(0.3, 0.34), T, 0, 0.92, 0); torso.rotation.x = hunch;
  const armL = limb(body, -0.4, 1.12, 0.3, 0.09, T), armR = limb(body, 0.4, 1.12, 0.3, 0.09, T);
  put(armL, sph(0.1, 8, 6), S, 0, -0.5, 0); put(armR, sph(0.1, 8, 6), S, 0, -0.5, 0);
  const handR = new THREE.Group(); handR.position.set(0, -0.52, 0.06); armR.add(handR);
  const handL = new THREE.Group(); handL.position.set(0, -0.5, 0.08); armL.add(handL);
  const hd = new THREE.Group(); hd.position.set(0, 1.6, hunch * 0.6); body.add(hd);
  put(hd, sph(0.44, 16, 12), S);
  const em = eyeGlow ? glow(eyes, 2) : mat(eyes);
  for (const s of [-1, 1]) { const e = put(hd, sph(0.07, 8, 6), em, s * 0.16, 0.03, 0.4); e.scale.set(0.8, 1.2, 0.6); }
  if (head) head(hd);
  root.scale.setScalar(scale);
  root.userData = { body, head: hd, legL, legR, armL, armR, handR, handL, phase: Math.random() * 6 };
  return root;
}
// what a hero holds and wears (the paper doll): every slot shows, in the item's own colour when it is a unique or a set piece
function weaponMesh(type, tier, col = null) {
  const g = new THREE.Group(), metal = mat(col || (tier >= 3 ? '#e8d07a' : tier >= 2 ? '#c8d0e0' : '#a8a8b0')), wood = mat('#7a4a2a'), gem = col ? glow(col, 1.3) : null;
  if (type === 'sword') { put(g, box(0.06, 0.06, 0.22), wood); put(g, box(0.22, 0.05, 0.05), mat('#d8b040'), 0, 0, 0.12); put(g, box(0.05, 0.08, 0.8 + tier * 0.1), metal, 0, 0, 0.6); if (gem) put(g, sph(0.05, 6, 5), gem, 0, 0.05, 0.12); }
  else if (type === 'axe') { put(g, cyl(0.03, 0.03, 0.9, 6), wood, 0, 0, 0.35).rotation.x = Math.PI / 2; put(g, box(0.05, 0.32 + tier * 0.05, 0.26), metal, 0, 0.12, 0.7); if (gem) put(g, sph(0.05, 6, 5), gem, 0, 0.12, 0.7); }
  else if (type === 'mace') { put(g, cyl(0.03, 0.03, 0.8, 6), wood, 0, 0, 0.3).rotation.x = Math.PI / 2; put(g, sph(0.13 + tier * 0.02, 8, 6), metal, 0, 0, 0.72); if (gem) for (let i = 0; i < 4; i++) put(g, cone(0.04, 0.12, 4), gem, Math.cos(i * 1.57) * 0.15, Math.sin(i * 1.57) * 0.15, 0.72).rotation.set(Math.PI / 2, 0, i * 1.57); }
  else if (type === 'bow') { const b = put(g, geo('bow' + tier, () => new THREE.TorusGeometry(0.5, 0.03, 5, 14, Math.PI)), mat(col || (tier >= 3 ? '#3a2a1a' : '#8a5a2a')), 0, 0, 0.1); b.rotation.set(0, Math.PI / 2, Math.PI / 2); put(g, cyl(0.006, 0.006, 1, 3), mat('#f4f4f4'), 0, 0, 0.1).rotation.x = Math.PI / 2; }
  else if (type === 'staff') { put(g, cyl(0.035, 0.04, 1.7, 6), wood, 0, 0.35, 0.1); put(g, sph(0.11, 10, 8), glow(col || (tier >= 3 ? '#ff7a3a' : '#7ab8ff'), 1.4), 0, 1.25, 0.1); }
  else if (type === 'wand') { put(g, cyl(0.02, 0.03, 0.45, 6), mat('#e8e0c8'), 0, 0, 0.2).rotation.x = Math.PI / 2; put(g, sph(0.06, 8, 6), glow(col || '#c87aff', 1.4), 0, 0, 0.45); }
  g.rotation.x = -0.35;
  return g;
}
export function makeHero(cls, equip = {}) {
  const C = CLASSES[cls], col = C.color;
  const B = (s) => equip[s] && BASES[equip[s].base], tint = (s) => itemColor(equip[s]);
  const h = B('head'), hc = tint('head');
  const head = (hd) => {
    if (h) {
      const c = hc || (h.tier >= 3 ? '#e8c84a' : h.tier >= 2 ? '#b8c0d0' : '#8a5a3a');
      if (h.id === 'crown') { put(hd, cyl(0.42, 0.45, 0.22, 10), mat(c), 0, 0.42, 0); for (let i = 0; i < 5; i++) put(hd, cone(0.07, 0.2, 5), mat(c), Math.cos(i * 1.256) * 0.38, 0.62, Math.sin(i * 1.256) * 0.38); }
      else if (h.id === 'circlet') { put(hd, geo('circ', () => new THREE.TorusGeometry(0.44, 0.035, 6, 20)), mat(c), 0, 0.22, 0).rotation.x = Math.PI / 2 - 0.15; put(hd, sph(0.07, 8, 6), glow(hc || '#8ab8ff', 1.5), 0, 0.26, 0.44); }
      else if (h.tier >= 2) { const m = put(hd, sph(0.48, 14, 8), mat(c), 0, 0.12, -0.02); m.scale.set(1, 0.75, 1); put(hd, box(0.08, 0.3, 0.1), mat(c), 0, 0.05, 0.45); if (hc) for (const s of [-1, 1]) put(hd, cone(0.06, 0.3, 5), mat('#e8e0c8'), s * 0.4, 0.4, 0).rotation.z = -s * 0.6; }
      else { const m = put(hd, sph(0.47, 14, 8), mat(c), 0, 0.15, -0.02); m.scale.set(1, 0.6, 1); }
      if (hc && h.id !== 'circlet') put(hd, sph(0.06, 8, 6), glow(hc, 1.5), 0, 0.3, 0.42);
    }
    else if (cls === 'druid') { put(hd, sph(0.5, 14, 10), mat('#4a7a2a'), 0, 0.1, -0.04).scale.set(1, 0.9, 1); for (let i = 0; i < 6; i++) { const lf = put(hd, sph(0.14, 6, 5), mat(i % 2 ? '#6aaa3a' : '#3a8a2a'), Math.cos(i) * 0.42, 0.42 + (i % 3) * 0.06, Math.sin(i) * 0.42); lf.scale.set(1, 0.4, 1.6); } }
    else if (cls === 'necro') { const hood = put(hd, sph(0.52, 14, 10), mat('#2a2238'), 0, 0.06, -0.06); hood.scale.set(1, 1.05, 1.05); put(hd, cone(0.3, 0.5, 8), mat('#2a2238'), 0, 0.55, -0.15).rotation.x = -0.4; }
    else if (cls === 'sorc') { put(hd, sph(0.47, 14, 10), mat('#f2d26a'), 0, 0.1, -0.06).scale.set(1, 0.85, 1); put(hd, box(0.9, 0.9, 0.2), mat('#f2d26a'), 0, -0.2, -0.32); }
    else if (cls === 'ranger') { put(hd, cone(0.55, 0.7, 10), mat('#3a7a3a'), 0, 0.42, -0.05); }
    else put(hd, sph(0.47, 14, 10), mat('#5a3a1a'), 0, 0.12, -0.04).scale.set(1, 0.7, 1);
  };
  // body armour colours the shirt (and for plate, the legs)
  const bd = B('body'), bodyT = bd ? bd.tier : 0, bc = tint('body');
  const shirt = bc || (bodyT >= 3 ? '#c8ccd8' : bodyT === 2 ? '#8a8a9a' : col);
  const pants = bodyT >= 3 && bc ? '#4a4a5a' : cls === 'sorc' ? '#3a2a6a' : cls === 'necro' ? '#1a1424' : cls === 'druid' ? '#5a4a2a' : '#4a3a2a';
  const g = biped({ skin: cls === 'necro' ? '#e0dcd0' : '#f2c9a0', shirt, pants, head });
  const u = g.userData;
  if ((cls === 'sorc' || cls === 'necro') && !equip.body) put(u.body, cone(0.45, 0.8, 10), mat(col), 0, 0.55, 0);
  if (bodyT >= 2) for (const s of [-1, 1]) put(u.body, sph(0.16, 8, 6), mat(bc ? shade(bc, 1.25) : bodyT >= 3 ? '#e8d07a' : '#a8a8b8'), s * 0.38, 1.25, 0);
  if (bodyT >= 3) { const p = put(u.body, box(0.46, 0.4, 0.12), mat(bc ? shade(bc, 0.8) : '#a8acb8'), 0, 1.0, 0.26); p.rotation.x = -0.1; }
  if (bc) put(u.body, sph(0.055, 8, 6), glow(bc, 1.4), 0, 1.02, 0.33);
  // gloves: bigger hands; gauntlets get a cuff
  const gl = B('gloves'), gc = tint('gloves') || (gl && gl.tier >= 2 ? '#a8a8b8' : '#7a4a2a');
  if (gl) for (const arm of [u.armL, u.armR]) { put(arm, sph(0.13, 8, 6), mat(gc), 0, -0.5, 0); if (gl.tier >= 2) put(arm, cyl(0.12, 0.11, 0.12, 8), mat(shade(gc, 0.85)), 0, -0.4, 0); }
  // boots (or bare feet)
  const bt = B('boots'), btc = tint('boots') || (bt ? (bt.tier >= 2 ? '#9a9aaa' : '#6a4228') : '#3a2a1a');
  for (const leg of [u.legL, u.legR]) { put(leg, box(0.2, 0.14, 0.32), mat(btc), 0, -0.46, 0.05); if (bt && bt.tier >= 2) put(leg, cyl(0.14, 0.14, 0.16, 8), mat(shade(btc, 0.85)), 0, -0.34, 0); }
  // belt and its buckle
  const bl = B('belt');
  if (bl) { const c = tint('belt') || (bl.tier >= 2 ? '#5a4a3a' : '#7a5a3a'); put(u.body, geo('belt', () => new THREE.TorusGeometry(0.305, 0.055, 6, 18)), mat(c), 0, 0.68, 0).rotation.x = Math.PI / 2; put(u.body, box(0.12, 0.1, 0.05), mat(tint('belt') ? shade(c, 1.4) : '#d8b040'), 0, 0.68, 0.32); }
  // amulet on the chest, rings as a glint on the hands
  if (equip.amulet) { put(u.body, geo('chainA', () => new THREE.TorusGeometry(0.2, 0.012, 4, 16)), mat('#d8b040'), 0, 1.28, 0.05).rotation.x = Math.PI / 2 - 0.5; put(u.body, sph(0.065, 8, 6), glow(tint('amulet') || '#7ab8ff', 1.6), 0, 1.14, 0.29); }
  for (const [s, arm] of [['ring1', u.armR], ['ring2', u.armL]]) if (equip[s]) put(arm, sph(0.035, 6, 5), glow(tint(s) || '#e8c84a', 1.8), 0.07, -0.5, 0.07);
  const w = B('weapon');
  if (w) u.handR.add(weaponMesh(w.type, w.tier, tint('weapon')));
  const o = B('offhand'), oc = tint('offhand');
  if (o && o.block) { const r0 = 0.32 + o.tier * 0.04, sh = put(u.handL, cyl(r0, r0, 0.06, 12), mat(oc || (o.tier >= 3 ? '#8a8a9a' : '#8a5a3a')), -0.08, 0, 0.12); sh.rotation.z = Math.PI / 2; put(u.handL, sph(0.08, 8, 6), oc ? glow(oc, 1.3) : mat('#e8c84a'), -0.13, 0, 0.12); if (oc) { const rim = put(u.handL, geo('rim' + o.tier, () => new THREE.TorusGeometry(r0, 0.03, 4, 18)), mat(shade(oc, 1.4)), -0.12, 0, 0.12); rim.rotation.y = Math.PI / 2; } }
  else if (o) put(u.handL, sph(0.16, 12, 10), glow(oc || '#8ab8ff', 1.2), 0, 0, 0.1);
  if (cls === 'ranger') put(u.body, cyl(0.1, 0.1, 0.7, 8), mat('#6a4a2a'), 0.15, 1.1, -0.32).rotation.z = 0.4;   // quiver
  // three or more pieces of one set: a cape in the set's colour
  const sets = {}; for (const it of Object.values(equip)) if (it && it.set) (sets[it.set] = sets[it.set] || new Set()).add(it.sp);
  const full = Object.entries(sets).find(([, v]) => v.size >= 3);
  if (full) { const c = SET_BY_ID[full[0]].col, cape = put(u.body, box(0.72, 1.05, 0.05), mat(c), 0, 0.82, -0.33); cape.rotation.x = 0.12; put(u.body, box(0.78, 0.1, 0.1), mat(shade(c, 0.7)), 0, 1.33, -0.3); }
  u.bow = w && w.type === 'bow';
  return outline(g);
}
const shade = (hex, k) => { const c = new THREE.Color(hex); c.multiplyScalar(k); return '#' + c.getHexString(); };

// ------------------------------------------------------------------ monsters
export function makeMob(id0) {
  const A = MOBS[id0], id = A.model || id0, M = MOBS[id], c = A.color || M.color;
  let g;
  const skull = (hd) => { put(hd, box(0.5, 0.18, 0.1), mat('#2a2018'), 0, -0.2, 0.36); };
  if (id === 'skeleton' || id === 'archer' || id === 'boneking') {
    g = biped({ skin: c, shirt: c, pants: c, eyes: id === 'boneking' ? '#ff4a2a' : '#1a1410', eyeGlow: id === 'boneking', head: (hd) => { skull(hd); if (id === 'boneking') { put(hd, cyl(0.4, 0.44, 0.25, 8), mat('#e8c84a'), 0, 0.45, 0); for (let i = 0; i < 6; i++) put(hd, cone(0.07, 0.25, 5), mat('#e8c84a'), Math.cos(i) * 0.38, 0.65, Math.sin(i) * 0.38); } } });
    const u = g.userData;
    for (let i = 0; i < 3; i++) put(u.body, box(0.5, 0.05, 0.25), mat('#c8c0a8'), 0, 0.8 + i * 0.12, 0.08);
    u.handR.add(weaponMesh(id === 'archer' ? 'bow' : 'sword', id === 'boneking' ? 3 : 1));
    if (id === 'boneking') { const cape = put(u.body, box(0.8, 1.2, 0.06), mat('#7a1a2a'), 0, 0.85, -0.32); cape.rotation.x = 0.15; }
  } else if (id === 'zombie' || id === 'mummy' || id === 'knight') {
    g = biped({ skin: c, shirt: id === 'knight' ? '#3a1a1a' : id === 'mummy' ? '#e8dcb8' : '#5a6a4a', pants: id === 'knight' ? '#2a1010' : '#4a4a3a', hunch: id === 'zombie' ? 0.35 : 0, eyes: id === 'knight' ? '#ff5a2a' : '#1a1410', eyeGlow: id === 'knight',
      head: (hd) => { if (id === 'mummy') for (let i = 0; i < 4; i++) put(hd, cyl(0.46, 0.46, 0.06, 12), mat('#d8c8a0'), 0, -0.25 + i * 0.16, 0).rotation.z = (i % 2 ? 0.15 : -0.15); if (id === 'knight') { put(hd, sph(0.48, 12, 8), mat('#3a2a2a'), 0, 0.05, 0).scale.set(1, 0.9, 1); for (const s of [-1, 1]) { const h = put(hd, cone(0.1, 0.5, 6), mat('#e8e0c8'), s * 0.35, 0.45, 0); h.rotation.z = -s * 0.5; } } } });
    const u = g.userData; if (id !== 'knight') u.armBase = -1.4;
    if (id === 'knight') u.handR.add(weaponMesh('sword', 3));
  } else if (id === 'imp' || id === 'fireimp') {
    g = biped({ skin: c, shirt: c, pants: c, eyes: '#ffe25a', eyeGlow: true, head: (hd) => { for (const s of [-1, 1]) { const h = put(hd, cone(0.08, 0.35, 5), mat('#3a1a1a'), s * 0.25, 0.42, 0); h.rotation.z = -s * 0.4; } } });
    if (id === 'fireimp') put(g.userData.handR, sph(0.15, 8, 6), glow('#ff8a2a', 2.5), 0, 0, 0.1);
  } else if (id === 'naga') {
    g = biped({ skin: c, shirt: '#2a6a5a', pants: c, eyes: '#ffe25a', eyeGlow: true, head: (hd) => { put(hd, cone(0.5, 0.6, 8), mat('#2a6a5a'), 0, 0.35, -0.1); } });
    const u = g.userData; u.legL.visible = u.legR.visible = false; const tail = put(u.body, cone(0.35, 1.4, 10), mat(c), 0, 0.3, -0.3); tail.rotation.x = -2.2;
    u.handR.add(weaponMesh('staff', 2));
  } else if (id === 'wraith') {
    g = new THREE.Group(); const body = new THREE.Group(); g.add(body);
    put(body, cone(0.55, 1.6, 12), mat(c, { transparent: true, opacity: 0.7 }), 0, 1.1, 0).rotation.x = Math.PI;
    const hd = new THREE.Group(); hd.position.y = 1.9; body.add(hd); put(hd, sph(0.42, 12, 10), mat(c, { transparent: true, opacity: 0.8 }));
    for (const s of [-1, 1]) put(hd, sph(0.08, 8, 6), glow('#e8f8ff', 3), s * 0.15, 0, 0.36);
    g.userData = { body, head: hd, phase: Math.random() * 6, float: true };
  } else if (id === 'bat') {
    g = new THREE.Group(); const body = new THREE.Group(); g.add(body);
    put(body, sph(0.3, 10, 8), mat(c), 0, 1.6, 0); for (const s of [-1, 1]) put(body, sph(0.05, 6, 5), glow('#ff4a4a', 2), s * 0.12, 1.68, 0.26);
    const wings = []; for (const s of [-1, 1]) { const w = new THREE.Group(); w.position.set(s * 0.25, 1.62, 0); body.add(w); const m = put(w, box(0.8, 0.04, 0.45), mat('#3a2030'), s * 0.4, 0, 0); m.userData.s = s; wings.push(w); }
    g.userData = { body, wings, phase: Math.random() * 6, float: true };
  } else if (id === 'scarab' || id === 'queen') {
    g = new THREE.Group(); const body = new THREE.Group(); g.add(body);
    const sh = put(body, sph(0.6, 14, 10), mat(c), 0, 0.5, 0); sh.scale.set(1, 0.6, 1.3);
    put(body, sph(0.3, 10, 8), mat('#2a2a3a'), 0, 0.45, 0.75);
    for (let i = 0; i < 3; i++) for (const s of [-1, 1]) { const l = put(body, cyl(0.04, 0.04, 0.6, 5), mat('#2a2a3a'), s * 0.55, 0.25, -0.3 + i * 0.35); l.rotation.z = s * 1.0; }
    if (id === 'scarab') put(body, cone(0.08, 0.4, 6), glow('#7ab8ff', 1.4), 0, 0.75, 0.85).rotation.x = 0.9;
    if (id === 'queen') {
      for (const s of [-1, 1]) { const cl = put(body, sph(0.3, 8, 6), mat(c), s * 0.6, 0.6, 1.1); cl.scale.set(0.8, 0.5, 1.4); }
      const tail = new THREE.Group(); tail.position.set(0, 0.6, -0.7); body.add(tail);
      for (let i = 0; i < 5; i++) put(tail, sph(0.22 - i * 0.02, 8, 6), mat(c), 0, i * 0.3, -i * 0.12);
      put(tail, cone(0.12, 0.4, 6), mat('#2a1a1a'), 0, 1.6, 0.2).rotation.x = 2.4;
      for (const s of [-1, 1]) put(body, sph(0.07, 6, 5), glow('#ffe25a', 2.5), s * 0.12, 0.6, 1.0);
    }
    g.userData = { body, phase: Math.random() * 6, crawl: true };
  } else if (id === 'hound') {
    g = new THREE.Group(); const body = new THREE.Group(); g.add(body);
    put(body, cap(0.32, 0.8), mat(c), 0, 0.7, 0).rotation.x = Math.PI / 2;
    put(body, sph(0.3, 10, 8), mat(c), 0, 0.95, 0.65); for (const s of [-1, 1]) put(body, sph(0.06, 6, 5), glow('#ffcf3a', 2.5), s * 0.12, 1.0, 0.9);
    const legs = []; for (const [x, z] of [[-0.2, 0.4], [0.2, 0.4], [-0.2, -0.4], [0.2, -0.4]]) { const l = new THREE.Group(); l.position.set(x, 0.6, z); body.add(l); put(l, cap(0.08, 0.35), mat('#3a1a0a'), 0, -0.3, 0); legs.push(l); }
    put(body, cyl(0.2, 0.2, 0.05, 6), glow('#ff6a1a', 2), 0, 0.98, 0).rotation.x = Math.PI / 2;
    g.userData = { body, legs, phase: Math.random() * 6, quad: true };
  } else if (id === 'lord') {
    g = biped({ skin: c, shirt: '#3a0a12', pants: '#2a0a0a', eyes: '#ffcf3a', eyeGlow: true, head: (hd) => { for (const s of [-1, 1]) { const h = put(hd, cone(0.14, 0.8, 6), mat('#1a1010'), s * 0.32, 0.55, -0.05); h.rotation.z = -s * 0.6; } } });
    const u = g.userData;
    for (const s of [-1, 1]) { const w = put(u.body, geo('dwing', () => { const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(1.6, 0.9); sh.lineTo(1.9, -0.4); sh.lineTo(0.9, -0.1); sh.lineTo(0, -0.4); return new THREE.ShapeGeometry(sh); }), mat('#4a0a1a', { side: THREE.DoubleSide }), s * 0.3, 1.2, -0.3); w.rotation.y = s > 0 ? -0.3 : Math.PI + 0.3; w.userData.wing = s; }
    u.handR.add(weaponMesh('axe', 3));
  }
  g.scale.multiplyScalar(A.size || M.size);
  g.userData.id = id0;
  return outline(g);
}
// animation for people and monsters. Every joint eases toward a target pose, so moves blend instead of snapping.
//   speed 0..1+ · act '' | 'attack' | 'cast' · actT seconds into the act · dur the act's length · hit 0..1 a flinch
// A melee swing has three beats: wind-up (arm back, body twists away), strike (fast, body whips through, leans in)
// and follow-through; a bow is drawn and released; a spell is gathered with both hands and thrown.
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
  const sw = Math.sin(u.phase) * 0.85 * Math.min(1, s);
  let legL = sw, legR = -sw, armR = -sw * 0.65, armL = sw * 0.65, armRz = 0, armLz = 0, twist = 0, lean = s * 0.14, bob = Math.abs(Math.sin(u.phase)) * 0.07 * Math.min(1, s), head = 0;
  if (s < 0.05) { const br = Math.sin(u.t * 2.2); armR = 0.06 + br * 0.04; armL = 0.06 - br * 0.04; bob = br * 0.015; lean = 0.02; }
  const p = Math.min(1, actT / Math.max(0.05, dur));
  let fast = false;
  if (act === 'attack' && u.bow) {
    // draw: bow arm forward, string hand pulls back; release at 70%
    const d = Math.min(1, p / 0.7); armL = -1.55; armLz = -0.15; armR = -1.45 * d; armRz = 0.35 * d; twist = -0.35 * d; head = 0.15;
    if (p > 0.7) { armR = -1.2; armRz = -0.2; twist = -0.15; fast = true; }
  } else if (act === 'attack') { const [a, tw, ln] = swingPose(p); armR = a; armRz = -0.2 + (p > 0.38 && p < 0.6 ? 0.5 : 0); twist = tw; lean = ln + s * 0.1; armL = -0.4 - tw * 0.6; fast = p > 0.35 && p < 0.6; }
  else if (act === 'cast') { const up = p < 0.45 ? p / 0.45 : 1, thr = p < 0.45 ? 0 : Math.min(1, (p - 0.45) / 0.2); armR = armL = -1.9 * up + 0.5 * thr; armRz = -0.35 * up; armLz = 0.35 * up; lean = -0.12 * up + 0.22 * thr; fast = thr > 0; }
  if (u.armBase !== undefined && !act) { armR = u.armBase + sw * 0.25; armL = u.armBase - sw * 0.25; }
  lean -= hit * 0.35; twist += hit * 0.2 * Math.sin(u.t * 40);
  const kk = fast ? kf : k;
  if (u.legL) { u.legL.rotation.x = ease(u.legL.rotation.x, legL, k); u.legR.rotation.x = ease(u.legR.rotation.x, legR, k); }
  if (u.armR) {
    u.armR.rotation.x = ease(u.armR.rotation.x, armR, kk); u.armR.rotation.z = ease(u.armR.rotation.z, armRz, kk);
    u.armL.rotation.x = ease(u.armL.rotation.x, armL, kk); u.armL.rotation.z = ease(u.armL.rotation.z, armLz, kk);
  }
  if (u.head) u.head.rotation.x = ease(u.head.rotation.x, head - lean * 0.4, k);
  u.body.rotation.x = ease(u.body.rotation.x, u.float ? 0 : lean, kk);
  u.body.rotation.y = ease(u.body.rotation.y, twist, kk);
  if (u.wings) for (const w of u.wings) w.rotation.z = Math.sin(u.phase * 3) * 0.7 * (w.position.x > 0 ? 1 : -1);
  if (u.legs) u.legs.forEach((l, i) => { l.rotation.x = ease(l.rotation.x, Math.sin(u.phase + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.7 * Math.min(1, s), k); });
  const y = u.float ? Math.sin(u.t * 2.4) * 0.15 : bob;
  u.body.position.y = ease(u.body.position.y, y, k);
  if (u.crawl || u.quad) u.body.rotation.x = ease(u.body.rotation.x, act === 'attack' ? (p < 0.4 ? -0.25 : 0.2) : 0, kk);
  g.traverse((o) => { if (o.userData.wing) o.rotation.x = Math.sin(u.t * 3) * 0.3; });
}

// ------------------------------------------------------------------ props and places
export function makeProp(kind) {
  const g = new THREE.Group();
  if (kind === 'urn') { put(g, sph(0.4, 10, 8), mat('#b8784a'), 0, 0.45, 0).scale.set(1, 1.2, 1); put(g, cyl(0.2, 0.25, 0.2, 10), mat('#a8683a'), 0, 0.95, 0); }
  else if (kind === 'barrel') { put(g, cyl(0.42, 0.42, 1, 12), mat('#8a5a34'), 0, 0.5, 0); for (const y of [0.15, 0.85]) put(g, cyl(0.44, 0.44, 0.06, 12), mat('#4a4a4a'), 0, y, 0); }
  else if (kind === 'chest') { put(g, box(1.1, 0.6, 0.7), mat('#8a5a34'), 0, 0.3, 0); const lid = put(g, box(1.12, 0.25, 0.72), mat('#7a4a2a'), 0, 0.72, 0); lid.userData.lid = true; put(g, box(0.16, 0.2, 0.05), mat('#e8c84a'), 0, 0.55, 0.37); }
  else if (kind === 'torch') { put(g, box(0.12, 0.5, 0.12), mat('#4a3a2a'), 0, 0, 0); put(g, cone(0.16, 0.35, 6), glow('#ffb03a', 3), 0, 0.42, 0).userData.flame = true; }
  else if (kind === 'stairs') { for (let i = 0; i < 4; i++) put(g, box(2.6 - i * 0.4, 0.15, 2.6 - i * 0.4), mat(i % 2 ? '#3a3040' : '#4a4050'), 0, -0.05 - i * 0.12, 0); put(g, box(1, 0.05, 1), mat('#0a0810'), 0, -0.5, 0); }
  else if (kind === 'up') { for (let i = 0; i < 4; i++) put(g, box(2.2, 0.25, 0.6), mat('#6a6070'), 0, 0.12 + i * 0.25, -i * 0.5); }
  else if (kind === 'waypoint') { put(g, cyl(1.5, 1.6, 0.25, 16), mat('#8a8aa0'), 0, 0.12, 0); const ring = put(g, geo('wpr', () => new THREE.TorusGeometry(1.1, 0.06, 6, 24)), glow('#7ab8ff', 2.2), 0, 0.3, 0); ring.rotation.x = Math.PI / 2; ring.userData.spin = true; }
  else if (kind === 'portal') { const p = put(g, geo('ptl', () => new THREE.CircleGeometry(0.9, 24)), new THREE.MeshBasicMaterial({ color: '#5ab0ff', transparent: true, opacity: 0.75, side: THREE.DoubleSide }), 0, 1.3, 0); p.scale.y = 1.4; p.userData.portal = true; put(g, geo('ptr', () => new THREE.TorusGeometry(0.92, 0.07, 6, 24)), glow('#9ad0ff', 2.2), 0, 1.3, 0).scale.y = 1.4; }
  else if (kind === 'stash') { put(g, box(1.4, 0.8, 0.9), mat('#6a4a2a'), 0, 0.4, 0); put(g, box(1.44, 0.3, 0.94), mat('#e8c84a'), 0, 0.9, 0); }
  else if (kind === 'tent') { const t = put(g, cone(2.6, 2.6, 4), mat('#c8784a'), 0, 1.3, 0); t.rotation.y = Math.PI / 4; put(g, box(1, 1.4, 0.1), mat('#3a2a1a'), 0, 0.7, 1.75); }
  else if (kind === 'fire') { for (let i = 0; i < 6; i++) put(g, sph(0.15, 6, 5), mat('#7a7a7a'), Math.cos(i) * 0.5, 0.1, Math.sin(i) * 0.5); put(g, cone(0.3, 0.8, 6), glow('#ff8a2a', 2.5), 0, 0.45, 0).userData.flame = true; }
  return outline(g);
}
export function makeNPC(look) { return outline(biped({ skin: look.skin, shirt: look.shirt, pants: '#4a3a2a', head: (hd) => put(hd, sph(0.47, 14, 10), mat(look.hair), 0, 0.12, -0.04).scale.set(1, 0.75, 1) })); }
