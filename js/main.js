// Duskhold: the client. Draws the camp and the dungeons, runs your hero, the monsters, skills, loot and every screen.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { CLASSES, SKILLS, SKILL_ORDER, MAX_SKILL, MAX_LEVEL, xpFor, DIFFS, ACTS, mlvlOf, MOBS, mobStats, MODS, UNAME, UNAME2, BASES, STAT_NAMES, RARITY, POTIONS, SLOTS, SLOT_NAMES } from './data.js?v=1';
import { rollItem, makeItem, potionFor, itemValue, rng, newUid } from './loot.js?v=1';
import { derive, attackDamage, hitChance, mobHitChance, takeDamage } from './combat.js?v=1';
import { genLevel, genTown, collide, field, stepOn, sees, walkAt, toT, toW, TS, FLOOR, WALL, PILLAR } from './dungeon.js?v=1';
import { makeHero, makeMob, animate, makeProp, makeNPC, mat, glow, OUTLINE, GRAD } from './models.js?v=1';
import { sfx } from './audio.js?v=1';
import { STR } from './text.js?v=1';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const isTouch = matchMedia('(pointer: coarse)').matches || params.has('touch');
const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const rnd = Math.random, clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ------------------------------------------------------------------ save: several characters
const SAVE_KEY = 'dh_save_v1', GAME = 'duskhold';
let SV = (() => { try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || null; } catch (e) { return null; } })() || { chars: [], lang: /^zh/i.test(navigator.language || '') ? 'zh' : 'en', sound: true };
const qLang = (location.search.match(/[?&]lang=(zh|en)(?![a-z])/) || [])[1]; if (qLang) SV.lang = qLang;
let cloud = null, saveT = 0;
const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(SV)); } catch (e) { /* private */ } if (cloud) cloud.touch(GAME, SAVE_KEY); };
const changed = () => { saveT = 1; };
const tr = () => STR[SV.lang] || STR.en;
const tx = (p) => (p ? p[SV.lang === 'zh' ? 0 : 1] : '');
function newChar(name, cls) {
  const c = { id: newUid(), name, cls, lvl: 1, xp: 0, pts: 0, spts: 1, alloc: { str: 0, dex: 0, vit: 0, ene: 0 }, skills: {}, keys: { Q: null, E: null, R: null, F: null }, rmb: null,
    equip: {}, inv: [], stash: [], gold: 80, pots: { hp1: 4, mp1: 3 }, tp: 3, wps: { '0-0-0': 1 }, diff: 0, maxDiff: 0, act: 0, created: Date.now() };
  const first = SKILL_ORDER[cls][0]; c.skills[first] = 1; c.spts = 0; c.keys.Q = first; c.rmb = first;
  const w = { warrior: 'short_sword', ranger: 'short_bow', sorc: 'wand' }[cls];
  c.equip.weapon = makeItem(w, 'normal', 1); c.equip.body = makeItem('quilted', 'normal', 1);
  if (cls === 'warrior') c.equip.offhand = makeItem('buckler', 'normal', 1);
  return c;
}

// ------------------------------------------------------------------ renderer (the Breezy Isle look) and lights
const renderer = new THREE.WebGLRenderer({ canvas: $('cv'), antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(48, 1, 0.5, 400);
const hemi = new THREE.HemisphereLight('#fff2d8', '#4a3a2a', 0.5); scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff0d8', 0.5); sun.castShadow = true; sun.shadow.mapSize.set(isTouch ? 1024 : 2048, isTouch ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 120 }); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04; scene.add(sun, sun.target);
const heroLight = new THREE.PointLight('#ffe0b0', 30, 18, 1.4); scene.add(heroLight);
const torchLights = Array.from({ length: 6 }, () => { const l = new THREE.PointLight('#ff9a3a', 0, 10, 1.4); scene.add(l); return l; });
scene.fog = new THREE.Fog('#0e0a10', 18, 40);
const rt = new THREE.WebGLRenderTarget(16, 16, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt); composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.2, 0.45, 0.93)); composer.addPass(new OutputPass());
const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
composer.addPass(new ShaderPass({ uniforms: { tDiffuse: { value: null }, uVig: { value: 0.55 } }, vertexShader: VS,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uVig; varying vec2 vUv;
    void main(){ vec4 c = texture2D(tDiffuse, vUv); float l = dot(c.rgb, vec3(0.299, 0.587, 0.114)); c.rgb = (c.rgb - 0.5) * 1.08 + 0.5;
      c.rgb += vec3(0.035, 0.018, -0.025) * smoothstep(0.35, 1.0, l) + vec3(0.0, 0.0, 0.015) * (1.0 - smoothstep(0.0, 0.35, l));
      vec2 v = vUv - 0.5; c.rgb *= 1.0 - uVig * dot(v, v) * 1.6; gl_FragColor = c; }` }));
const pixel = new ShaderPass({ uniforms: { tDiffuse: { value: null }, uRes: { value: new THREE.Vector2(1280, 720) }, uPix: { value: 2.0 } }, vertexShader: VS,
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uPix; varying vec2 vUv;
    vec3 at(vec2 cell){ return texture2D(tDiffuse, (cell + 0.5) * uPix / uRes).rgb; }
    void main(){ vec2 cell = floor(vUv * uRes / uPix); vec3 c = at(cell); float l = dot(c, vec3(0.299, 0.587, 0.114));
      float e = max(abs(l - dot(at(cell + vec2(1.0, 0.0)), vec3(0.299, 0.587, 0.114))), abs(l - dot(at(cell + vec2(0.0, 1.0)), vec3(0.299, 0.587, 0.114))));
      vec2 m = mod(cell, 4.0); float b = m.x < 1.0 ? (m.y < 1.0 ? 0.0 : m.y < 2.0 ? 12.0 : m.y < 3.0 ? 3.0 : 15.0) : m.x < 2.0 ? (m.y < 1.0 ? 8.0 : m.y < 2.0 ? 4.0 : m.y < 3.0 ? 11.0 : 7.0) : m.x < 3.0 ? (m.y < 1.0 ? 2.0 : m.y < 2.0 ? 14.0 : m.y < 3.0 ? 1.0 : 13.0) : (m.y < 1.0 ? 10.0 : m.y < 2.0 ? 6.0 : m.y < 3.0 ? 9.0 : 5.0);
      c = floor(c * 32.0 + b / 16.0) / 32.0; c = mix(c, vec3(0.18, 0.12, 0.07), smoothstep(0.22, 0.42, e) * 0.45); gl_FragColor = vec4(c, 1.0); }` });
composer.addPass(pixel);
function resize() {
  const pr = Math.min(devicePixelRatio || 1, isTouch ? 1.25 : 1.75);
  renderer.setPixelRatio(pr); renderer.setSize(innerWidth, innerHeight, false); composer.setPixelRatio(pr); composer.setSize(innerWidth, innerHeight);
  pixel.uniforms.uRes.value.set(innerWidth * pr, innerHeight * pr); pixel.uniforms.uPix.value = Math.max(2, Math.round(1.6 * pr));
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

// ------------------------------------------------------------------ places: the camp and dungeon levels
const THEMES = {
  town: { floor: ['#7ab85a', '#86c066'], wall: '#6a5a4a', fog: '#c8d8e8', fogN: 40, fogF: 90, hemi: 1.3, sun: 2.2, sky: '#a8d0f0' },
  crypt: { floor: ['#5a5560', '#625c68'], wall: '#4a4250', fog: '#0e0a10', fogN: 16, fogF: 38, hemi: 0.42, sun: 0.35, sky: '#0e0a10' },
  temple: { floor: ['#8a7a5a', '#94845e'], wall: '#5a6a5a', fog: '#0a1210', fogN: 16, fogF: 38, hemi: 0.45, sun: 0.35, sky: '#0a1210' },
  abyss: { floor: ['#4a2a22', '#542e24'], wall: '#3a1a18', fog: '#1a0806', fogN: 16, fogF: 38, hemi: 0.45, sun: 0.4, sky: '#1a0806' },
};
const G = { area: null, act: 0, depth: 0, L: null, group: null, mobs: [], shots: [], fx: [], drops: [], props: [], torches: [], walls: null, explored: null, key: '', field: null, fieldT: 0, portal: null, townPortal: null, levels: new Map(), stairs: null, up: null, wp: null, theme: 'town', bossDead: false, exitPortal: null };
const ch = () => SV.chars[SV.cur];
let C = null, ST = null;          // the current character and their derived stats
const me = { x: 0, z: 0, yaw: 0, life: 1, mana: 1, mesh: null, moveTo: null, path: null, target: null, act: '', actT: 0, atkT: 0, cds: {}, buffs: {}, whirl: 0, leap: null, regenT: 0, dead: false, speed: 0, potHeal: 0, potMana: 0, inv: 0 };

function floorTexture(L, th) {
  const px = 8, N = L.N, c = document.createElement('canvas'); c.width = c.height = N * px;
  const x = c.getContext('2d'), T = THEMES[th];
  for (let ty = 0; ty < N; ty++) for (let tx = 0; tx < N; tx++) {
    const v = L.grid[ty * N + tx];
    x.fillStyle = v === WALL ? '#1a1418' : T.floor[(tx + ty) & 1]; x.fillRect(tx * px, ty * px, px, px);
    if (v !== WALL && th !== 'town') { x.fillStyle = 'rgba(0,0,0,.18)'; x.fillRect(tx * px, ty * px, px, 1); x.fillRect(tx * px, ty * px, 1, px); const h = (tx * 73856093 ^ ty * 19349663) >>> 0; if (h % 7 === 0) { x.fillStyle = 'rgba(0,0,0,.2)'; x.fillRect(tx * px + 2 + (h % 3), ty * px + 3, 3, 1); } }
    if (th === 'town') { const h = (tx * 73856093 ^ ty * 19349663) >>> 0; if (h % 5 === 0) { x.fillStyle = 'rgba(255,255,255,.08)'; x.fillRect(tx * px + (h % 6), ty * px + ((h >> 3) % 6), 2, 2); } }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; return t;
}
function clearArea() {
  if (G.group) scene.remove(G.group);
  for (const m of G.mobs) m.tag && m.tag.remove();
  for (const d of G.drops) d.tag && d.tag.remove();
  G.group = new THREE.Group(); scene.add(G.group); G.torches = [];
}
function buildScene(L, th) {
  clearArea();
  const g = G.group, N = L.N, T = THEMES[th]; G.theme = th;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(N * TS, N * TS), new THREE.MeshToonMaterial({ map: floorTexture(L, th), gradientMap: GRAD }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(N * TS / 2, 0, N * TS / 2); floor.receiveShadow = true; g.add(floor);
  // walls next to floor, and pillars
  const walls = [], pillars = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const v = L.grid[y * N + x];
    if (v === PILLAR) pillars.push([x, y]);
    else if (v === WALL) { let edge = false; for (let dy = -1; dy <= 1 && !edge; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < N && ny < N && L.grid[ny * N + nx] === FLOOR) { edge = true; break; } } if (edge) walls.push([x, y]); }
  }
  const H = th === 'town' ? 0.9 : 2.0;
  const wm = new THREE.InstancedMesh(new THREE.BoxGeometry(TS, H, TS), mat(T.wall), walls.length), m4 = new THREE.Matrix4(), col = new THREE.Color();
  walls.forEach(([x, y], i) => { m4.makeTranslation(toW(x), H / 2, toW(y)); wm.setMatrixAt(i, m4); wm.setColorAt(i, col.set(T.wall).offsetHSL(0, 0, ((x * 7 + y * 13) % 5) * 0.015)); });
  wm.castShadow = wm.receiveShadow = true; g.add(wm);
  const og = wm.geometry.clone(); og.scale(1.04, 1.02, 1.04); const ow = new THREE.InstancedMesh(og, OUTLINE, walls.length); ow.instanceMatrix = wm.instanceMatrix; g.add(ow);
  G.walls = { mesh: wm, list: walls, mats: walls.map((_, i) => { const mm = new THREE.Matrix4(); wm.getMatrixAt(i, mm); return mm; }), hidden: new Set() };
  if (pillars.length) {
    const pm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.55, 0.65, 2.6, 8), mat(T.wall), pillars.length);
    pillars.forEach(([x, y], i) => { m4.makeTranslation(toW(x), 1.3, toW(y)); pm.setMatrixAt(i, m4); }); pm.castShadow = true; g.add(pm);
  }
  for (const t of L.torches) { const m = makeProp('torch'); m.position.set(t.x - t.dx * 0.9, 1.4, t.z - t.dz * 0.9); g.add(m); G.torches.push({ x: m.position.x, z: m.position.z }); }
  scene.fog.color.set(T.fog); scene.fog.near = T.fogN; scene.fog.far = T.fogF; scene.background = new THREE.Color(T.sky);
  hemi.intensity = T.hemi; sun.intensity = T.sun; heroLight.intensity = th === 'town' ? 0 : 30;
  G.explored = new Uint8Array(N * N); G.miniBase = null;
}

// ------------------------------------------------------------------ entering places
function enterTown(fromPortal) {
  const L = genTown(); G.area = 'town'; G.L = L; G.key = 'town'; G.mobs = []; G.shots = []; G.fx = []; G.drops = G.townDrops || (G.townDrops = []); G.props = [];
  buildScene(L, 'town');
  const g = G.group, S = L.spots;
  for (const [k, look] of [['merchant', { skin: '#f2c9a0', shirt: '#c8503a', hair: '#6a3a1a' }], ['gambler', { skin: '#d8a070', shirt: '#5a3a8a', hair: '#1a1a1a' }], ['healer', { skin: '#f2c9a0', shirt: '#f4f0e8', hair: '#f2d26a' }]]) { const n = makeNPC(look); n.position.set(S[k].x, 0, S[k].z); g.add(n); S[k].mesh = n; }
  for (const k of ['merchant', 'gambler']) { const t = makeProp('tent'); t.position.set(S[k].x, 0, S[k].z - 4); g.add(t); }
  const st = makeProp('stash'); st.position.set(S.stash.x, 0, S.stash.z); g.add(st);
  const wp = makeProp('waypoint'); wp.position.set(S.waypoint.x, 0, S.waypoint.z); g.add(wp);
  const fire = makeProp('fire'); fire.position.set(S.start.x - 4, 0, S.start.z - 1); g.add(fire); G.torches.push({ x: fire.position.x, z: fire.position.z });
  const cave = makeProp('stairs'); cave.position.set(S.cave.x, 0.02, S.cave.z); g.add(cave);
  for (let i = 0; i < 26; i++) { const a = (i / 26) * Math.PI * 2, r = 25; const tr2 = new THREE.Group(); const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 2, 7), mat('#7a4a2a')); trunk.position.y = 1; const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6, 1), mat('#4a9a3a')); crown.position.y = 3; tr2.add(trunk, crown); tr2.position.set(30 + Math.cos(a) * r, 0, 30 + Math.sin(a) * r); g.add(tr2); }
  const p = fromPortal && G.townPortal ? S.portal : S.start;
  me.x = p.x + (fromPortal ? 1.5 : 0); me.z = p.z + 1.5; me.moveTo = null; me.path = null; me.target = null;
  if (G.townPortal) { const pm = makeProp('portal'); pm.position.set(S.portal.x, 0, S.portal.z); g.add(pm); G.portal = { x: S.portal.x, z: S.portal.z, mesh: pm }; } else G.portal = null;
  me.life = ST.life; me.mana = ST.mana; G.stairs = null; G.up = null; G.wp = { x: S.waypoint.x, z: S.waypoint.z }; G.exitPortal = null;
  refreshShop(); areaTitle(tr().town); sfx.play('portal');
  for (const d of G.drops) addDropMesh(d);
}
function levelKey(diff, act, depth) { return `${diff}-${act}-${depth}`; }
function enterLevel(act, depth, how = 'down') {
  const c = ch(), key = levelKey(c.diff, act, depth);
  let st = G.levels.get(key);
  const boss = depth === 3;
  if (!st) {
    const seed = (Date.now() ^ (act * 7919 + depth * 104729)) >>> 0, L = genLevel(seed, boss);
    st = { key, L, act, depth, mobs: null, drops: [], opened: new Set(), bossDead: false };
    G.levels.set(key, st);
  }
  G.area = 'dun'; G.act = act; G.depth = depth; G.L = st.L; G.key = key; G.cur = st; G.shots = []; G.fx = [];
  buildScene(st.L, ACTS[act].theme);
  if (!st.mobs) st.mobs = spawnMobs(st.L, act, depth, c.diff);
  G.mobs = st.mobs; G.drops = st.drops;
  for (const m of G.mobs) if (m.alive) addMobMesh(m);
  for (const d of G.drops) addDropMesh(d);
  G.props = st.L.props.map((p, i) => { const m = makeProp(p.kind); m.position.set(p.x, 0, p.z); G.group.add(m); return { ...p, i, mesh: m, done: st.opened.has(i) }; });
  for (const p of G.props) if (p.done) { if (p.kind === 'chest') p.mesh.traverse((o) => { if (o.userData.lid) o.rotation.x = -1.2; }); else p.mesh.visible = false; }
  const L = st.L;
  if (!boss) { const s = makeProp('stairs'); s.position.set(L.end.x, 0.02, L.end.z); G.group.add(s); G.stairs = { x: L.end.x, z: L.end.z }; } else G.stairs = null;
  const u = makeProp('up'); u.position.set(L.start.x, 0, L.start.z + 2.5); G.group.add(u); G.up = { x: L.start.x, z: L.start.z + 2.6 };
  if (depth === 0 || depth === 2) { const w = makeProp('waypoint'); w.position.set(L.start.x + 3, 0, L.start.z - 1); G.group.add(w); G.wp = { x: L.start.x + 3, z: L.start.z - 1 }; c.wps[key] = 1; } else G.wp = null;
  G.exitPortal = null;
  if (st.bossDead) openExit(st);
  const at = how === 'up' && G.stairs ? { x: L.end.x + 2, z: L.end.z } : how === 'portal' && G.townPortal && G.townPortal.key === key ? G.townPortal : how === 'wp' && G.wp ? { x: G.wp.x, z: G.wp.z + 2 } : { x: L.start.x, z: L.start.z };
  me.x = at.x; me.z = at.z; me.moveTo = null; me.path = null; me.target = null;
  if (how === 'portal' && G.townPortal) { const pm = makeProp('portal'); pm.position.set(G.townPortal.x, 0, G.townPortal.z); G.group.add(pm); G.portal = { x: G.townPortal.x, z: G.townPortal.z, mesh: pm }; } else G.portal = null;
  c.act = Math.max(c.act || 0, act);
  areaTitle(`${DIFFS[c.diff].n[SV.lang === 'zh' ? 0 : 1]} · ${tx(ACTS[act].levels[depth])}`); sfx.play('door'); changed();
}

// ------------------------------------------------------------------ monsters
let mobUid = 1;
function newMob(id, x, z, mlvl, diff, extra = {}) {
  const M = MOBS[id], s = mobStats(id, mlvl, diff);
  return { uid: mobUid++, id, x, z, hp: s.hp, max: s.hp, dmg: s.dmg, def: s.def, xp: s.xp, mlvl, speed: M.speed, ai: M.ai, el: M.el || null, alive: true, mods: [], cd: 1 + rnd(), aggro: false, slow: 0, stun: 0, yaw: rnd() * 6, act: '', actT: 0, ...extra };
}
function applyMods(m, mods) {
  m.mods = mods;
  for (const k of mods) { if (k === 'fast') m.speed *= 1.5; if (k === 'strong') m.dmg = Math.round(m.dmg * 1.6); if (k === 'stone') m.def *= 2; if (k === 'fire' || k === 'cold' || k === 'light') m.el = k; }
}
function spawnMobs(L, act, depth, diff) {
  const A = ACTS[act], ml = mlvlOf(act, depth, diff), out = [], r = rng((Date.now() & 0xffff) + depth * 31);
  const pickMods = (n) => { const ks = Object.keys(MODS), o = []; while (o.length < n) { const k = ks[Math.floor(r() * ks.length)]; if (!o.includes(k)) o.push(k); } return o; };
  if (L.boss) {
    const B = newMob(A.boss, L.bossAt.x, L.bossAt.z, ml + 2, diff, { boss: true, name: MOBS[A.boss].n });
    out.push(B);
    for (let i = 0; i < 6; i++) out.push(newMob(A.mobs[i % A.mobs.length], L.bossAt.x + (r() - 0.5) * 14, L.bossAt.z + 4 + r() * 6, ml, diff));
    return out;
  }
  let champs = r() < 0.6 ? 1 : 0, uniq = 1;
  L.packs.forEach((p, i) => {
    const id = A.mobs[Math.floor(r() * A.mobs.length)];
    if (uniq && (p.guard || i === Math.floor(L.packs.length / 2))) {
      uniq = 0;
      const u = newMob(id, p.x, p.z, ml + 2, diff, { unique: true, name: [UNAME[Math.floor(r() * UNAME.length)], UNAME2[Math.floor(r() * UNAME2.length)]] });
      u.hp = u.max = u.hp * 4; u.xp *= 5; u.dmg = Math.round(u.dmg * 1.3); applyMods(u, pickMods(2 + (diff ? 1 : 0))); out.push(u);
      for (let k = 0; k < 3 + Math.floor(r() * 3); k++) out.push(newMob(id, p.x + (r() - 0.5) * 3, p.z + (r() - 0.5) * 3, ml, diff, { minion: true, hp: Math.round(u.max / 6), max: Math.round(u.max / 6) }));
      return;
    }
    if (champs && r() < 0.3) {
      champs--; const mods = pickMods(1);
      for (let k = 0; k < 3 + Math.floor(r() * 2); k++) { const c = newMob(id, p.x + (r() - 0.5) * 3, p.z + (r() - 0.5) * 3, ml + 1, diff, { champ: true }); c.hp = c.max = Math.round(c.hp * 2.5); c.xp *= 3; applyMods(c, mods); out.push(c); }
      return;
    }
    const n = 2 + Math.floor(r() * 3);
    for (let k = 0; k < n; k++) out.push(newMob(id, p.x + (r() - 0.5) * 3.5, p.z + (r() - 0.5) * 3.5, ml, diff));
  });
  return out;
}
function addMobMesh(m) {
  m.mesh = makeMob(m.id); m.mesh.position.set(m.x, 0, m.z); m.mesh.rotation.y = m.yaw;
  if (m.champ || m.unique) m.mesh.scale.multiplyScalar(1.15);
  if (m.mods.includes('fire') || m.mods.includes('cold') || m.mods.includes('light')) { const aura = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.95, 20), new THREE.MeshBasicMaterial({ color: { fire: '#ff6a2a', cold: '#7ac8ff', light: '#ffe25a' }[m.el], transparent: true, opacity: 0.6, side: THREE.DoubleSide })); aura.rotation.x = -Math.PI / 2; aura.position.y = 0.05; m.mesh.add(aura); }
  G.group.add(m.mesh);
}
const mobName = (m) => (m.boss ? tx(m.name) : m.unique ? `${tx(m.name[0])}${SV.lang === 'zh' ? '' : ' '}${tx(m.name[1])}` : tx(MOBS[m.id].n));
function damageMob(m, amt, el = 'phys', opts = {}) {
  if (!m.alive) return 0;
  let d = amt;
  if (el === 'phys' && m.mods.includes('stone')) d *= 0.6;
  if (el !== 'phys' && m.el === el) d *= 0.5;
  d = Math.max(1, Math.round(d));
  m.hp -= d; m.aggro = true; m.hitT = 0.15;
  if (opts.slow) m.slow = Math.max(m.slow, opts.slow);
  if (opts.stun) m.stun = Math.max(m.stun, opts.stun);
  if (opts.knock) { const a = Math.atan2(m.x - me.x, m.z - me.z); [m.x, m.z] = collide(G.L, m.x + Math.sin(a) * opts.knock, m.z + Math.cos(a) * opts.knock, 0.5); }
  if (ST.ls && opts.melee) me.life = Math.min(ST.life, me.life + d * ST.ls / 100);
  floatText(m.x, m.z, String(d), opts.crit ? '#ffcf3a' : el === 'fire' ? '#ff8a4a' : el === 'cold' ? '#8ad0ff' : el === 'light' ? '#ffe87a' : '#ffffff', opts.crit ? 1.25 : 1);
  if (m.hp <= 0) killMob(m);
  return d;
}
function killMob(m) {
  m.alive = false; m.dieT = 1; sfx.play('die');
  const c = ch(), lvDiff = c.lvl - m.mlvl, k = clamp(1 - Math.max(0, lvDiff - 3) * 0.12, 0.1, 1.15);
  gainXp(Math.round(m.xp * k));
  // loot
  const il = m.mlvl, mf = ST.mf, n = m.boss ? 4 : m.unique ? 2 : m.champ ? 1 : 0, r = Math.random;
  for (let i = 0; i < n; i++) dropItem(m.x, m.z, rollItem(il, mf, r, { boss: m.boss, champ: !m.boss, minRar: m.boss && i === 0 ? 'rare' : m.unique && i === 0 ? 'magic' : null }));
  if (!m.boss && !m.unique && !m.champ && r() < 0.11) dropItem(m.x, m.z, rollItem(il, mf, r));
  if (r() < (m.boss ? 1 : 0.32)) dropGold(m.x, m.z, Math.round((5 + il * 3) * (0.6 + r()) * (m.boss ? 12 : m.unique ? 4 : m.champ ? 2 : 1)));
  if (r() < (m.boss ? 1 : 0.13)) dropPotion(m.x, m.z, potionFor(c.lvl));
  if (m.boss) { G.cur.bossDead = true; bossDefeated(m); }
}

// ------------------------------------------------------------------ loot on the ground
function dropAt(x, z) { for (let k = 0; k < 8; k++) { const a = rnd() * 6.28, r = 0.6 + rnd() * 1.4, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r; if (walkAt(G.L, px, pz)) return [px, pz]; } return [x, z]; }
function dropItem(x, z, it) { const [px, pz] = dropAt(x, z); const d = { kind: 'item', it, x: px, z: pz }; G.drops.push(d); addDropMesh(d); sfx.play('drop'); }
function dropGold(x, z, n) { const [px, pz] = dropAt(x, z); const d = { kind: 'gold', n, x: px, z: pz }; G.drops.push(d); addDropMesh(d); }
function dropPotion(x, z, id) { const [px, pz] = dropAt(x, z); const d = { kind: 'pot', id, x: px, z: pz }; G.drops.push(d); addDropMesh(d); }
function addDropMesh(d) {
  const g = new THREE.Group();
  if (d.kind === 'gold') { for (let i = 0; i < 4; i++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.05, 10), glow('#ffd23a', 0.6)); c.position.set((i % 2) * 0.15 - 0.07, 0.05 + i * 0.05, Math.floor(i / 2) * 0.15 - 0.07); g.add(c); } }
  else if (d.kind === 'pot') { const p = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), glow(POTIONS[d.id].c, 0.8)); p.position.y = 0.25; g.add(p); }
  else { const c = RARITY[d.it.rar].c; const b = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), glow(c, d.it.rar === 'normal' ? 0.2 : 1.2)); b.position.y = 0.35; b.userData.spin = true; g.add(b); }
  g.position.set(d.x, 0, d.z); G.group.add(g); d.mesh = g;
  const tag = document.createElement('button'); tag.className = 'droptag ' + (d.kind === 'item' ? d.it.rar : d.kind);
  tag.textContent = d.kind === 'gold' ? `${d.n} ${tr().gold}` : d.kind === 'pot' ? tx(POTIONS[d.id].n) : tx(d.it.name);
  tag.onpointerdown = (e) => { e.stopPropagation(); e.preventDefault(); me.target = null; me.pickup = d; walkTo(d.x, d.z); };
  $('labels').appendChild(tag); d.tag = tag;
}
function removeDrop(d) { G.drops.splice(G.drops.indexOf(d), 1); if (d.mesh) G.group.remove(d.mesh); if (d.tag) d.tag.remove(); }
function pickUp(d) {
  const c = ch(), t = tr();
  if (d.kind === 'gold') { c.gold += d.n; sfx.play('gold'); }
  else if (d.kind === 'pot') { c.pots[d.id] = (c.pots[d.id] || 0) + 1; sfx.play('pick'); }
  else { if (c.inv.length >= 40) { msg(t.full); return; } c.inv.push(d.it); sfx.play('item'); if (d.it.rar === 'unique' || d.it.rar === 'rare') toast(`${tx(d.it.name)}`, RARITY[d.it.rar].c); }
  removeDrop(d); changed(); drawHud(true); if (winOpen()) renderWin();
}

// ------------------------------------------------------------------ the hero
function refreshStats() {
  const c = ch(); ST = derive({ ...c, equip: Object.fromEntries(Object.entries(c.equip).map(([k, it]) => [k, it && it.req > c.lvl ? { ...it, lvlTooLow: true } : it])) });
  me.life = Math.min(me.life, ST.life); me.mana = Math.min(me.mana, ST.mana);
}
function buildHero() {
  const c = ch();
  if (me.mesh) scene.remove(me.mesh);
  me.mesh = makeHero(c.cls, c.equip); scene.add(me.mesh);
  if (!me.tag) { me.tag = document.createElement('div'); me.tag.className = 'nametag'; $('labels').appendChild(me.tag); }
  me.tag.textContent = c.name;
}
function gainXp(n) {
  const c = ch(); if (c.lvl >= MAX_LEVEL) return;
  c.xp += n;
  while (c.lvl < MAX_LEVEL && c.xp >= xpFor(c.lvl)) { c.xp -= xpFor(c.lvl); c.lvl++; c.pts += 5; c.spts += 1; refreshStats(); me.life = ST.life; me.mana = ST.mana; banner(tr().levelUp(c.lvl)); sfx.play('levelup'); ring(me.x, me.z, '#ffe25a', 3); }
  changed();
}
function hurtMe(dmg, el, from) {
  if (me.dead || me.inv > 0) return;
  if (ST.dodge && rnd() * 100 < ST.dodge) { floatText(me.x, me.z, 'Dodge', '#9affc8'); return; }
  if (ST.block && !el && rnd() * 100 < ST.block * 0.8) { floatText(me.x, me.z, 'Block', '#c8d8ff'); sfx.play('thud'); return; }
  let d = takeDamage(ST, dmg, el && el !== 'phys' ? el : null);
  if (me.buffs.shield > 0) { const k = SKILLS.shield.absorb(ST.sl('shield') || 1) / 100, a = Math.min(me.mana, d * k); me.mana -= a; d -= a; }
  me.life -= d; me.hitT = 0.2; sfx.play('hit'); flash();
  if (me.life <= 0) die();
}
function die() {
  me.dead = true; me.life = 0; const c = ch(); const lost = Math.floor(c.gold * 0.1); c.gold -= lost; changed();
  msg(tr().died + ` (−${lost})`, 4000); sfx.play('over');
  setTimeout(() => { me.dead = false; refreshStats(); me.life = ST.life; me.mana = ST.mana; G.townPortal = null; enterTown(false); }, 2600);
}

// ------------------------------------------------------------------ input
const keys = new Set(), mouse = { x: 0, y: 0, down: false, rdown: false, gx: 0, gz: 0 };
let started = false;
addEventListener('keydown', (e) => {
  if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
  keys.add(e.code); if (!started) return;
  if (e.code === 'Escape') { closeWin(); return; }
  if (e.code === 'KeyI') toggleWin('inv'); if (e.code === 'KeyC') toggleWin('char'); if (e.code === 'KeyK') toggleWin('skills');
  if (e.code === 'Tab') { e.preventDefault(); bigMap = !bigMap; }
  if (winOpen() && !['KeyQ', 'KeyE', 'KeyR', 'KeyF', 'Digit1', 'Digit2', 'Digit3'].includes(e.code)) return;
  if (['KeyQ', 'KeyE', 'KeyR', 'KeyF'].includes(e.code)) { const id = ch().keys[e.code.slice(3)]; if (id) { ch().rmb = id; castAtCursor(id); drawHud(true); } }
  if (e.code === 'Digit1') drink('hp'); if (e.code === 'Digit2') drink('mp'); if (e.code === 'Digit3') drink('rejuv');
  if (e.code === 'KeyT') townPortal();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => { keys.clear(); mouse.down = mouse.rdown = false; });
let camYaw = 0, camZoom = 1, bigMap = false;
addEventListener('wheel', (e) => { if (started && !winOpen()) camZoom = clamp(camZoom * (e.deltaY > 0 ? 1.08 : 0.93), 0.65, 1.6); }, { passive: true });
const cv = $('cv');
cv.addEventListener('contextmenu', (e) => e.preventDefault());
cv.addEventListener('pointermove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
cv.addEventListener('pointerdown', (e) => {
  sfx.unlock(); mouse.x = e.clientX; mouse.y = e.clientY;
  if (!started || winOpen()) { if (winOpen() && !isTouch) closeWin(); return; }
  if (isTouch) { touchDown(e); return; }
  if (e.button === 2) { mouse.rdown = true; if (ch().rmb) castAtCursor(ch().rmb); return; }
  mouse.down = true; leftClick();
});
addEventListener('pointerup', (e) => { if (e.button === 2) mouse.rdown = false; else mouse.down = false; touchUp(e); });
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hitP = new THREE.Vector3();
function groundAt(sx, sy) { ndc.set(sx / innerWidth * 2 - 1, -(sy / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera); return ray.ray.intersectPlane(ground, hitP) ? [hitP.x, hitP.z] : [me.x, me.z]; }
const _v = new THREE.Vector3();
function mobAtScreen(sx, sy) {
  let best = null, bd = 1e9;
  for (const m of G.mobs) { if (!m.alive || !m.mesh) continue; _v.set(m.x, 1 * MOBS[m.id].size, m.z).project(camera); const px = (_v.x + 1) / 2 * innerWidth, py = (1 - _v.y) / 2 * innerHeight, d = Math.hypot(px - sx, py - sy); if (d < 46 * MOBS[m.id].size + 10 && d < bd) { bd = d; best = m; } }
  return best;
}
function leftClick() {
  const m = mobAtScreen(mouse.x, mouse.y);
  if (m) { me.target = m; me.pickup = null; return; }
  const [gx, gz] = groundAt(mouse.x, mouse.y); me.target = null; me.pickup = null; walkTo(gx, gz); clickMarker(gx, gz);
}
function walkTo(x, z) { me.moveTo = { x, z }; me.path = field(G.L, toT(x), toT(z)); }
// touch: a stick on the left; buttons do the rest
const stick = { id: null, ox: 0, oy: 0, mx: 0, mz: 0 };
function touchDown(e) {
  if (e.clientX < innerWidth * 0.45 && stick.id === null) { stick.id = e.pointerId; stick.ox = e.clientX; stick.oy = e.clientY; const s = $('stick'); s.style.left = (e.clientX - 60) + 'px'; s.style.top = (e.clientY - 60) + 'px'; s.classList.add('on'); return; }
  const m = mobAtScreen(e.clientX, e.clientY); if (m) { me.target = m; return; }
  const [gx, gz] = groundAt(e.clientX, e.clientY); walkTo(gx, gz);
}
addEventListener('pointermove', (e) => { if (e.pointerId !== stick.id) return; let dx = e.clientX - stick.ox, dy = e.clientY - stick.oy; const d = Math.hypot(dx, dy); if (d > 55) { dx *= 55 / d; dy *= 55 / d; } stick.mx = dx / 55; stick.mz = dy / 55; $('knob').style.transform = `translate(${dx}px, ${dy}px)`; });
function touchUp(e) { if (e.pointerId === stick.id) { stick.id = null; stick.mx = stick.mz = 0; $('stick').classList.remove('on'); $('knob').style.transform = ''; } }
const nearestMob = (r = 14) => { let b = null, bd = r; for (const m of G.mobs) { if (!m.alive) continue; const d = Math.hypot(m.x - me.x, m.z - me.z); if (d < bd && sees(G.L, me.x, me.z, m.x, m.z)) { bd = d; b = m; } } return b; };
function touchSkill(k) { const id = k === 'atk' ? null : ch().keys[k]; const m = nearestMob(); if (!id) { if (m) me.target = m; return; } ch().rmb = id; const [x, z] = m ? [m.x, m.z] : [me.x + Math.sin(me.yaw) * 6, me.z + Math.cos(me.yaw) * 6]; cast(id, x, z, m); }
for (const k of ['atk', 'Q', 'E', 'R', 'F']) $('t' + k).addEventListener('pointerdown', (e) => { e.preventDefault(); sfx.unlock(); touchSkill(k); });
$('tH').addEventListener('pointerdown', (e) => { e.preventDefault(); drink('hp'); }); $('tM').addEventListener('pointerdown', (e) => { e.preventDefault(); drink('mp'); });
$('tTP').addEventListener('pointerdown', (e) => { e.preventDefault(); townPortal(); });

// ------------------------------------------------------------------ skills
function castAtCursor(id) { const m = mobAtScreen(mouse.x, mouse.y); const [x, z] = m ? [m.x, m.z] : groundAt(mouse.x, mouse.y); cast(id, x, z, m); }
function cast(id, x, z, target) {
  if (me.dead || !started) return;
  const S = SKILLS[id], lv = ST.sl(id), t = tr();
  if (!lv || S.kind === 'passive') return;
  if (G.area === 'town' && S.kind !== 'buff') return;
  if ((me.cds[id] || 0) > 0) { msg(t.cooldown, 700); return; }
  if (me.atkT > 0 || me.leap || me.whirl > 0) return;
  if (S.kind === 'bow' && !ST.bow) { msg(t.needBow); return; }
  if (S.kind === 'melee' && ST.bow) { msg(t.needMelee); return; }
  const cost = S.mana(lv); if (me.mana < cost) { msg(t.noMana, 700); sfx.play('fail'); return; }
  me.yaw = Math.atan2(x - me.x, z - me.z);
  const dist = Math.hypot(x - me.x, z - me.z);
  if (id === 'bash') { if (!target || dist > reach(target) + 0.6) { me.target = target || null; me.queued = id; return; } }
  me.mana -= cost; if (S.cd) me.cds[id] = S.cd;
  me.moveTo = null; me.path = null;
  const atkTime = 1 / ST.aps, spellTime = 0.45;
  if (id === 'bash') { me.target = target; meleeSwing(target, S.pct(lv), { knock: 1.2 }); return; }
  if (id === 'leap') { const d = Math.min(dist, 9), lx = me.x + Math.sin(me.yaw) * d, lz = me.z + Math.cos(me.yaw) * d; if (!walkAt(G.L, lx, lz)) { me.mana += cost; me.cds[id] = 0; msg(t.cantThere); return; } me.leap = { x0: me.x, z0: me.z, x1: lx, z1: lz, t: 0, pct: S.pct(lv) }; sfx.play('swing'); return; }
  if (id === 'warcry') { setAct('cast', spellTime); sfx.play('boom'); ring(me.x, me.z, '#ffcf6a', S.r); const dmg = S.flat(lv) * (1 + ST.str / 200); for (const m of G.mobs) if (m.alive && Math.hypot(m.x - me.x, m.z - me.z) < S.r) damageMob(m, dmg, 'phys', { stun: 1.5 }); return; }
  if (id === 'whirl') { me.whirl = 2; me.whirlTo = { x, z }; me.whirlHit = 0; sfx.play('swing'); return; }
  if (S.kind === 'bow') {
    setAct('attack', atkTime); sfx.play('bow');
    // pct: the skill's bonus over a plain arrow (70% damage is −30)
    const shoot = (yaw, pct, extra) => shot({ x: me.x, z: me.z, yaw, speed: 22, from: 'p', kind: 'arrow', dmg: attackDamage(ST, pct), ...extra });
    if (id === 'power') shoot(me.yaw, S.pct(lv), { pierce: lv >= 10 ? 2 : 0 });
    else if (id === 'multi') { const n = S.count(lv); for (let i = 0; i < n; i++) shoot(me.yaw + (i - (n - 1) / 2) * (1.05 / Math.max(1, n - 1)), -30, {}); }
    else if (id === 'frost') shoot(me.yaw, 0, { cold: S.cold(lv), slow: 2, color: '#8ad0ff' });
    else if (id === 'explode') shoot(me.yaw, -40, { boom: { r: S.r, fire: S.fire(lv) }, color: '#ff8a3a' });
    else if (id === 'rain') { me.atkT = atkTime; G.fx.push({ kind: 'rain', x, z, r: S.r, t: 3, tick: 0, pct: S.pct(lv), mesh: areaMarker(x, z, S.r, '#c8d8ff') }); }
    return;
  }
  setAct('cast', spellTime);
  if (id === 'fireball') { sfx.play('fire'); shot({ x: me.x, z: me.z, yaw: me.yaw, speed: 15, from: 'p', kind: 'fireball', boom: { r: S.r, fire: S.fire(lv) * ST.spell }, color: '#ff7a2a' }); }
  else if (id === 'nova') { sfx.play('frost'); ring(me.x, me.z, '#9ad8ff', S.r); for (const m of G.mobs) if (m.alive && Math.hypot(m.x - me.x, m.z - me.z) < S.r) damageMob(m, S.cold(lv) * ST.spell, 'cold', { slow: 2.5 }); }
  else if (id === 'chain') {
    sfx.play('zap'); let from = { x: me.x, z: me.z }, cur = target && target.alive ? target : nearestTo(x, z, 9, new Set()); const hit = new Set();
    for (let j = 0; j <= S.jumps(lv) && cur; j++) { lightning(from, cur); damageMob(cur, (1 + rnd() * S.light(lv)) * ST.spell, 'light'); hit.add(cur); from = cur; cur = nearestTo(cur.x, cur.z, 7, hit); }
  }
  else if (id === 'teleport') { const d = Math.min(dist, 16); let tx2 = me.x + Math.sin(me.yaw) * d, tz2 = me.z + Math.cos(me.yaw) * d; if (!walkAt(G.L, tx2, tz2) || !reachable(tx2, tz2)) { me.mana += cost; msg(t.cantThere); return; } ring(me.x, me.z, '#c8a0ff', 1.5); me.x = tx2; me.z = tz2; ring(me.x, me.z, '#c8a0ff', 1.5); sfx.play('portal'); }
  else if (id === 'meteor') { sfx.play('fire'); G.fx.push({ kind: 'meteor', x, z, r: S.r, t: 1, fire: S.fire(lv) * ST.spell, mesh: areaMarker(x, z, S.r, '#ff6a2a') }); }
  else if (id === 'shield') { me.buffs.shield = 120; sfx.play('frost'); ring(me.x, me.z, '#9ab8ff', 2); }
}
const reach = (m) => 1.2 + MOBS[m.id].size * 0.6;
function reachable(x, z) { const f = field(G.L, toT(me.x), toT(me.z)); return f[toT(z) * G.L.N + toT(x)] >= 0; }
function nearestTo(x, z, r, skip) { let b = null, bd = r; for (const m of G.mobs) { if (!m.alive || skip.has(m)) continue; const d = Math.hypot(m.x - x, m.z - z); if (d < bd) { bd = d; b = m; } } return b; }
function setAct(a, t) { me.act = a; me.actT = 0; me.atkT = t; }
function meleeSwing(m, pct = 0, opts = {}) {
  setAct('attack', 1 / ST.aps); sfx.play('swing');
  me.pending = { m, pct, opts, t: 0.4 / ST.aps };
}
function basicAttack(m) {
  me.yaw = Math.atan2(m.x - me.x, m.z - me.z);
  if (ST.bow) { setAct('attack', 1 / ST.aps); sfx.play('bow'); shot({ x: me.x, z: me.z, yaw: me.yaw, speed: 22, from: 'p', kind: 'arrow', dmg: attackDamage(ST, 0) }); return; }
  if (ch().cls === 'sorc' && ST.weapon && BASES[ST.weapon.base].type === 'wand') { setAct('cast', 1 / ST.aps); shot({ x: me.x, z: me.z, yaw: me.yaw, speed: 16, from: 'p', kind: 'bolt', dmg: attackDamage(ST, 0), color: '#c87aff' }); return; }
  meleeSwing(m, 0);
}
// projectiles
function shot(o) {
  const color = o.color || (o.kind === 'arrow' ? '#e8d8b0' : o.kind === 'fireball' || o.kind === 'firebolt' ? '#ff7a2a' : o.kind === 'bolt' ? '#ffe25a' : '#c8c8c8');
  const mesh = o.kind === 'arrow' ? new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 4), glow(color, 0.6)) : new THREE.Mesh(new THREE.SphereGeometry(o.kind === 'fireball' ? 0.32 : 0.2, 10, 8), glow(color, 2.5));
  if (o.kind === 'arrow') mesh.rotation.set(Math.PI / 2, o.yaw, 0, 'YXZ');
  mesh.position.set(o.x, 1.1, o.z); G.group.add(mesh);
  G.shots.push({ ...o, vx: Math.sin(o.yaw) * o.speed, vz: Math.cos(o.yaw) * o.speed, life: 1.4, mesh, hitSet: new Set() });
}
function explode(x, z, r, dmg, el) { ring(x, z, el === 'fire' ? '#ff8a3a' : '#ffe25a', r); sfx.play('boom'); for (const m of G.mobs) if (m.alive && Math.hypot(m.x - x, m.z - z) < r + 0.4) damageMob(m, dmg, el); }

// ------------------------------------------------------------------ effects
const fxMat = (c, o = 0.6) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, side: THREE.DoubleSide });
function ring(x, z, color, r) { const m = new THREE.Mesh(new THREE.RingGeometry(0.75, 1, 32), fxMat(color, 0.8)); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.12, z); G.group.add(m); G.fx.push({ kind: 'ring', mesh: m, t: 0.45, r }); }
function areaMarker(x, z, r, color) { const m = new THREE.Mesh(new THREE.CircleGeometry(r, 32), fxMat(color, 0.22)); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.08, z); G.group.add(m); return m; }
function lightning(a, b) { const pts = []; for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push(new THREE.Vector3(a.x + (b.x - a.x) * t + (i && i < 6 ? (rnd() - 0.5) * 0.8 : 0), 1.2 + (i && i < 6 ? (rnd() - 0.5) * 0.6 : 0), a.z + (b.z - a.z) * t + (i && i < 6 ? (rnd() - 0.5) * 0.8 : 0))); } const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#fff4a0' })); G.group.add(l); G.fx.push({ kind: 'flash', mesh: l, t: 0.18 }); }
function clickMarker(x, z) { const m = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.4, 16), fxMat('#ffe8a0', 0.9)); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.1, z); G.group.add(m); G.fx.push({ kind: 'flash', mesh: m, t: 0.35 }); }
function floatText(x, z, text, color, k = 1) { const el = document.createElement('div'); el.className = 'dmg'; el.textContent = text; el.style.color = color; el.style.fontSize = (16 * k) + 'px'; $('labels').appendChild(el); G.fx.push({ kind: 'text', el, x: x + (rnd() - 0.5) * 0.6, z, t: 0.9, y: 2 }); }

// ------------------------------------------------------------------ bosses, the exit portal, town portals, waypoints
function bossDefeated(m) {
  const c = ch(), t = tr();
  banner(t.bossDead(tx(m.name))); sfx.play('win');
  openExit(G.cur);
  if (G.act < 2) { c.wps[levelKey(c.diff, G.act + 1, 0)] = 1; toast(t.newAct(tx(ACTS[G.act + 1].n))); }
  else { if (c.maxDiff < 2 && c.maxDiff === c.diff) { c.maxDiff++; toast(t.unlocked(tx(DIFFS[c.maxDiff].n))); } setTimeout(() => banner(t.won), 2500); }
  changed();
}
function openExit(st) {
  const L = st.L, x = L.bossAt.x, z = L.bossAt.z + 3, pm = makeProp('portal'); pm.position.set(x, 0, z); G.group.add(pm);
  G.exitPortal = { x, z };
}
function townPortal() {
  const c = ch(), t = tr();
  if (G.area !== 'dun' || me.dead) return;
  if (c.tp <= 0) { msg(t.noTp); return; }
  c.tp--; G.townPortal = { key: G.key, act: G.act, depth: G.depth, x: me.x, z: me.z }; changed();
  sfx.play('portal'); enterTown(true);
}

// ------------------------------------------------------------------ the loop
let last = performance.now(), hudT = 0, titleN = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
  if (started) update(dt, now);
  if (started || (titleN++ % 6) === 0) composer.render();
}
function update(dt, now) {
  const c = ch(), L = G.L;
  for (const k of Object.keys(me.cds)) me.cds[k] = Math.max(0, me.cds[k] - dt);
  for (const k of Object.keys(me.buffs)) me.buffs[k] = Math.max(0, me.buffs[k] - dt);
  me.atkT = Math.max(0, me.atkT - dt); me.actT += dt; me.inv = Math.max(0, me.inv - dt); me.hitT = Math.max(0, (me.hitT || 0) - dt);
  if (!me.dead) {
    // regeneration and potions over time
    me.life = Math.min(ST.life, me.life + ST.regen * dt + (me.potHeal > 0 ? Math.min(me.potHeal, me.potHealRate * dt) : 0)); if (me.potHeal > 0) me.potHeal -= me.potHealRate * dt;
    me.mana = Math.min(ST.mana, me.mana + (ST.mana * 0.018 + ST.ene * 0.02) * dt + (me.potMana > 0 ? Math.min(me.potMana, me.potManaRate * dt) : 0)); if (me.potMana > 0) me.potMana -= me.potManaRate * dt;
    updateHero(dt);
  }
  if (G.area === 'dun') updateMobs(dt);
  updateShots(dt); updateFx(dt);
  // pick up gold and potions you walk over; open urns and chests you touch
  for (const d of [...G.drops]) { const dd = Math.hypot(d.x - me.x, d.z - me.z); if ((d.kind !== 'item' && dd < 0.9) || (me.pickup === d && dd < 1.2)) { if (me.pickup === d) me.pickup = null; pickUp(d); } if (d.mesh) d.mesh.children.forEach((o) => { if (o.userData.spin) o.rotation.y += dt * 2; }); }
  for (const p of G.props) if (!p.done && Math.hypot(p.x - me.x, p.z - me.z) < 1.4) openProp(p);
  // places to go
  if (G.area === 'dun') {
    if (G.stairs && Math.hypot(G.stairs.x - me.x, G.stairs.z - me.z) < 1.2) enterLevel(G.act, G.depth + 1, 'down');
    else if (G.up && Math.hypot(G.up.x - me.x, G.up.z - me.z) < 1.1) { if (G.depth === 0) enterTown(false); else enterLevel(G.act, G.depth - 1, 'up'); }
    else if (G.portal && Math.hypot(G.portal.x - me.x, G.portal.z - me.z) < 1.1 && me.moveTo) { G.townPortal = null; enterTown(false); }
    else if (G.exitPortal && Math.hypot(G.exitPortal.x - me.x, G.exitPortal.z - me.z) < 1.2) { if (G.act < 2) enterLevel(G.act + 1, 0, 'start'); else { G.townPortal = null; enterTown(false); } }
    else if (G.wp && Math.hypot(G.wp.x - me.x, G.wp.z - me.z) < 1.4 && me.moveTo && Math.hypot(me.moveTo.x - G.wp.x, me.moveTo.z - G.wp.z) < 1.6) { me.moveTo = null; openWin('wp'); }
  } else {
    const S = L.spots;
    const at = (k, r = 1.8) => Math.hypot(S[k].x - me.x, S[k].z - me.z) < r && me.moveTo && Math.hypot(me.moveTo.x - S[k].x, me.moveTo.z - S[k].z) < 2.4;
    if (at('merchant')) { me.moveTo = null; openWin('shop'); } else if (at('gambler')) { me.moveTo = null; openWin('gamble'); } else if (at('stash')) { me.moveTo = null; openWin('stash'); }
    else if (at('healer')) { me.moveTo = null; me.life = ST.life; me.mana = ST.mana; msg(tr().healed); sfx.play('drink'); }
    else if (at('waypoint', 1.6)) { me.moveTo = null; openWin('wp'); }
    else if (Math.hypot(S.cave.x - me.x, S.cave.z - me.z) < 1.2) enterLevel(c.act || 0, 0, 'start');
    else if (G.portal && Math.hypot(G.portal.x - me.x, G.portal.z - me.z) < 1.1 && G.townPortal) { const tp = G.townPortal; if (+tp.key.split('-')[0] !== c.diff) G.townPortal = null; else enterLevel(tp.act, tp.depth, 'portal'); }
  }
  // hero mesh
  me.mesh.position.set(me.x, me.leap ? Math.sin(Math.min(1, me.leap.t / 0.45) * Math.PI) * 2 : 0, me.z);
  me.mesh.rotation.y = me.whirl > 0 ? me.mesh.rotation.y + dt * 18 : me.yaw;
  animate(me.mesh, dt, me.speed, me.act && me.actT < 0.5 ? me.act : '', me.actT);
  me.mesh.visible = !me.dead;
  // camera
  if (keys.has('KeyZ')) camYaw += dt * 2; if (keys.has('KeyX')) camYaw -= dt * 2;
  const dist = 15 * camZoom, pitch = 0.98;
  camera.position.set(me.x + Math.sin(camYaw) * Math.cos(pitch) * dist, Math.sin(pitch) * dist + 1, me.z + Math.cos(camYaw) * Math.cos(pitch) * dist); camera.lookAt(me.x, 1, me.z);
  heroLight.position.set(me.x, 4.5, me.z);
  sun.position.set(me.x - 20, 40, me.z + 12); sun.target.position.set(me.x, 0, me.z);
  // the closest torches carry lights
  const near = G.torches.map((t) => [Math.hypot(t.x - me.x, t.z - me.z), t]).sort((a, b) => a[0] - b[0]).slice(0, torchLights.length);
  torchLights.forEach((l, i) => { const t = near[i]; if (t && t[0] < 30) { l.position.set(t[1].x, 2, t[1].z); l.intensity = 14 + Math.sin(now / 90 + i) * 3; } else l.intensity = 0; });
  clearView();
  explore();
  placeLabels();
  if (saveT > 0 && (saveT -= dt) <= 0) persist();
  if ((hudT -= dt) <= 0) { hudT = 0.1; drawHud(); drawMini(); }
}
function updateHero(dt) {
  const L = G.L;
  if (me.pending && (me.pending.t -= dt) <= 0) {
    const { m, pct, opts } = me.pending; me.pending = null;
    if (m && m.alive && Math.hypot(m.x - me.x, m.z - me.z) < reach(m) + 0.8) {
      if (rnd() < hitChance(ST, ch().lvl, m.def)) { const d = attackDamage(ST, pct); damageMob(m, d.phys, 'phys', { ...opts, crit: d.crit, melee: true }); if (d.fire) damageMob(m, d.fire, 'fire'); sfx.play('thud'); }
      else floatText(m.x, m.z, 'Miss', '#c8c8c8');
    }
  }
  if (me.leap) {
    me.leap.t += dt; const k = Math.min(1, me.leap.t / 0.45);
    me.x = me.leap.x0 + (me.leap.x1 - me.leap.x0) * k; me.z = me.leap.z0 + (me.leap.z1 - me.leap.z0) * k;
    if (k >= 1) { const p = me.leap.pct; me.leap = null; ring(me.x, me.z, '#ffcf6a', SKILLS.leap.r); sfx.play('boom'); for (const m of G.mobs) if (m.alive && Math.hypot(m.x - me.x, m.z - me.z) < SKILLS.leap.r) { const d = attackDamage(ST, p); damageMob(m, d.phys, 'phys', { crit: d.crit, melee: true, stun: 0.6 }); } }
    me.speed = 1; return;
  }
  if (me.whirl > 0) {
    me.whirl -= dt; me.whirlHit -= dt;
    const w = me.whirlTo, d = Math.hypot(w.x - me.x, w.z - me.z);
    if (d > 0.4) { const sp = 5.5 * dt; [me.x, me.z] = collide(L, me.x + (w.x - me.x) / d * Math.min(sp, d), me.z + (w.z - me.z) / d * Math.min(sp, d), 0.45); }
    if (me.whirlHit <= 0) { me.whirlHit = 0.3; const lv = ST.sl('whirl'); for (const m of G.mobs) if (m.alive && Math.hypot(m.x - me.x, m.z - me.z) < SKILLS.whirl.r) { const dd = attackDamage(ST, SKILLS.whirl.pct(lv)); damageMob(m, dd.phys, 'phys', { crit: dd.crit, melee: true }); } sfx.play('swing'); }
    me.speed = 1; return;
  }
  // holding the mouse keeps you walking / attacking toward the cursor
  if (!isTouch && mouse.down && !winOpen() && !me.target && !me.pickup) { const [gx, gz] = groundAt(mouse.x, mouse.y); if (Math.hypot(gx - me.x, gz - me.z) > 0.6) { me.moveTo = { x: gx, z: gz }; me.path = null; } }
  if (!isTouch && mouse.rdown && ch().rmb && me.atkT <= 0) castAtCursor(ch().rmb);
  // WASD or the stick: move relative to the camera
  let mx = stick.mx, mz = stick.mz;
  if (!winOpen()) { if (keys.has('KeyW') || keys.has('ArrowUp')) mz -= 1; if (keys.has('KeyS') || keys.has('ArrowDown')) mz += 1; if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1; if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1; }
  const sp = 5.4 * (1 + ST.fr / 100);
  me.speed = 0;
  if (Math.hypot(mx, mz) > 0.15 && me.atkT <= 0) {
    const cy = Math.cos(camYaw), sy = Math.sin(camYaw), wx = mx * cy + mz * sy, wz = -mx * sy + mz * cy, n = Math.hypot(wx, wz);
    [me.x, me.z] = collide(L, me.x + wx / n * sp * dt * Math.min(1, n), me.z + wz / n * sp * dt * Math.min(1, n), 0.45); me.yaw = Math.atan2(wx, wz); me.speed = 1; me.moveTo = null; me.target = null; return;
  }
  // a target: walk into reach, then attack
  if (me.target) {
    const m = me.target;
    if (!m.alive) { me.target = null; }
    else {
      const d = Math.hypot(m.x - me.x, m.z - me.z), range = ST.bow || (ch().cls === 'sorc' && ST.weapon && BASES[ST.weapon.base].type === 'wand') ? 14 : reach(m);
      if (d <= range && (range < 3 || sees(L, me.x, me.z, m.x, m.z))) { if (me.atkT <= 0) { if (me.queued) { const q = me.queued; me.queued = null; cast(q, m.x, m.z, m); } else basicAttack(m); } return; }
      me.moveTo = { x: m.x, z: m.z }; me.path = null;
    }
  }
  if (me.moveTo && me.atkT <= 0) {
    const t = me.moveTo, d = Math.hypot(t.x - me.x, t.z - me.z);
    if (d < 0.25) { me.moveTo = null; return; }
    let nx = t.x, nz = t.z;
    if (!sees(L, me.x, me.z, t.x, t.z)) { if (!me.path || me.pathT <= 0) { me.path = field(L, toT(t.x), toT(t.z)); me.pathT = 0.3; } me.pathT -= dt; const s = stepOn(L, me.path, me.x, me.z); if (s) [nx, nz] = s; else { me.moveTo = null; return; } }
    const dx = nx - me.x, dz = nz - me.z, dd = Math.hypot(dx, dz) || 1, step = Math.min(dd, sp * dt);
    const [cx, cz] = collide(L, me.x + dx / dd * step, me.z + dz / dd * step, 0.45);
    if (Math.hypot(cx - me.x, cz - me.z) < step * 0.15 && dd > 0.5) { me.stuck = (me.stuck || 0) + dt; if (me.stuck > 0.6) { me.moveTo = null; me.stuck = 0; } } else me.stuck = 0;
    me.x = cx; me.z = cz; me.yaw = Math.atan2(dx, dz); me.speed = 1;
  }
}
function updateMobs(dt) {
  const L = G.L;
  G.fieldT -= dt;
  if (G.fieldT <= 0) { G.fieldT = 0.3; G.field = field(L, toT(me.x), toT(me.z)); }
  for (const m of G.mobs) {
    if (!m.alive) { if (m.mesh && m.dieT > 0) { m.dieT -= dt; m.mesh.rotation.z = Math.min(1.5, (1 - m.dieT) * 3); m.mesh.position.y = -Math.max(0, 0.4 - m.dieT) * 2; if (m.dieT <= 0) { G.group.remove(m.mesh); m.mesh = null; } } continue; }
    if (!m.mesh) continue;
    m.cd -= dt; m.stun = Math.max(0, m.stun - dt); m.slow = Math.max(0, m.slow - dt); m.hitT = Math.max(0, (m.hitT || 0) - dt); m.actT += dt;
    const d = Math.hypot(me.x - m.x, me.z - m.z);
    if (!m.aggro && d < (m.boss ? 16 : 11) && sees(L, m.x, m.z, me.x, me.z)) { m.aggro = true; for (const o of G.mobs) if (o.alive && !o.aggro && Math.hypot(o.x - m.x, o.z - m.z) < 7) o.aggro = true; }
    let moving = 0;
    if (m.aggro && !m.stun && !me.dead && G.area === 'dun') {
      const sp = m.speed * (m.slow > 0 ? 0.5 : 1) * dt, R = 0.9 + MOBS[m.id].size * 0.6;
      const goTo = (tx2, tz2) => { let nx = tx2, nz = tz2; if (!sees(L, m.x, m.z, tx2, tz2) && G.field) { const s = stepOn(L, G.field, m.x, m.z); if (s) [nx, nz] = s; } const dx = nx - m.x, dz = nz - m.z, dd = Math.hypot(dx, dz) || 1; [m.x, m.z] = collide(L, m.x + dx / dd * Math.min(sp, dd), m.z + dz / dd * Math.min(sp, dd), 0.4 * MOBS[m.id].size); m.yaw = Math.atan2(dx, dz); moving = 1; };
      if (m.charging > 0) { m.charging -= dt; const vx = Math.sin(m.yaw) * m.speed * 3 * dt, vz = Math.cos(m.yaw) * m.speed * 3 * dt; [m.x, m.z] = collide(L, m.x + vx, m.z + vz, 0.4); moving = 1.5; if (d < R && !m.chargeHit) { m.chargeHit = true; mobHits(m, 1.4); } }
      else if (m.ai === 'boss') bossAI(m, d, dt, goTo);
      else if (m.ai === 'ranged' || m.ai === 'caster') {
        if (d > 9 || !sees(L, m.x, m.z, me.x, me.z)) goTo(me.x, me.z);
        else if (d < 4.5) { const a = Math.atan2(m.x - me.x, m.z - me.z); goTo(m.x + Math.sin(a) * 2, m.z + Math.cos(a) * 2); }
        if (m.cd <= 0 && d < 12 && sees(L, m.x, m.z, me.x, me.z)) { m.cd = 1.8 + rnd() * 0.6; m.yaw = Math.atan2(me.x - m.x, me.z - m.z); m.act = 'attack'; m.actT = 0; shot({ x: m.x, z: m.z, yaw: m.yaw, speed: MOBS[m.id].shot === 'arrow' ? 15 : 11, from: 'm', kind: MOBS[m.id].shot, dmgM: m.dmg, el: m.ai === 'caster' ? m.el : null, mlvl: m.mlvl }); }
      } else if (m.ai === 'charger' && d > 3.5 && d < 9 && m.cd <= 0 && sees(L, m.x, m.z, me.x, me.z)) { m.cd = 3.5; m.charging = 0.7; m.chargeHit = false; m.yaw = Math.atan2(me.x - m.x, me.z - m.z); }
      else if (d > R) goTo(me.x, me.z);
      else if (m.cd <= 0) { m.cd = 1.3 + rnd() * 0.5; m.act = 'attack'; m.actT = 0; m.yaw = Math.atan2(me.x - m.x, me.z - m.z); m.swing = 0.35; }
      if (m.swing > 0 && (m.swing -= dt) <= 0 && d < R + 0.6) mobHits(m, 1);
    }
    // keep monsters from stacking
    for (const o of G.mobs) { if (o === m || !o.alive) continue; const dx = m.x - o.x, dz = m.z - o.z, dd = Math.hypot(dx, dz), want = 0.5 * (MOBS[m.id].size + MOBS[o.id].size); if (dd < want && dd > 0.001) { const push = (want - dd) * 0.5; [m.x, m.z] = collide(L, m.x + dx / dd * push, m.z + dz / dd * push, 0.4); } }
    m.mesh.position.set(m.x, 0, m.z); m.mesh.rotation.y = m.yaw;
    animate(m.mesh, dt, moving * (m.slow > 0 ? 0.5 : 1), m.act && m.actT < 0.5 ? m.act : '', m.actT);
  }
}
function mobHits(m, k) {
  if (G.area !== 'dun') return;
  if (rnd() > mobHitChance(ST, m.mlvl)) { floatText(me.x, me.z, 'Miss', '#c8c8c8'); return; }
  hurtMe(m.dmg * k, m.el, m);
  if (m.mods.includes('vamp')) m.hp = Math.min(m.max, m.hp + m.dmg);
  if (m.mods.includes('cold')) me.chill = 1.5;
}
function bossAI(m, d, dt, goTo) {
  m.spec = (m.spec || 4) - dt;
  const R = 1 + MOBS[m.id].size * 0.7;
  if (m.spec <= 0) {
    m.spec = 5 + rnd() * 2; m.act = 'cast'; m.actT = 0;
    if (m.id === 'boneking') { ring(m.x, m.z, '#f0e8d0', 5); if (d < 5) mobHits(m, 1.3); for (let i = 0; i < 3; i++) { const s = newMob('skeleton', m.x + (rnd() - 0.5) * 4, m.z + (rnd() - 0.5) * 4, m.mlvl - 2, ch().diff, { aggro: true }); G.mobs.push(s); addMobMesh(s); } }
    else if (m.id === 'queen') { for (let i = -2; i <= 2; i++) shot({ x: m.x, z: m.z, yaw: Math.atan2(me.x - m.x, me.z - m.z) + i * 0.2, speed: 12, from: 'm', kind: 'bolt', dmgM: m.dmg * 0.8, el: 'poison', color: '#7aff5a', mlvl: m.mlvl }); }
    else { ring(m.x, m.z, '#ff6a2a', 6); if (d < 6) hurtMe(m.dmg * 1.4, 'fire', m); for (let i = 0; i < 3; i++) G.fx.push({ kind: 'meteor', x: me.x + (rnd() - 0.5) * 6, z: me.z + (rnd() - 0.5) * 6, r: 2.4, t: 1.2, foe: m.dmg * 1.3, mesh: areaMarker(me.x, me.z, 2.4, '#ff3a2a') }); }
    return;
  }
  if (d > R) goTo(me.x, me.z);
  else if (m.cd <= 0) { m.cd = 1.5; m.act = 'attack'; m.actT = 0; m.yaw = Math.atan2(me.x - m.x, me.z - m.z); m.swing = 0.45; }
  if (m.swing > 0 && (m.swing -= dt) <= 0 && d < R + 0.8) mobHits(m, 1.6);
}
function updateShots(dt) {
  const L = G.L;
  for (let i = G.shots.length - 1; i >= 0; i--) {
    const s = G.shots[i]; s.life -= dt;
    const nx = s.x + s.vx * dt, nz = s.z + s.vz * dt;
    let done = s.life <= 0 || !walkAt(L, nx, nz);
    s.x = nx; s.z = nz; s.mesh.position.set(s.x, 1.1, s.z);
    if (!done && s.from === 'p') {
      for (const m of G.mobs) {
        if (!m.alive || s.hitSet.has(m) || Math.hypot(m.x - s.x, m.z - s.z) > 0.55 + MOBS[m.id].size * 0.4) continue;
        s.hitSet.add(m);
        if (s.boom) { explode(s.x, s.z, s.boom.r, s.boom.fire, 'fire'); if (s.dmg) damageMob(m, s.dmg.phys, 'phys', { crit: s.dmg.crit }); done = true; break; }
        if (rnd() < hitChance(ST, ch().lvl, m.def)) { damageMob(m, s.dmg.phys, 'phys', { crit: s.dmg.crit, slow: s.slow }); if (s.dmg.fire) damageMob(m, s.dmg.fire, 'fire'); if (s.cold) damageMob(m, s.cold, 'cold', { slow: 2 }); } else floatText(m.x, m.z, 'Miss', '#c8c8c8');
        if (!s.pierce || s.pierce-- <= 0) { done = true; break; }
      }
    } else if (!done && s.from === 'm' && Math.hypot(me.x - s.x, me.z - s.z) < 0.7) { if (rnd() < mobHitChance(ST, s.mlvl) || s.el) hurtMe(s.dmgM, s.el, null); done = true; }
    if (done) { if (s.boom && s.life > 0 && s.from === 'p' && !s.hitSet.size) explode(s.x, s.z, s.boom.r, s.boom.fire, 'fire'); G.group.remove(s.mesh); G.shots.splice(i, 1); }
  }
}
function updateFx(dt) {
  for (let i = G.fx.length - 1; i >= 0; i--) {
    const f = G.fx[i]; f.t -= dt;
    if (f.kind === 'ring') { const k = 1 - f.t / 0.45; f.mesh.scale.setScalar(Math.max(0.05, k) * f.r); f.mesh.material.opacity = 0.8 * (1 - k); }
    else if (f.kind === 'text') { f.y += dt * 1.6; _v.set(f.x, f.y, f.z).project(camera); f.el.style.transform = `translate(${(_v.x + 1) / 2 * innerWidth}px, ${(1 - _v.y) / 2 * innerHeight}px) translate(-50%, -50%)`; f.el.style.opacity = Math.min(1, f.t * 2); }
    else if (f.kind === 'rain') { f.tick -= dt; if (f.tick <= 0) { f.tick = 0.37; for (const m of G.mobs) if (m.alive && Math.hypot(m.x - f.x, m.z - f.z) < f.r) { const d = attackDamage(ST, f.pct); damageMob(m, d.phys, 'phys', { crit: d.crit }); } for (let k = 0; k < 6; k++) { const a = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 4), glow('#e8d8b0', 0.6)); a.position.set(f.x + (rnd() - 0.5) * f.r * 1.6, 3, f.z + (rnd() - 0.5) * f.r * 1.6); G.group.add(a); G.fx.push({ kind: 'fall', mesh: a, t: 0.25 }); } } }
    else if (f.kind === 'fall') f.mesh.position.y -= dt * 14;
    else if (f.kind === 'meteor') {
      if (!f.rock) { f.rock = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 8), glow('#ff6a2a', 3)); f.rock.position.set(f.x - 3, 12, f.z - 3); G.group.add(f.rock); f.t0 = f.t; }
      const k = 1 - f.t / f.t0; f.rock.position.set(f.x - 3 * (1 - k), 12 * (1 - k), f.z - 3 * (1 - k));
      if (f.t <= 0) { G.group.remove(f.rock); if (f.foe) { ring(f.x, f.z, '#ff3a2a', f.r); sfx.play('boom'); if (Math.hypot(me.x - f.x, me.z - f.z) < f.r) hurtMe(f.foe, 'fire', null); } else { explode(f.x, f.z, f.r, f.fire, 'fire'); G.fx.push({ kind: 'burn', x: f.x, z: f.z, r: f.r * 0.8, t: 3, tick: 0, fire: f.fire * 0.12, mesh: areaMarker(f.x, f.z, f.r * 0.8, '#ff4a1a') }); } }
    }
    else if (f.kind === 'burn') { f.tick -= dt; if (f.tick <= 0) { f.tick = 0.5; for (const m of G.mobs) if (m.alive && Math.hypot(m.x - f.x, m.z - f.z) < f.r) damageMob(m, f.fire, 'fire'); } f.mesh.material.opacity = 0.25 + Math.sin(f.t * 12) * 0.08; }
    if (f.t <= 0) { if (f.mesh) { G.group.remove(f.mesh); } if (f.el) f.el.remove(); G.fx.splice(i, 1); }
  }
}
function openProp(p) {
  p.done = true; G.cur && G.cur.opened.add(p.i); sfx.play(p.kind === 'chest' ? 'door' : 'thud');
  if (p.kind === 'chest') p.mesh.traverse((o) => { if (o.userData.lid) o.rotation.x = -1.2; }); else p.mesh.visible = false;
  const il = mlvlOf(G.act, G.depth, ch().diff), r = Math.random;
  if (p.kind === 'chest') { dropItem(p.x, p.z, rollItem(il, ST.mf, r, { champ: true })); if (r() < 0.6) dropGold(p.x, p.z, 10 + il * 6); if (r() < 0.4) dropPotion(p.x, p.z, potionFor(ch().lvl)); }
  else { if (r() < 0.22) dropGold(p.x, p.z, 4 + il * 2); else if (r() < 0.16) dropPotion(p.x, p.z, potionFor(ch().lvl)); else if (r() < 0.06) dropItem(p.x, p.z, rollItem(il, ST.mf, r)); }
}
// walls between the camera and you vanish, so you never lose sight of your hero
function clearView() {
  const W = G.walls; if (!W || G.area === 'town') return;
  const now = new Set(), cx = camera.position.x, cz = camera.position.z, dx = me.x - cx, dz = me.z - cz, L2 = dx * dx + dz * dz;
  W.list.forEach(([x, y], i) => { const wx = toW(x), wz = toW(y); if (Math.abs(wx - me.x) > 10 || Math.abs(wz - me.z) > 10) return; const k = ((wx - cx) * dx + (wz - cz) * dz) / L2; if (k < 0.55 || k > 1.02) return; const px = cx + dx * k, pz = cz + dz * k; if (Math.hypot(wx - px, wz - pz) < 2.4) now.add(i); });
  const Z = new THREE.Matrix4().makeScale(1, 0.12, 1);
  for (const i of W.hidden) if (!now.has(i)) W.mesh.setMatrixAt(i, W.mats[i]);
  for (const i of now) { const m = W.mats[i].clone().multiply(Z); m.elements[13] = 0.12; W.mesh.setMatrixAt(i, m); }
  if (now.size || W.hidden.size) W.mesh.instanceMatrix.needsUpdate = true;
  W.hidden = now;
}
function explore() { const L = G.L, tx = toT(me.x), ty = toT(me.z); for (let y = ty - 7; y <= ty + 7; y++) for (let x = tx - 7; x <= tx + 7; x++) if (x >= 0 && y >= 0 && x < L.N && y < L.N && (x - tx) ** 2 + (y - ty) ** 2 < 50) G.explored[y * L.N + x] = 1; }
function placeLabels() {
  const place = (el, x, y, z) => { _v.set(x, y, z).project(camera); const vis = _v.z < 1 && Math.abs(_v.x) < 1.05 && Math.abs(_v.y) < 1.05; el.style.display = vis ? '' : 'none'; if (vis) el.style.transform = `translate(${((_v.x + 1) / 2 * innerWidth).toFixed(1)}px, ${((1 - _v.y) / 2 * innerHeight).toFixed(1)}px) translate(-50%, -50%)`; };
  for (const d of G.drops) if (d.tag) place(d.tag, d.x, 0.9, d.z);
  if (me.tag) place(me.tag, me.x, 2.9, me.z);
  if (G.area === 'town' && G.L.spots) { for (const [k, el] of Object.entries(townTags)) { const s = G.L.spots[k]; if (s) place(el, s.x, k === 'cave' ? 1.2 : 2.9, s.z); } }
  for (const el of Object.values(townTags)) if (G.area !== 'town') el.style.display = 'none';
}
const townTags = {};
for (const k of ['merchant', 'gambler', 'healer', 'stash', 'waypoint', 'cave']) { const el = document.createElement('div'); el.className = 'nametag npc'; $('labels').appendChild(el); townTags[k] = el; }

// ------------------------------------------------------------------ potions
function drink(kind) {
  const c = ch(), t = tr(); if (me.dead || !started) return;
  const ids = kind === 'rejuv' ? ['rejuv'] : [kind + '3', kind + '2', kind + '1'];
  const id = ids.find((k) => (c.pots[k] || 0) > 0); if (!id) return;
  c.pots[id]--; const P = POTIONS[id]; sfx.play('drink');
  if (P.heal) { me.potHeal += P.heal; me.potHealRate = P.heal / 2; }
  if (P.mana) { me.potMana += P.mana; me.potManaRate = P.mana / 2; }
  if (P.pct) { me.life = Math.min(ST.life, me.life + ST.life * P.pct / 100); me.mana = Math.min(ST.mana, me.mana + ST.mana * P.pct / 100); }
  changed(); drawHud(true);
}

// ------------------------------------------------------------------ HUD
function drawHud(force) {
  if (!started) return;
  const c = ch(), t = tr();
  const lp = clamp(me.life / ST.life, 0, 1), mp = clamp(me.mana / ST.mana, 0, 1);
  $('lifeFill').style.height = (lp * 100) + '%'; $('manaFill').style.height = (mp * 100) + '%';
  $('lifeTxt').textContent = `${Math.ceil(me.life)}/${ST.life}`; $('manaTxt').textContent = `${Math.floor(me.mana)}/${ST.mana}`;
  $('xpFill').style.width = (c.lvl >= MAX_LEVEL ? 100 : c.xp / xpFor(c.lvl) * 100) + '%';
  $('lvl').textContent = t.lv(c.lvl);
  const pots = (k) => ['3', '2', '1'].reduce((a, n) => a + (c.pots[k + n] || 0), 0);
  $('pot1').innerHTML = `🧪<b>${pots('hp')}</b><small>1</small>`; $('pot2').innerHTML = `🧴<b>${pots('mp')}</b><small>2</small>`; $('pot3').innerHTML = `💜<b>${c.pots.rejuv || 0}</b><small>3</small>`;
  $('tpBtn').innerHTML = `📜<b>${c.tp}</b><small>T</small>`;
  $('skillbar').innerHTML = ['Q', 'E', 'R', 'F'].map((k) => { const id = c.keys[k], S = id && SKILLS[id], cd = id ? me.cds[id] || 0 : 0; return `<button data-k="${k}" class="${c.rmb === id && id ? 'sel' : ''}" title="${S ? esc(tx(S.n)) : ''}">${S ? S.icon : ''}<small>${k}</small>${cd > 0 ? `<i>${cd.toFixed(1)}</i>` : ''}</button>`; }).join('');
  $('skillbar').querySelectorAll('button').forEach((b) => b.onclick = () => { const id = c.keys[b.dataset.k]; if (id) { c.rmb = id; drawHud(true); } else toggleWin('skills'); });
  if (isTouch) for (const k of ['Q', 'E', 'R', 'F']) { const id = c.keys[k]; $('t' + k).textContent = id ? SKILLS[id].icon : '·'; }
  $('alertPts').hidden = !(c.pts || c.spts);
  if (force) for (const [k, el] of Object.entries(townTags)) el.textContent = k === 'cave' ? '⬇ ' + t.cave : k === 'stash' ? t.stashName : k === 'waypoint' ? t.waypoint : t[k];
  // the monster under the cursor
  const m = !isTouch ? mobAtScreen(mouse.x, mouse.y) || (me.target && me.target.alive ? me.target : null) : me.target && me.target.alive ? me.target : null;
  if (m) { $('foe').hidden = false; $('foeName').textContent = mobName(m); $('foeName').className = m.boss || m.unique ? 'uni' : m.champ ? 'champ' : ''; $('foeMods').textContent = m.mods.map((k) => tx(MODS[k].n)).join(' · ') || (m.minion ? t.minion : ''); $('foeFill').style.width = (m.hp / m.max * 100) + '%'; } else $('foe').hidden = true;
}
let miniC = null;
function drawMini() {
  const cvs = $('mini'), x = cvs.getContext('2d'), L = G.L; if (!L) return;
  const big = bigMap, Wd = big ? Math.min(innerWidth, innerHeight) * 0.8 : 150;
  cvs.width = cvs.height = Wd; cvs.classList.toggle('big', big);
  const k = Wd / L.N;
  x.clearRect(0, 0, Wd, Wd);
  for (let y = 0; y < L.N; y++) for (let xx = 0; xx < L.N; xx++) { if (G.area !== 'town' && !G.explored[y * L.N + xx]) continue; const v = L.grid[y * L.N + xx]; if (v === FLOOR) { x.fillStyle = 'rgba(200,180,150,.35)'; x.fillRect(xx * k, y * k, k + 0.5, k + 0.5); } }
  const dot = (p, c, r = 3) => { if (!p) return; x.fillStyle = c; x.beginPath(); x.arc(p.x / TS * k, p.z / TS * k, r, 0, 7); x.fill(); };
  dot(G.stairs, '#ff4a4a', 4); dot(G.up, '#7ab8ff', 3); dot(G.wp, '#5ae8ff', 4); dot(G.portal, '#5ab0ff', 4); dot(G.exitPortal, '#c87aff', 5);
  if (big) for (const m of G.mobs) if (m.alive && G.explored[toT(m.z) * L.N + toT(m.x)] && Math.hypot(m.x - me.x, m.z - me.z) < 16) dot(m, m.boss || m.unique ? '#ffcf3a' : '#ff6a6a', 2);
  dot(me, '#ffffff', 4);
}
function areaTitle(s) { $('area').textContent = s; banner(s); }
function msg(text, ms = 1600) { const el = $('msg'); el.textContent = text; el.classList.add('on'); clearTimeout(msg._t); msg._t = setTimeout(() => el.classList.remove('on'), ms); }
function banner(text) { const el = $('banner'); el.textContent = text; el.classList.remove('on'); void el.offsetWidth; el.classList.add('on'); }
function toast(text, color = '#fff') { const el = document.createElement('div'); el.className = 'toast'; el.textContent = text; el.style.color = color; $('toasts').appendChild(el); setTimeout(() => el.classList.add('on'), 20); setTimeout(() => { el.classList.remove('on'); setTimeout(() => el.remove(), 400); }, 4500); }
function flash() { const f = $('flash'); f.classList.remove('on'); void f.offsetWidth; f.classList.add('on'); }

// ------------------------------------------------------------------ windows: inventory and character, skills, merchant, gambler, stash, waypoint
let win = null, shopStock = [], tipEl = $('tip');
const winOpen = () => !!win;
function openWin(w) { win = w; $('win').hidden = false; renderWin(); keys.clear(); mouse.down = false; }
function closeWin() { win = null; $('win').hidden = true; tipEl.hidden = true; }
function toggleWin(w) { if (win === w) closeWin(); else openWin(w); }
$('winX').onclick = () => closeWin();
function statLines(it) {
  return Object.entries(it.st || {}).filter(([k]) => !['edmg', 'edef', 'mindmg', 'maxdmg'].includes(k) || it.rar !== 'normal').map(([k, v]) => (STAT_NAMES[k] ? tx(STAT_NAMES[k]).replace('{v}', v) : `${k} ${v}`));
}
function itemTip(it, extra = '') {
  const t = tr(), B = BASES[it.base], c = ch();
  const lines = [`<b style="color:${RARITY[it.rar].c}">${esc(tx(it.name))}</b>`];
  if (it.rar !== 'normal' || it.u) lines.push(`<span class="base">${esc(tx(B.n))}</span>`);
  if (it.dmg) lines.push(`${t.dmg}: ${it.dmg[0]}–${it.dmg[1]}${B.two ? ` · ${t.twoHand}` : ''}`);
  if (it.def) lines.push(`${t.def}: ${it.def}`);
  if (it.block) lines.push(`${t.block}: ${it.block}%`);
  if (B.sk && c.cls === 'sorc') lines.push(`<span class="mag">${tx(STAT_NAMES.skills).replace('{v}', B.sk)}</span>`);
  lines.push(`<span class="${it.req > c.lvl ? 'bad' : ''}">${t.req(it.req)}</span>`);
  for (const l of statLines(it)) lines.push(`<span class="mag">${esc(l)}</span>`);
  lines.push(`<span class="base">💰 ${itemValue(it)}</span>`);
  return lines.join('<br>') + extra;
}
function showTip(e, html) { tipEl.innerHTML = html; tipEl.hidden = false; const r = tipEl.getBoundingClientRect(); let x = e.clientX + 16, y = e.clientY + 12; if (x + r.width > innerWidth - 8) x = e.clientX - r.width - 16; if (y + r.height > innerHeight - 8) y = innerHeight - r.height - 8; tipEl.style.left = Math.max(8, x) + 'px'; tipEl.style.top = Math.max(8, y) + 'px'; }
function hookTips(root, getItem, extra = () => '') { root.querySelectorAll('[data-tip]').forEach((el) => { const it = getItem(el); if (!it) return; el.onpointerenter = (e) => showTip(e, itemTip(it, extra(it))); el.onpointermove = (e) => showTip(e, itemTip(it, extra(it))); el.onpointerleave = () => { tipEl.hidden = true; }; }); }
const cellHTML = (it, i, attr) => `<button class="cell r-${it.rar}" data-tip ${attr}="${i}" ${it.req > ch().lvl ? 'data-low' : ''}>${BASES[it.base].icon}</button>`;
function equip(i) {
  const c = ch(), it = c.inv[i], B = BASES[it.base], t = tr();
  if (it.req > c.lvl) { msg(t.tooLow); return; }
  let slot = B.slot === 'ring' ? (!c.equip.ring1 ? 'ring1' : !c.equip.ring2 ? 'ring2' : 'ring1') : B.slot;
  c.inv.splice(i, 1);
  if (c.equip[slot]) c.inv.push(c.equip[slot]);
  c.equip[slot] = it;
  if (slot === 'weapon' && B.two && c.equip.offhand) { c.inv.push(c.equip.offhand); c.equip.offhand = null; }
  if (slot === 'offhand' && c.equip.weapon && BASES[c.equip.weapon.base].two) { c.inv.push(c.equip.weapon); c.equip.weapon = null; }
  sfx.play('item'); afterGear();
}
function unequip(slot) { const c = ch(); if (!c.equip[slot]) return; if (c.inv.length >= 40) { msg(tr().full); return; } c.inv.push(c.equip[slot]); c.equip[slot] = null; afterGear(); }
function afterGear() { refreshStats(); buildHero(); changed(); renderWin(); drawHud(true); }
function renderWin() {
  if (!win) return;
  const c = ch(), t = tr(), el = $('winBody');
  tipEl.hidden = true;
  if (win === 'inv' || win === 'char' || win === 'shop' || win === 'stash' || win === 'gamble') {
    // left: character (stats) / merchant / stash / gambler; right: equipment and bag
    let left = '';
    if (win === 'inv' || win === 'char') {
      const row = (k, label, v, add = '') => `<div class="srow"><span>${label}</span><b>${v}</b>${add}</div>`;
      const plus = (k) => (c.pts ? `<button class="plus" data-p="${k}">+</button>` : '');
      left = `<h3>${esc(c.name)} · ${tx(CLASSES[c.cls].n)} · ${t.lv(c.lvl)}</h3><div class="xp">EXP ${c.xp} / ${xpFor(c.lvl)}</div>
        <p class="pts">${c.pts ? t.points(c.pts) : ''}</p>
        ${row('str', t.str, ST.str, plus('str'))}${row('dex', t.dex, ST.dex, plus('dex'))}${row('vit', t.vit, ST.vit, plus('vit'))}${row('ene', t.ene, ST.ene, plus('ene'))}
        <hr>${row('', t.life, ST.life)}${row('', t.mana, ST.mana)}${row('', t.dmg, `${Math.round(ST.dmg[0] * (1 + ST.main / 100))}–${Math.round(ST.dmg[1] * (1 + ST.main / 100))}`)}${row('', t.aps, ST.aps.toFixed(2))}${row('', t.def, ST.def)}
        ${ST.block ? row('', t.block, ST.block + '%') : ''}${row('', t.crit, ST.crit + '%')}${ST.dodge ? row('', t.dodge, ST.dodge + '%') : ''}
        <hr>${row('', t.fire, ST.res.fire + '%')}${row('', t.cold, ST.res.cold + '%')}${row('', t.light, ST.res.light + '%')}${row('', t.poison, ST.res.poison + '%')}${ST.mf ? row('', t.mf, ST.mf + '%') : ''}${ST.fr ? row('', t.fr, ST.fr + '%') : ''}`;
    } else if (win === 'shop') {
      const pots = Object.entries(POTIONS).filter(([, p]) => !p.lvl || p.lvl <= c.lvl + 4);
      left = `<h3>🧑‍🌾 ${t.merchant}</h3><p class="dim">💰 ${c.gold} · ${t.sellTip}</p><h4>${t.potions}</h4><div class="grid">${pots.map(([id, p]) => `<button class="cell" data-pot="${id}" title="${esc(tx(p.n))}">${p.icon}<em>${p.price}</em></button>`).join('')}<button class="cell" data-scroll title="${esc(t.tp)}">📜<em>40</em></button></div>
        <h4>${t.items}</h4><div class="grid">${shopStock.map((it, i) => `<button class="cell r-${it.rar}" data-tip data-buy="${i}">${BASES[it.base].icon}<em>${itemValue(it) * 4}</em></button>`).join('')}</div>`;
    } else if (win === 'gamble') {
      const cost = 200 + c.lvl * 60;
      left = `<h3>🎲 ${t.gambler}</h3><p class="dim">${t.gambleTip}</p><p>💰 ${c.gold}</p><div class="grid">${['ring', 'amulet', 'cap', 'helm', 'gloves', 'boots', 'sash', 'quilted', 'chain', 'short_sword', 'broad_sword', 'hand_axe', 'short_bow', 'long_bow', 'wand', 'staff', 'buckler', 'kite'].filter((b) => BASES[b].lvl <= c.lvl + 3).map((b) => `<button class="cell" data-gb="${b}" title="${esc(tx(BASES[b].n))}">${BASES[b].icon}<em>${cost}</em></button>`).join('')}</div>`;
    } else if (win === 'stash') {
      left = `<h3>📦 ${t.stashName}</h3><div class="grid stash">${c.stash.map((it, i) => cellHTML(it, i, 'data-st')).join('')}${Array.from({ length: Math.max(0, 60 - c.stash.length) }, () => '<span class="cell empty"></span>').join('')}</div>`;
    }
    const eq = SLOTS.map((s) => { const it = c.equip[s]; return `<button class="slot s-${s} ${it ? 'r-' + it.rar : ''}" data-eq="${s}" ${it ? 'data-tip' : ''}>${it ? BASES[it.base].icon : `<small>${tx(SLOT_NAMES[s])}</small>`}</button>`; }).join('');
    el.innerHTML = `<div class="twocol"><div class="lcol">${left}</div><div class="rcol"><div class="paper">${eq}</div><p class="gold">💰 ${c.gold}</p><div class="grid inv">${c.inv.map((it, i) => cellHTML(it, i, 'data-i')).join('')}${Array.from({ length: Math.max(0, 40 - c.inv.length) }, () => '<span class="cell empty"></span>').join('')}</div></div></div>`;
    hookTips(el.querySelector('.paper'), (b) => c.equip[b.dataset.eq]);
    const cmp = (it) => { const B = BASES[it.base], s = B.slot === 'ring' ? 'ring1' : B.slot, cur = c.equip[s]; return cur && win !== 'stash' ? `<hr><span class="base">${SV.lang === 'zh' ? '目前裝備' : 'Equipped'}:</span><br>${itemTip(cur)}` : ''; };
    hookTips(el.querySelector('.inv'), (b) => c.inv[+b.dataset.i], cmp);
    el.querySelectorAll('[data-i]').forEach((b) => b.onclick = () => {
      const i = +b.dataset.i, it = c.inv[i];
      if (win === 'shop') { c.gold += itemValue(it); c.inv.splice(i, 1); sfx.play('gold'); changed(); renderWin(); }
      else if (win === 'stash') { if (c.stash.length >= 60) return; c.stash.push(it); c.inv.splice(i, 1); changed(); renderWin(); }
      else equip(i);
    });
    el.querySelectorAll('[data-eq]').forEach((b) => b.onclick = () => unequip(b.dataset.eq));
    el.querySelectorAll('[data-p]').forEach((b) => b.onclick = () => { if (!c.pts) return; c.pts--; c.alloc[b.dataset.p]++; sfx.play('click'); refreshStats(); changed(); renderWin(); });
    el.querySelectorAll('[data-pot]').forEach((b) => b.onclick = () => { const P = POTIONS[b.dataset.pot]; if (c.gold < P.price) return; c.gold -= P.price; c.pots[b.dataset.pot] = (c.pots[b.dataset.pot] || 0) + 1; sfx.play('buy'); changed(); renderWin(); drawHud(true); });
    el.querySelectorAll('[data-scroll]').forEach((b) => b.onclick = () => { if (c.gold < 40) return; c.gold -= 40; c.tp++; sfx.play('buy'); changed(); renderWin(); drawHud(true); });
    if (win === 'shop') { hookTips(el.querySelector('.lcol'), (b) => (b.dataset.buy !== undefined ? shopStock[+b.dataset.buy] : null)); el.querySelectorAll('[data-buy]').forEach((b) => b.onclick = () => { const i = +b.dataset.buy, it = shopStock[i], p = itemValue(it) * 4; if (c.gold < p || c.inv.length >= 40) return; c.gold -= p; c.inv.push(it); shopStock.splice(i, 1); sfx.play('buy'); changed(); renderWin(); }); }
    if (win === 'gamble') el.querySelectorAll('[data-gb]').forEach((b) => b.onclick = () => { const cost = 200 + c.lvl * 60; if (c.gold < cost || c.inv.length >= 40) { if (c.inv.length >= 40) msg(t.full); return; } c.gold -= cost; const u = rnd(), rar = u < 0.02 ? 'unique' : u < 0.12 ? 'rare' : 'magic'; const it = makeItem(b.dataset.gb, rar, c.lvl + 3); c.inv.push(it); sfx.play(rar === 'unique' ? 'win' : 'buy'); toast(tx(it.name), RARITY[it.rar].c); changed(); renderWin(); });
    if (win === 'stash') { hookTips(el.querySelector('.stash'), (b) => c.stash[+b.dataset.st]); el.querySelectorAll('[data-st]').forEach((b) => b.onclick = () => { if (c.inv.length >= 40) { msg(t.full); return; } c.inv.push(c.stash[+b.dataset.st]); c.stash.splice(+b.dataset.st, 1); changed(); renderWin(); }); }
    el.querySelectorAll('[data-low]').forEach((b) => b.classList.add('low'));
    $('winTitle').textContent = win === 'shop' ? t.merchant : win === 'gamble' ? t.gambler : win === 'stash' ? t.stashName : t.inv;
  } else if (win === 'skills') {
    $('winTitle').textContent = t.skills;
    el.innerHTML = `<p class="pts">${t.spoints(c.spts)}</p><div class="skills">${SKILL_ORDER[c.cls].map((id) => {
      const S = SKILLS[id], lv = c.skills[id] || 0, eff = lv ? lv + ST.skillsBonus : 0, can = c.spts > 0 && c.lvl >= S.req && lv < MAX_SKILL;
      const d = (l) => tx(S.d).replace(/\{(\w+)\}/g, (_, k) => (S[k] ? S[k](Math.max(1, l)) : k));
      return `<div class="sk ${lv ? '' : 'locked'}"><span class="ic">${S.icon}</span><div><b>${tx(S.n)}</b> <small>${lv ? t.skillLv(eff) : c.lvl < S.req ? t.learnAt(S.req) : ''}</small><p>${esc(d(eff || 1))}</p>${lv && lv < MAX_SKILL ? `<p class="dim">${t.next}: ${esc(d(eff + 1))}</p>` : ''}${S.mana ? `<p class="dim">💧 ${S.mana(Math.max(1, eff))}</p>` : ''}</div>
        <div class="acts">${can ? `<button data-up="${id}">+</button>` : ''}${lv && S.kind !== 'passive' ? ['Q', 'E', 'R', 'F'].map((k) => `<button class="key ${c.keys[k] === id ? 'sel' : ''}" data-bind="${id}" data-k="${k}">${k}</button>`).join('') : ''}</div></div>`;
    }).join('')}</div>`;
    el.querySelectorAll('[data-up]').forEach((b) => b.onclick = () => { const id = b.dataset.up; if (c.spts <= 0) return; c.spts--; c.skills[id] = (c.skills[id] || 0) + 1; if (SKILLS[id].kind !== 'passive' && !Object.values(c.keys).includes(id)) { const free = ['Q', 'E', 'R', 'F'].find((k) => !c.keys[k]); if (free) c.keys[free] = id; } sfx.play('levelup'); refreshStats(); changed(); renderWin(); drawHud(true); });
    el.querySelectorAll('[data-bind]').forEach((b) => b.onclick = () => { for (const k of Object.keys(c.keys)) if (c.keys[k] === b.dataset.bind) c.keys[k] = null; c.keys[b.dataset.k] = b.dataset.bind; c.rmb = b.dataset.bind; changed(); renderWin(); drawHud(true); });
  } else if (win === 'wp') {
    $('winTitle').textContent = t.waypoint;
    const diffs = DIFFS.slice(0, c.maxDiff + 1);
    el.innerHTML = `<p class="dim">${t.choose}</p>${c.maxDiff ? `<div class="tabs">${diffs.map((D, i) => `<button data-d="${i}" class="${c.diff === i ? 'sel' : ''}">${tx(D.n)}</button>`).join('')}</div>` : ''}
      <div class="wps"><button data-town class="wpb">🏕️ ${t.town}</button>${ACTS.map((A, a) => `<h4>${tx(A.n)}</h4>${[0, 2].map((d) => { const k = levelKey(c.diff, a, d), ok = c.wps[k]; return `<button class="wpb" ${ok ? `data-wp="${a}-${d}"` : 'disabled'}>${ok ? '' : '🔒 '}${tx(A.levels[d])}</button>`; }).join('')}`).join('')}</div>`;
    el.querySelectorAll('[data-d]').forEach((b) => b.onclick = () => { if (+b.dataset.d !== c.diff) { c.diff = +b.dataset.d; G.levels.clear(); G.townPortal = null; c.wps[levelKey(c.diff, 0, 0)] = 1; refreshStats(); changed(); } renderWin(); });
    el.querySelectorAll('[data-wp]').forEach((b) => b.onclick = () => { const [a, d] = b.dataset.wp.split('-').map(Number); closeWin(); enterLevel(a, d, 'wp'); });
    const tb = el.querySelector('[data-town]'); if (tb) tb.onclick = () => { closeWin(); if (G.area !== 'town') enterTown(false); };
  } else if (win === 'help') {
    $('winTitle').textContent = t.help;
    el.innerHTML = t.helpBody.map((p) => `<p>${p}</p>`).join('') + `<p class="dim">${isTouch ? t.touchKeys : t.keys}</p><div class="row"><button id="hLang">${t.lang}</button><button id="hSnd">🔊 ${t.sound}: ${SV.sound ? 'ON' : 'OFF'}</button><button id="hQuit">${t.quit}</button></div>`;
    $('hLang').onclick = () => { SV.lang = SV.lang === 'zh' ? 'en' : 'zh'; persist(); renderWin(); drawHud(true); };
    $('hSnd').onclick = () => { SV.sound = !SV.sound; sfx.on = SV.sound; persist(); renderWin(); };
    $('hQuit').onclick = () => { persist(); location.reload(); };
  }
}
function refreshShop() { const c = ch(), r = Math.random; shopStock = Array.from({ length: 8 }, () => { const it = rollItem(Math.max(1, c.lvl), 0, r); if (it.rar === 'rare' || it.rar === 'unique') return makeItem(it.base, 'magic', c.lvl, r); return it; }); }
for (const [id, w] of [['bInv', 'inv'], ['bSkills', 'skills'], ['bMap', null], ['bHelp', 'help']]) $(id).onclick = () => { sfx.unlock(); if (w) toggleWin(w); else bigMap = !bigMap; };
$('alertPts').onclick = () => openWin(ch().pts ? 'inv' : 'skills');
$('pot1').onclick = () => drink('hp'); $('pot2').onclick = () => drink('mp'); $('pot3').onclick = () => drink('rejuv'); $('tpBtn').onclick = () => townPortal();

// ------------------------------------------------------------------ character select
let pickCls = 'warrior', delArm = null;
function renderSelect() {
  const t = tr();
  $('sTitle').textContent = t.title; $('sSub').textContent = t.sub;
  $('sChars').innerHTML = SV.chars.map((c, i) => `<div class="charcard"><span class="ic">${CLASSES[c.cls].icon}</span><div><b>${esc(c.name)}</b><small>${tx(CLASSES[c.cls].n)} · ${t.lv(c.lvl)} · ${tx(DIFFS[c.diff].n)}</small></div><button data-play="${i}" class="go">${t.play}</button><button data-del="${i}" class="ghost">${delArm === i ? t.delQ : t.del}</button></div>`).join('');
  $('sNewH').textContent = t.newChar; $('sPick').textContent = t.pick; $('sNameL').textContent = t.name; $('sCreate').textContent = t.create;
  $('sClasses').innerHTML = Object.entries(CLASSES).map(([k, C]) => `<button data-c="${k}" class="${k === pickCls ? 'sel' : ''}"><span class="ic">${C.icon}</span><b>${tx(C.n)}</b><small>${tx(C.desc)}</small></button>`).join('');
  $('sChars').querySelectorAll('[data-play]').forEach((b) => b.onclick = () => startChar(+b.dataset.play));
  $('sChars').querySelectorAll('[data-del]').forEach((b) => b.onclick = () => { const i = +b.dataset.del; if (delArm === i) { SV.chars.splice(i, 1); delArm = null; persist(); } else delArm = i; renderSelect(); });
  $('sClasses').querySelectorAll('[data-c]').forEach((b) => b.onclick = () => { pickCls = b.dataset.c; sfx.unlock(); sfx.play('click'); renderSelect(); });
  $('sLang').textContent = t.lang; $('sKeys').textContent = isTouch ? t.touchKeys : t.keys;
}
$('sCreate').onclick = () => { const name = ($('sName').value || '').replace(/[<>{}]/g, '').trim().slice(0, 14) || tx(CLASSES[pickCls].n); SV.chars.push(newChar(name, pickCls)); persist(); startChar(SV.chars.length - 1); };
$('sLang').onclick = () => { SV.lang = SV.lang === 'zh' ? 'en' : 'zh'; persist(); renderSelect(); };
function startChar(i) {
  sfx.unlock(); SV.cur = i; persist();
  $('select').hidden = true; $('hud').hidden = false; started = true;
  const c = ch(); c.wps = c.wps || {}; c.wps[levelKey(c.diff, 0, 0)] = 1;
  refreshStats(); me.life = ST.life; me.mana = ST.mana; buildHero(); enterTown(false); drawHud(true);
  sfx.on = SV.sound;
}

// ------------------------------------------------------------------ boot
document.body.classList.toggle('touch', isTouch);
{ const L = genTown(); G.L = L; buildScene(L, 'town'); camera.position.set(30, 22, 52); camera.lookAt(30, 0, 30); }
renderSelect(); requestAnimationFrame(frame);
(async () => { try { cloud = await import('/save.js'); if (await cloud.pull(GAME, SAVE_KEY)) { SV = JSON.parse(localStorage.getItem(SAVE_KEY)) || SV; renderSelect(); } } catch (e) { cloud = null; } })();
if (params.has('quick')) { if (!SV.chars.length) SV.chars.push(newChar('Test', params.get('quick') || 'warrior')); startChar(0); }
window.DH = { G, me, ch, refresh: () => { refreshStats(); buildHero(); }, get ST() { return ST; }, enterLevel, enterTown, cast, openWin, closeWin, gainXp, dropItem, pickUp, SV: () => SV };
