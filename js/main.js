// Duskhold: the client. Draws the camp and the dungeons, runs your hero, the monsters, skills, loot and every screen.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { CLASSES, SKILLS, SKILL_ORDER, TREES, MAX_SKILL, MAX_LEVEL, xpFor, DIFFS, ACTS, mlvlOf, MOBS, mobStats, MODS, UNAME, UNAME2, BASES, STAT_NAMES, RARITY, POTIONS, SLOTS, SLOT_NAMES, UNIQUES, SETS, SET_BY_ID, UNIQUE_BY_ID, itemColor } from './data.js?v=4';
import { rollItem, makeItem, potionFor, itemValue, rng, newUid } from './loot.js?v=4';
import { derive, setCount, attackDamage, spellDamage, hitChance, mobHitChance, takeDamage } from './combat.js?v=4';
import { genLevel, genTown, collide, field, stepOn, sees, walkAt, toT, toW, TS, FLOOR, WALL, PILLAR } from './dungeon.js?v=4';
import { makeHero, makeMob, animate, makeProp, makeNPC, mat, glow, OUTLINE, GRAD } from './models.js?v=5';
import { sfx } from './audio.js?v=4';
import { STR } from './text.js?v=4';

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
  const c = { id: newUid(), name, cls, lvl: 1, xp: 0, pts: 0, spts: 1, alloc: { str: 0, dex: 0, vit: 0, ene: 0 }, skills: {}, keys: { Q: null, E: null, R: null, F: null, G: null, H: null }, rmb: null,
    equip: {}, inv: [], stash: [], gold: 80, pots: { hp1: 4, mp1: 3 }, tp: 3, wps: { '0-0-0': 1 }, diff: 0, maxDiff: 0, act: 0, created: Date.now() };
  const first = TREES[cls][0].skills.find((id) => SKILLS[id].req <= 1 && !['passive', 'buff'].includes(SKILLS[id].kind)) || TREES[cls][0].skills[0]; c.skills[first] = 1; c.spts = 1; c.keys.Q = first; c.rmb = first;
  const w = { warrior: 'short_sword', ranger: 'short_bow', sorc: 'wand', druid: 'club', necro: 'wand' }[cls];
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
const G = { allies: [], area: null, act: 0, depth: 0, L: null, group: null, mobs: [], shots: [], fx: [], drops: [], props: [], torches: [], walls: null, explored: null, key: '', field: null, fieldT: 0, portal: null, townPortal: null, levels: new Map(), stairs: null, up: null, wp: null, theme: 'town', bossDead: false, exitPortal: null };
const ch = () => SV.chars[SV.cur];
let C = null, ST = null;          // the current character and their derived stats
const me = { x: 0, z: 0, yaw: 0, yawT: 0, ramp: 0, actDur: 0.5, hitK: 0, queue: [], life: 1, mana: 1, mesh: null, moveTo: null, path: null, target: null, act: '', actT: 0, atkT: 0, cds: {}, buffs: {}, whirl: 0, leap: null, regenT: 0, dead: false, speed: 0, potHeal: 0, potMana: 0, inv: 0 };

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
  for (const a of G.allies) a.mesh = null;
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
  for (const m of G.mobs) if (m.alive || m.corpse) { addMobMesh(m); if (!m.alive) { m.mesh.rotation.z = 1.5; m.mesh.position.y = -0.4; m.dieT = 0; } }
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
  if (m.mods.includes('fire') || m.mods.includes('cold') || m.mods.includes('light')) { const aura = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.95, 20), new THREE.MeshBasicMaterial({ color: { fire: '#ff6a2a', cold: '#7ac8ff', light: '#ffe25a' }[m.el], transparent: true, opacity: 0.6, side: THREE.DoubleSide })); aura.rotation.x = -Math.PI / 2; aura.position.y = 0.05; m.mesh.add(aura); }
  G.group.add(m.mesh);
}
const mobName = (m) => (m.boss ? tx(m.name) : m.unique ? `${tx(m.name[0])}${SV.lang === 'zh' ? '' : ' '}${tx(m.name[1])}` : tx(MOBS[m.id].n));
let hitStop = 0, shake = 0;
function impact(m, opts, d) {
  const big = opts.crit || m.boss;
  m.squash = 1; m.hitK = 1;
  sparks(m.x, 1 * MOBS[m.id].size, m.z, opts.crit ? '#ffcf3a' : MOBS[m.id].color, opts.crit ? 14 : 7);
  if (opts.melee) { hitStop = Math.max(hitStop, opts.crit ? 0.09 : 0.045); shake = Math.max(shake, opts.crit ? 0.35 : 0.14); rumble(opts.crit ? 0.5 : 0.25, 0.08); }
  else if (big) shake = Math.max(shake, 0.1);
}
function damageMob(m, amt, el = 'phys', opts = {}) {
  if (!m.alive) return 0;
  let d = amt;
  if (el === 'phys' && m.mods.includes('stone')) d *= 0.6;
  if (el !== 'phys' && m.el === el) d *= 0.5;
  if (m.cu && m.cu.amp) d *= 1 + m.cu.amp.v / 100;
  if (el === 'poison' && !opts.dot) { m.dots = m.dots || []; m.dots.push({ dps: d * 0.6 / 2, t: 2, el }); d *= 0.4; }
  d = Math.max(1, Math.round(d));
  m.hp -= d; m.aggro = true; m.hitT = 0.15; if (!opts.dot) impact(m, opts, d);
  if (m.cu && m.cu.leech) me.life = Math.min(ST.life, me.life + d * m.cu.leech.v / 100);
  if (opts.slow) m.slow = Math.max(m.slow, opts.slow);
  if (opts.stun) m.stun = Math.max(m.stun, opts.stun);
  { const a = Math.atan2(m.x - me.x, m.z - me.z), push = (opts.knock || (opts.melee ? 0.25 : 0.1)) * (m.boss ? 0.2 : 1) * 7; m.kx = Math.sin(a) * push; m.kz = Math.cos(a) * push; }   // a short slide back
  if (ST.ls && opts.melee) me.life = Math.min(ST.life, me.life + d * ST.ls / 100);
  floatText(m.x, m.z, String(d), opts.crit ? '#ffcf3a' : el === 'fire' ? '#ff8a4a' : el === 'cold' ? '#8ad0ff' : el === 'light' ? '#ffe87a' : '#ffffff', opts.crit ? 1.25 : 1);
  if (m.hp <= 0) killMob(m);
  return d;
}
function killMob(m) {
  m.alive = false; m.dieT = 1; m.corpse = true; sfx.play('die'); if (m.tag) m.tag.remove();
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
function noteFound(it) { SV.found = SV.found || { u: {}, s: {} }; if (it.u) SV.found.u[it.u] = 1; if (it.set) SV.found.s[it.set + ':' + it.sp] = 1; }
function removeDrop(d) { G.drops.splice(G.drops.indexOf(d), 1); if (d.mesh) G.group.remove(d.mesh); if (d.tag) d.tag.remove(); }
function pickUp(d) {
  const c = ch(), t = tr();
  if (d.kind === 'gold') { c.gold += d.n; sfx.play('gold'); }
  else if (d.kind === 'pot') { c.pots[d.id] = (c.pots[d.id] || 0) + 1; sfx.play('pick'); }
  else { if (c.inv.length >= 40) { msg(t.full); return; } c.inv.push(d.it); sfx.play('item'); noteFound(d.it); if (d.it.rar === 'unique' || d.it.rar === 'rare' || d.it.rar === 'set') toast(`${tx(d.it.name)}`, RARITY[d.it.rar].c); }
  removeDrop(d); changed(); drawHud(true); if (winOpen()) renderWin();
}

// ------------------------------------------------------------------ the hero
function refreshStats() {
  const c = ch(); ST = derive({ ...c, buffs: Object.keys(me.buffs).filter((k) => me.buffs[k] > 0), equip: Object.fromEntries(Object.entries(c.equip).map(([k, it]) => [k, it && it.req > c.lvl ? { ...it, lvlTooLow: true } : it])) });
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
  while (c.lvl < MAX_LEVEL && c.xp >= xpFor(c.lvl)) { c.xp -= xpFor(c.lvl); c.lvl++; c.pts += 5; c.spts += 2; refreshStats(); me.life = ST.life; me.mana = ST.mana; banner(tr().levelUp(c.lvl)); sfx.play('levelup'); ring(me.x, me.z, '#ffe25a', 3); }
  changed();
}
function hurtMe(dmg, el, from) {
  if (me.dead || me.inv > 0) return;
  if (ST.dodge && rnd() * 100 < ST.dodge) { floatText(me.x, me.z, 'Dodge', '#9affc8'); return; }
  if (ST.block && !el && rnd() * 100 < ST.block * 0.8) { floatText(me.x, me.z, 'Block', '#c8d8ff'); sfx.play('thud'); return; }
  let d = takeDamage(ST, dmg, el && el !== 'phys' ? el : null);
  const ab = Math.max(me.buffs.shield > 0 ? SKILLS.shield.absorb(ST.sl('shield') || 1) : 0, ST.absorb || 0); if (ab) { const a = Math.min(me.mana, d * ab / 100); me.mana -= a; d -= a; }
  if (from && from.alive && ST.thorns) damageMob(from, ST.thorns, 'phys', { dot: true });
  if (from && from.alive && ST.chill) from.slow = Math.max(from.slow, 1.5);
  me.life -= d; me.hitT = 0.2; me.hitK = 1; shake = Math.max(shake, 0.3); rumble(0.9, 0.18); sfx.play('hit'); flash();
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
  if (e.code === 'KeyI') toggleWin('inv'); if (e.code === 'KeyC') toggleWin('char'); if (e.code === 'KeyK') toggleWin('skills'); if (e.code === 'KeyB') toggleWin('codex');
  if (e.code === 'Tab') { e.preventDefault(); bigMap = !bigMap; }
  if (winOpen() && !['KeyQ', 'KeyE', 'KeyR', 'KeyF', 'KeyG', 'KeyH', 'Digit1', 'Digit2', 'Digit3'].includes(e.code)) return;
  if (['KeyQ', 'KeyE', 'KeyR', 'KeyF', 'KeyG', 'KeyH'].includes(e.code)) { const id = ch().keys[e.code.slice(3)]; if (id) { ch().rmb = id; castAtCursor(id); drawHud(true); } }
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
  const m = mobAtScreen(e.clientX, e.clientY); if (m) { me.target = m; touchHold = e.pointerId; return; }
  const [gx, gz] = groundAt(e.clientX, e.clientY); walkTo(gx, gz);
}
addEventListener('pointermove', (e) => { if (e.pointerId !== stick.id) return; let dx = e.clientX - stick.ox, dy = e.clientY - stick.oy; const d = Math.hypot(dx, dy); if (d > 55) { dx *= 55 / d; dy *= 55 / d; } stick.mx = dx / 55; stick.mz = dy / 55; $('knob').style.transform = `translate(${dx}px, ${dy}px)`; });
function touchUp(e) { if (e.pointerId === touchHold) touchHold = null; if (e.pointerId === stick.id) { stick.id = null; stick.mx = stick.mz = 0; $('stick').classList.remove('on'); $('knob').style.transform = ''; } }
const nearestMob = (r = 14) => { let b = null, bd = r; for (const m of G.mobs) { if (!m.alive) continue; const d = Math.hypot(m.x - me.x, m.z - me.z); if (d < bd && sees(G.L, me.x, me.z, m.x, m.z)) { bd = d; b = m; } } return b; };
let touchHold = null;
const holdingAttack = () => (!isTouch && mouse.down) || pad.attacking || touchHold !== null;
function touchSkill(k, e) { const id = k === 'atk' ? null : ch().keys[k]; const m = nearestMob(); if (!id) { if (m) { me.target = m; touchHold = e ? e.pointerId : null; } return; } ch().rmb = id; const [x, z] = m ? [m.x, m.z] : [me.x + Math.sin(me.yaw) * 6, me.z + Math.cos(me.yaw) * 6]; cast(id, x, z, m); }
for (const k of ['atk', 'Q', 'E', 'R', 'F', 'G', 'H']) $('t' + k).addEventListener('pointerdown', (e) => { e.preventDefault(); sfx.unlock(); touchSkill(k, e); });
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
  // pressed during another swing: remember it and do it the moment that swing ends (input buffering)
  if (me.atkT > 0 || me.leap || me.whirl > 0) { me.buffer = { id, x, z, target, t: 0.6 }; return; }
  if (S.kind === 'bow' && !ST.bow) { msg(t.needBow); return; }
  if (S.kind === 'melee' && ST.bow && !me.form) { msg(t.needMelee); return; }
  if (S.kind === 'form' && me.form !== S.form) { msg(t.needForm(S.form)); return; }
  const cost = S.mana(lv); if (me.mana < cost) { msg(t.noMana, 700); sfx.play('fail'); return; }
  me.yaw = Math.atan2(x - me.x, z - me.z);
  const dist = Math.hypot(x - me.x, z - me.z);
  if (id === 'bash' || S.mech === 'melee' || S.mech === 'formstrike') { if (!target || dist > reach(target) + 0.6) { me.target = target || null; me.queued = id; return; } }
  if (S.gen) { me.mana -= cost; if (S.cd) me.cds[id] = S.cd; me.moveTo = null; me.path = null; runGen(id, S, lv, x, z, target, dist); return; }
  me.mana -= cost; if (S.cd) me.cds[id] = S.cd;
  me.moveTo = null; me.path = null;
  const atkTime = 1 / ST.aps, spellTime = 0.45;
  if (id === 'bash') { me.target = target; meleeSwing(target, S.pct(lv), { knock: 1.2 }); return; }
  if (id === 'leap') { const d = Math.min(dist, 9), lx = me.x + Math.sin(me.yaw) * d, lz = me.z + Math.cos(me.yaw) * d; if (!walkAt(G.L, lx, lz)) { me.mana += cost; me.cds[id] = 0; msg(t.cantThere); return; } me.leap = { x0: me.x, z0: me.z, x1: lx, z1: lz, t: 0, pct: S.pct(lv) }; sfx.play('swing'); return; }
  if (id === 'warcry') { setAct('cast', spellTime); sfx.play('boom'); ring(me.x, me.z, '#ffcf6a', S.r); const dmg = S.flat(lv) * (1 + ST.str / 200); for (const m of G.mobs) if (m.alive && Math.hypot(m.x - me.x, m.z - me.z) < S.r) damageMob(m, dmg, 'phys', { stun: 1.5 }); return; }
  if (id === 'whirl') { me.whirl = 2; me.whirlTo = { x, z }; me.whirlHit = 0; sfx.play('swing'); return; }
  if (S.kind === 'bow') {
    setAct('attack', atkTime);
    // pct: the skill's bonus over a plain arrow (70% damage is −30)
    const shoot = (yaw, pct, extra) => later(0.7 * atkTime, () => { sfx.play('bow'); shot({ x: me.x, z: me.z, yaw, speed: 24, from: 'p', kind: 'arrow', dmg: attackDamage(ST, pct), ...extra }); });
    if (id === 'power') shoot(me.yaw, S.pct(lv), { pierce: lv >= 10 ? 2 : 0 });
    else if (id === 'multi') { const n = S.count(lv); for (let i = 0; i < n; i++) shoot(me.yaw + (i - (n - 1) / 2) * (1.05 / Math.max(1, n - 1)), -30, {}); }
    else if (id === 'frost') shoot(me.yaw, 0, { cold: S.cold(lv), slow: 2, color: '#8ad0ff' });
    else if (id === 'explode') shoot(me.yaw, -40, { boom: { r: S.r, fire: S.fire(lv) }, color: '#ff8a3a' });
    else if (id === 'rain') { me.atkT = atkTime; G.fx.push({ kind: 'rain', x, z, r: S.r, t: 3, tick: 0, pct: S.pct(lv), mesh: areaMarker(x, z, S.r, '#c8d8ff') }); }
    return;
  }
  setAct('cast', spellTime);
  if (id === 'fireball') { const yaw = me.yaw; later(0.22, () => { sfx.play('fire'); shot({ x: me.x, z: me.z, yaw: me.yaw, speed: 15, from: 'p', kind: 'fireball', boom: { r: S.r, fire: S.fire(lv) * ST.spell }, color: '#ff7a2a', yaw }); }); }
  else if (id === 'nova') { sfx.play('frost'); ring(me.x, me.z, '#9ad8ff', S.r); for (const m of G.mobs) if (m.alive && Math.hypot(m.x - me.x, m.z - me.z) < S.r) damageMob(m, S.cold(lv) * ST.spell, 'cold', { slow: 2.5 }); }
  else if (id === 'chain') {
    sfx.play('zap'); let from = { x: me.x, z: me.z }, cur = target && target.alive ? target : nearestTo(x, z, 9, new Set()); const hit = new Set();
    for (let j = 0; j <= S.jumps(lv) && cur; j++) { lightning(from, cur); damageMob(cur, (1 + rnd() * S.light(lv)) * ST.spell, 'light'); hit.add(cur); from = cur; cur = nearestTo(cur.x, cur.z, 7, hit); }
  }
  else if (id === 'teleport') { const d = Math.min(dist, 16); let tx2 = me.x + Math.sin(me.yaw) * d, tz2 = me.z + Math.cos(me.yaw) * d; if (!walkAt(G.L, tx2, tz2) || !reachable(tx2, tz2)) { me.mana += cost; msg(t.cantThere); return; } ring(me.x, me.z, '#c8a0ff', 1.5); me.x = tx2; me.z = tz2; ring(me.x, me.z, '#c8a0ff', 1.5); sfx.play('portal'); }
  else if (id === 'meteor') { sfx.play('fire'); G.fx.push({ kind: 'meteor', x, z, r: S.r, t: 1, fire: S.fire(lv) * ST.spell, mesh: areaMarker(x, z, S.r, '#ff6a2a') }); }
  else if (id === 'shield') { me.buffs.shield = 120; sfx.play('frost'); ring(me.x, me.z, '#9ab8ff', 2); }
}

// ------------------------------------------------------------------ generated skills: each runs by its mechanic (skillgen.js)
const EL_COL = { fire: '#ff7a2a', cold: '#8ad0ff', light: '#ffe25a', poison: '#7aff5a', phys: '#f0e6c8', magic: '#c87aff' };
const SND = { fire: 'fire', cold: 'frost', light: 'zap', poison: 'frost', phys: 'swing', magic: 'portal' };
function runGen(id, S, lv, x, z, target, dist) {
  const el = S.el, col = EL_COL[el], yaw = me.yaw, dmg = () => spellDamage(ST, S, lv), t = tr();
  switch (S.mech) {
    case 'proj': {
      setAct('cast', 0.45); const n = S.count(lv), base = dmg();
      later(0.2, () => { sfx.play(SND[el]); for (let i = 0; i < n; i++) shot({ x: me.x, z: me.z, yaw: yaw + (n > 1 ? (i - (n - 1) / 2) * 0.17 : 0), speed: S.speed, from: 'p', kind: 'spell', color: col, el, sdmg: base, pierce: S.pierce, boom: S.boom ? { r: S.boom, dmg: base * 0.6, el } : null, jumps: S.jumps, homing: S.homing, slow: el === 'cold' ? 1.5 : 0 }); });
      break;
    }
    case 'nova': setAct('cast', 0.45); later(0.18, () => { sfx.play('boom'); ring(me.x, me.z, col, S.r); sparksRing(me.x, me.z, S.r, col); for (const m of G.mobs) if (m.alive && Math.hypot(m.x - me.x, m.z - me.z) < S.r) damageMob(m, dmg(), el, { slow: S.slow, stun: S.stun }); }); break;
    case 'area': setAct('cast', 0.45); sfx.play(SND[el]); G.fx.push({ kind: 'zone', x, z, r: S.r, t: S.delay + (S.ticks > 1 ? 3 : 0) + 0.4, tick: S.delay, left: S.ticks, every: S.ticks > 1 ? 3 / S.ticks : 99, dmg: dmg(), elx: el, col, mesh: areaMarker(x, z, S.r, col) }); break;
    case 'cone': setAct('cast', 0.4); later(0.15, () => { sfx.play(SND[el]); coneFx(yaw, S.range, S.ang, col); for (const m of G.mobs) { if (!m.alive) continue; const d = Math.hypot(m.x - me.x, m.z - me.z); if (d > S.range) continue; const a = Math.atan2(m.x - me.x, m.z - me.z) - yaw; if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < S.ang) damageMob(m, dmg(), el, { slow: S.slow }); } }); break;
    case 'chain': { setAct('cast', 0.4); sfx.play('zap'); let from = { x: me.x, z: me.z }, cur = target && target.alive ? target : nearestTo(x, z, 9, new Set()); const hit = new Set(); for (let j = 0; j <= S.jumps(lv) && cur; j++) { lightning(from, cur, col); damageMob(cur, dmg(), el); hit.add(cur); from = cur; cur = nearestTo(cur.x, cur.z, 7, hit); } break; }
    case 'melee': case 'formstrike': meleeSwing(target, S.pct(lv), { stun: S.stun, cleave: S.cleave, leech: S.leech, hits: S.hits, elDmg: S.elDmg ? S.elDmg(lv) * ST.spell : 0, el }); break;
    case 'bow': {
      const atk = 1 / ST.aps; setAct('attack', atk);
      if (S.rain) { G.fx.push({ kind: 'zone', x, z, r: 4, t: 3.4, tick: 0.3, left: 6, every: 0.45, pct: S.pct(lv), elx: 'phys', col: '#e8d8b0', mesh: areaMarker(x, z, 4, '#c8d8ff') }); break; }
      const n = S.count(lv), ed = S.elDmg ? S.elDmg(lv) * ST.spell * (1 + (ST.elPct[el] || 0) / 100) : 0;
      later(0.7 * atk, () => { sfx.play('bow'); for (let i = 0; i < n; i++) shot({ x: me.x, z: me.z, yaw: yaw + (n > 1 ? (i - (n - 1) / 2) * (1.0 / Math.max(1, n - 1)) : 0), speed: 24, from: 'p', kind: 'arrow', color: el !== 'phys' ? col : null, dmg: attackDamage(ST, S.pct(lv)), edmg: ed, el, pierce: S.pierce, boom: S.boom ? { r: S.boom, dmg: ed * 1.5, el } : null, slow: S.slow }); });
      break;
    }
    case 'dash': me.dash = { yaw, left: S.dist, pct: S.pct(lv), hit: new Set() }; sfx.play('swing'); break;
    case 'teleport': { const d = Math.min(dist, 16), tx2 = me.x + Math.sin(yaw) * d, tz2 = me.z + Math.cos(yaw) * d; if (!walkAt(G.L, tx2, tz2) || !reachable(tx2, tz2)) { me.mana += S.mana(lv); msg(t.cantThere); return; } ring(me.x, me.z, col, 1.5); me.x = tx2; me.z = tz2; ring(me.x, me.z, col, 1.5); sfx.play('portal'); break; }
    case 'buff': case 'form': setAct('cast', 0.4); me.buffs[id] = S.dur; if (S.form) setForm(S.form); ring(me.x, me.z, col, 2.2); sparksRing(me.x, me.z, 1.5, col); sfx.play('frost'); refreshStats(); break;
    case 'curse': setAct('cast', 0.4); sfx.play('door'); ring(x, z, '#b05aff', S.r); for (const m of G.mobs) if (m.alive && Math.hypot(m.x - x, m.z - z) < S.r) { m.cu = m.cu || {}; m.cu[S.curse] = { v: S.val(lv), t: S.dur }; m.cursedT = S.dur; } break;
    case 'heal': setAct('cast', 0.4); me.life = Math.min(ST.life, me.life + S.heal(lv)); for (const a of G.allies) a.hp = Math.min(a.max, a.hp + S.heal(lv)); ring(me.x, me.z, '#7aff8a', 3); sparksRing(me.x, me.z, 2, '#7aff8a'); sfx.play('drink'); break;
    case 'corpse': {
      const c = G.mobs.filter((m) => !m.alive && m.corpse && Math.hypot(m.x - x, m.z - z) < 5).sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z))[0];
      if (!c) { me.mana += S.mana(lv); msg(t.noCorpse); return; }
      setAct('cast', 0.35); useCorpse(c); explode(c.x, c.z, S.r, Math.min(c.max * S.pct(lv) / 100, 60 + lv * 40 + ch().lvl * 30) * (1 + ST.dmgPct / 100), 'fire'); sparksRing(c.x, c.z, S.r, '#ff7a3a');
      break;
    }
    case 'summon': case 'trap': case 'revive': setAct('cast', 0.45); summon(id, S, lv, x, z); break;
  }
}
// a cone of fire, frost or breath laid on the ground in front
function coneFx(yaw, range, ang, color) { const m = new THREE.Mesh(new THREE.CircleGeometry(range, 24, yaw - Math.PI / 2 - ang, ang * 2), fxMat(color, 0.5)); m.material.blending = THREE.AdditiveBlending; m.rotation.x = -Math.PI / 2; m.position.set(me.x, 0.15, me.z); G.group.add(m); G.fx.push({ kind: 'ring', mesh: m, t: 0.3, r: 1, keep: true }); }
function sparksRing(x, z, r, color) { for (let i = 0; i < 10; i++) { const a = i / 10 * 6.28; sparks(x + Math.cos(a) * r * 0.8, 0.6, z + Math.sin(a) * r * 0.8, color, 2); } }
function zoneHit(f) {
  for (let k = 0; k < 3; k++) sparks(f.x + (rnd() - 0.5) * f.r * 1.4, 1.5, f.z + (rnd() - 0.5) * f.r * 1.4, f.col, 3);
  if (f.every > 50) { ring(f.x, f.z, f.col, f.r); sfx.play('boom'); shake = Math.max(shake, 0.15); }
  for (const m of G.mobs) if (m.alive && Math.hypot(m.x - f.x, m.z - f.z) < f.r) { if (f.pct !== undefined) { const d = attackDamage(ST, f.pct); damageMob(m, d.phys, 'phys', { crit: d.crit }); } else damageMob(m, f.dmg, f.elx, { slow: f.elx === 'cold' ? 1.2 : 0 }); }
}
// shapeshifting: the hero turns into a wolf or a bear for the buff's length
function setForm(f) {
  if (me.formMesh) { scene.remove(me.formMesh); me.formMesh = null; }
  me.form = f || null;
  if (f) { me.formMesh = makeMob(f === 'wolf' ? 'a_wolf' : 'a_bear'); me.formMesh.scale.multiplyScalar(1.3); scene.add(me.formMesh); }
}
// ------------------------------------------------------------------ allies: summons, traps, the raised dead
function summon(id, S, lv, x, z) {
  const mine = G.allies.filter((a) => a.src === id), max = S.count(lv), k = 1 + ST.minion / 100;
  const make = (model, px, pz, extra = {}) => ({ src: id, model, x: px, z: pz, hp: S.ahp(lv) * k, max: S.ahp(lv) * k, dmg: S.adm(lv) * k * ST.spell, el: S.el === 'phys' ? 'phys' : S.el, t: S.dur || 0, dur: S.dur || 0, cd: rnd(), speed: MOBS[model].speed ?? 4, ranged: !!MOBS[model].ranged, yaw: me.yaw, ...extra });
  if (S.mech === 'revive') {
    const cs = G.mobs.filter((m) => !m.alive && m.corpse && !m.boss && Math.hypot(m.x - x, m.z - z) < 9).slice(0, Math.max(0, max - mine.length));
    if (!cs.length) { msg(tr().noCorpse); return; }
    for (const c of cs) { useCorpse(c); G.allies.push(make(c.id, c.x, c.z, { speed: MOBS[c.id].speed, ranged: MOBS[c.id].ai === 'ranged' || MOBS[c.id].ai === 'caster' })); ring(c.x, c.z, '#b05aff', 1.2); }
    sfx.play('door'); return;
  }
  // timed summons are called anew; lasting ones (the necromancer's) add up to the limit
  if (S.dur) for (const a of mine) dropAlly(a);
  const have = S.dur ? 0 : mine.length;
  const model = 'a_' + S.ally, at = S.mech === 'trap' ? [x, z] : [me.x, me.z];
  for (let i = have; i < max; i++) { const a = rnd() * 6.28, rr = S.mech === 'trap' ? 1.2 + i * 0.6 : 1.5; const [px, pz] = collide(G.L, at[0] + Math.cos(a) * rr, at[1] + Math.sin(a) * rr, 0.4); G.allies.push(make(model, px, pz)); }
  ring(at[0], at[1], '#9affc8', 2); sfx.play('portal');
}
function useCorpse(c) { c.corpse = false; if (c.mesh) { G.group.remove(c.mesh); c.mesh = null; } }
function dropAlly(a) { if (a.mesh) G.group.remove(a.mesh); a.mesh = null; G.allies.splice(G.allies.indexOf(a), 1); }
function updateAllies(dt) {
  for (let i = G.allies.length - 1; i >= 0; i--) {
    const a = G.allies[i];
    if (a.dur && (a.t -= dt) <= 0 || a.hp <= 0) { if (a.hp <= 0 && a.mesh) sparks(a.x, 1, a.z, '#c8c8c8', 8); dropAlly(a); continue; }
    if (!a.mesh || a.mesh.parent !== G.group) { a.mesh = makeMob(a.model); G.group.add(a.mesh); if (Math.hypot(a.x - me.x, a.z - me.z) > 20 || !walkAt(G.L, a.x, a.z)) { a.x = me.x + (rnd() - 0.5) * 3; a.z = me.z + (rnd() - 0.5) * 3; } }
    a.cd -= dt; a.actT = (a.actT || 0) + dt; let moving = 0;
    const go = (tx2, tz2, sp) => { if (!a.speed) return; const dx = tx2 - a.x, dz = tz2 - a.z, d = Math.hypot(dx, dz) || 1, st = Math.min(d, sp * dt); [a.x, a.z] = collide(G.L, a.x + dx / d * st, a.z + dz / d * st, 0.4); a.yaw = Math.atan2(dx, dz); moving = 1; };
    let tg = a.target && a.target.alive && Math.hypot(a.target.x - a.x, a.target.z - a.z) < 12 ? a.target : null;
    if (!tg && G.area === 'dun') { let bd = a.speed ? 10 : 9; for (const m of G.mobs) { if (!m.alive) continue; const d = Math.hypot(m.x - a.x, m.z - a.z); if (d < bd && Math.hypot(m.x - me.x, m.z - me.z) < 16 && sees(G.L, a.x, a.z, m.x, m.z)) { bd = d; tg = m; } } }
    a.target = tg;
    if (tg) {
      const d = Math.hypot(tg.x - a.x, tg.z - a.z), range = a.ranged ? 8.5 : 1.3 + MOBS[a.model].size * 0.5;
      if (d > range) go(tg.x, tg.z, a.speed);
      else if (a.cd <= 0) {
        a.cd = a.ranged ? 1.5 : 1.1; a.act = 'attack'; a.actT = 0; a.yaw = Math.atan2(tg.x - a.x, tg.z - a.z);
        if (a.ranged) shot({ x: a.x, z: a.z, yaw: a.yaw, speed: 15, from: 'a', kind: 'spell', color: EL_COL[a.el] || '#c87aff', el: a.el, sdmg: a.dmg });
        else later(0.15, () => { if (tg.alive) damageMob(tg, a.dmg, a.el, {}); });
      }
    } else {
      const k = i * 2.1, fx = me.x + Math.cos(k) * 2.4, fz = me.z + Math.sin(k) * 2.4, d = Math.hypot(fx - a.x, fz - a.z);
      if (Math.hypot(me.x - a.x, me.z - a.z) > 24) { a.x = fx; a.z = fz; } else if (d > 1.2) go(fx, fz, a.speed * (d > 7 ? 1.7 : 1));
    }
    a.mesh.position.set(a.x, 0, a.z); a.mesh.rotation.y = angLerp(a.mesh.rotation.y, a.yaw, 1 - Math.exp(-dt * 12));
    animate(a.mesh, dt, moving, a.act && a.actT < 0.6 ? a.act : '', a.actT, 0.6, 0);
  }
}
// who a monster goes for: you, or one of your allies if it is clearly closer
function mobTarget(m) {
  let tg = me, best = me.dead ? 1e9 : Math.hypot(me.x - m.x, me.z - m.z);
  for (const a of G.allies) { const d = Math.hypot(a.x - m.x, a.z - m.z); if (d + 1 < best) { best = d; tg = a; } }
  return tg;
}

const reach = (m) => 1.2 + MOBS[m.id].size * 0.6;
function reachable(x, z) { const f = field(G.L, toT(me.x), toT(me.z)); return f[toT(z) * G.L.N + toT(x)] >= 0; }
function nearestTo(x, z, r, skip) { let b = null, bd = r; for (const m of G.mobs) { if (!m.alive || skip.has(m)) continue; const d = Math.hypot(m.x - x, m.z - z); if (d < bd) { bd = d; b = m; } } return b; }
function setAct(a, t) { me.act = a; me.actT = 0; me.atkT = t; me.actDur = t; }
// do something partway through the current act (the strike of a swing, the release of an arrow or spell)
const later = (t, fn) => me.queue.push({ t, fn });
function meleeSwing(m, pct = 0, opts = {}) {
  setAct('attack', 1 / ST.aps); later(0.38 / ST.aps, () => { sfx.play('swing'); slash(me.yaw); });
  me.pending = { m, pct, opts, t: 0.45 / ST.aps };
}
function slash(yaw, color = '#fff4d0', r = 1.9) {
  // a flat arc whose middle points along the group's +Z, turned to face where the hero swings
  const arc = new THREE.Mesh(new THREE.RingGeometry(r * 0.45, r, 24, 1, -Math.PI / 2 - 0.9, 1.8), fxMat(color, 0.75)); arc.material.blending = THREE.AdditiveBlending;
  arc.rotation.x = -Math.PI / 2;
  const m = new THREE.Group(); m.add(arc); m.rotation.y = yaw; m.position.set(me.x, 1.05, me.z); m.material = arc.material;
  G.group.add(m); G.fx.push({ kind: 'slash', mesh: m, t: 0.16 });
}
const sparkGeo = new THREE.BoxGeometry(0.09, 0.09, 0.09);
function sparks(x, y, z, color, n = 8) {
  const mm = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending });
  for (let i = 0; i < n; i++) { const p = new THREE.Mesh(sparkGeo, mm); p.position.set(x, y, z); G.group.add(p); const a = rnd() * 6.28, sp = 2 + rnd() * 4; G.fx.push({ kind: 'spark', mesh: p, t: 0.3 + rnd() * 0.2, vx: Math.cos(a) * sp, vy: 2 + rnd() * 3, vz: Math.sin(a) * sp }); }
}
function basicAttack(m) {
  me.yaw = Math.atan2(m.x - me.x, m.z - me.z);
  if (me.form) { meleeSwing(m, me.form === 'bear' ? 40 : 10); return; }
  if (ST.bow) { setAct('attack', 1 / ST.aps); later(0.7 / ST.aps, () => { sfx.play('bow'); shot({ x: me.x, z: me.z, yaw: me.yaw, speed: 24, from: 'p', kind: 'arrow', dmg: attackDamage(ST, 0) }); }); return; }
  if (ch().cls === 'sorc' && ST.weapon && BASES[ST.weapon.base].type === 'wand') { setAct('cast', 1 / ST.aps); later(0.5 / ST.aps, () => shot({ x: me.x, z: me.z, yaw: me.yaw, speed: 18, from: 'p', kind: 'bolt', dmg: attackDamage(ST, 0), color: '#c87aff' })); return; }
  meleeSwing(m, 0);
}
// projectiles
function shot(o) {
  const color = o.color || (o.kind === 'arrow' ? '#e8d8b0' : o.kind === 'fireball' || o.kind === 'firebolt' ? '#ff7a2a' : o.kind === 'bolt' ? '#ffe25a' : '#c8c8c8');
  const mesh = o.kind === 'arrow' ? new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 4), glow(color, 0.6)) : new THREE.Mesh(new THREE.SphereGeometry(o.kind === 'fireball' ? 0.32 : o.kind === 'spell' ? 0.26 : 0.2, 10, 8), glow(color, 2.5));
  if (o.kind === 'arrow') mesh.rotation.set(Math.PI / 2, o.yaw, 0, 'YXZ');
  mesh.position.set(o.x, 1.1, o.z); G.group.add(mesh);
  G.shots.push({ ...o, vx: Math.sin(o.yaw) * o.speed, vz: Math.cos(o.yaw) * o.speed, life: 1.4, mesh, hitSet: new Set() });
}
function explode(x, z, r, dmg, el) { ring(x, z, EL_COL[el] || '#ff8a3a', r); sfx.play('boom'); for (const m of G.mobs) if (m.alive && Math.hypot(m.x - x, m.z - z) < r + 0.4) damageMob(m, dmg, el); }

// ------------------------------------------------------------------ effects
const fxMat = (c, o = 0.6) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, side: THREE.DoubleSide });
function ring(x, z, color, r) { const m = new THREE.Mesh(new THREE.RingGeometry(0.75, 1, 32), fxMat(color, 0.8)); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.12, z); G.group.add(m); G.fx.push({ kind: 'ring', mesh: m, t: 0.45, r }); }
function areaMarker(x, z, r, color) { const m = new THREE.Mesh(new THREE.CircleGeometry(r, 32), fxMat(color, 0.22)); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.08, z); G.group.add(m); return m; }
function lightning(a, b, color = '#fff4a0') { const pts = []; for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push(new THREE.Vector3(a.x + (b.x - a.x) * t + (i && i < 6 ? (rnd() - 0.5) * 0.8 : 0), 1.2 + (i && i < 6 ? (rnd() - 0.5) * 0.6 : 0), a.z + (b.z - a.z) * t + (i && i < 6 ? (rnd() - 0.5) * 0.8 : 0))); } const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color })); G.group.add(l); G.fx.push({ kind: 'flash', mesh: l, t: 0.18 }); }
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
  G.exitPortal = { x, z, armed: Math.hypot(me.x - x, me.z - z) > 2.5 };   // it only takes you once you have stepped away and come back
}
function townPortal() {
  const c = ch(), t = tr();
  if (G.area !== 'dun' || me.dead) return;
  if (c.tp <= 0) { msg(t.noTp); return; }
  c.tp--; G.townPortal = { key: G.key, act: G.act, depth: G.depth, x: me.x, z: me.z }; changed();
  sfx.play('portal'); enterTown(true);
}

// ------------------------------------------------------------------ the paper doll: the hero in everything they wear, turning slowly (drag to turn)
const doll = { r: null, scene: null, cam: null, hero: null, key: '', yaw: 0.5, drag: null };
function mountDoll(host) {
  if (!host) return;
  if (!doll.r) {
    try { doll.r = new THREE.WebGLRenderer({ antialias: true, alpha: true }); } catch (e) { return; }
    doll.r.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    doll.scene = new THREE.Scene(); doll.scene.add(new THREE.HemisphereLight('#fff2d8', '#4a3a2a', 1.3));
    const d = new THREE.DirectionalLight('#fff0d8', 1.7); d.position.set(2, 4, 4); doll.scene.add(d);
    doll.cam = new THREE.PerspectiveCamera(26, 1, 0.1, 50); doll.cam.position.set(0, 1.25, 5.3); doll.cam.lookAt(0, 1.02, 0);
    const cv = doll.r.domElement; cv.className = 'dollcv';
    cv.addEventListener('pointerdown', (e) => { doll.drag = e.clientX; try { cv.setPointerCapture(e.pointerId); } catch (er) { /* fine */ } });
    cv.addEventListener('pointermove', (e) => { if (doll.drag !== null) { doll.yaw += (e.clientX - doll.drag) * 0.012; doll.drag = e.clientX; } });
    cv.addEventListener('pointerup', () => { doll.drag = null; }); cv.addEventListener('pointercancel', () => { doll.drag = null; });
  }
  host.appendChild(doll.r.domElement);
  const w = host.clientWidth || 140, h = host.clientHeight || 220; doll.r.setSize(w, h, false); doll.cam.aspect = w / h; doll.cam.updateProjectionMatrix();
  const c = ch(), key = c.cls + Object.values(c.equip).map((it) => (it ? it.uid : '-')).join();
  if (key !== doll.key) { if (doll.hero) doll.scene.remove(doll.hero); doll.hero = makeHero(c.cls, c.equip); doll.scene.add(doll.hero); doll.key = key; }
}
function drawDoll(dt) {
  if (!doll.r || !doll.hero || !doll.r.domElement.isConnected) return;
  if (doll.drag === null) doll.yaw += dt * 0.5;
  doll.hero.rotation.y = doll.yaw; animate(doll.hero, dt, 0, '', 0, 1, 0);
  doll.r.render(doll.scene, doll.cam);
}
// ------------------------------------------------------------------ the loop
let last = performance.now(), hudT = 0, titleN = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
  pollPad(dt);
  if (hitStop > 0) { hitStop -= dt; }
  if (started) update(hitStop > 0 ? dt * 0.06 : dt, now);
  if (started || (titleN++ % 6) === 0) composer.render();
  if (win === 'inv' || win === 'char') drawDoll(dt);
}
function update(dt, now) {
  const c = ch(), L = G.L;
  for (const k of Object.keys(me.cds)) me.cds[k] = Math.max(0, me.cds[k] - dt);
  for (const k of Object.keys(me.buffs)) { const was = me.buffs[k]; me.buffs[k] = Math.max(0, was - dt); if (was > 0 && me.buffs[k] === 0) { if (SKILLS[k] && SKILLS[k].form) setForm(null); if (SKILLS[k] && SKILLS[k].gen) refreshStats(); } }
  me.atkT = Math.max(0, me.atkT - dt); me.actT += dt; me.inv = Math.max(0, me.inv - dt); me.hitT = Math.max(0, (me.hitT || 0) - dt);
  if (!me.dead) {
    // regeneration and potions over time
    me.life = Math.min(ST.life, me.life + ST.regen * dt + (me.potHeal > 0 ? Math.min(me.potHeal, me.potHealRate * dt) : 0)); if (me.potHeal > 0) me.potHeal -= me.potHealRate * dt;
    me.mana = Math.min(ST.mana, me.mana + (ST.mana * 0.018 + ST.ene * 0.02) * dt + (me.potMana > 0 ? Math.min(me.potMana, me.potManaRate * dt) : 0)); if (me.potMana > 0) me.potMana -= me.potManaRate * dt;
    updateHero(dt);
  }
  if (G.area === 'dun') updateMobs(dt);
  updateAllies(dt); updateShots(dt); updateFx(dt);
  // pick up gold and potions you walk over; open urns and chests you touch
  for (const d of [...G.drops]) { const dd = Math.hypot(d.x - me.x, d.z - me.z); if ((d.kind !== 'item' && dd < 0.9) || (me.pickup === d && dd < 1.2)) { if (me.pickup === d) me.pickup = null; pickUp(d); } if (d.mesh) d.mesh.children.forEach((o) => { if (o.userData.spin) o.rotation.y += dt * 2; }); }
  for (const p of G.props) if (!p.done && Math.hypot(p.x - me.x, p.z - me.z) < 1.4) openProp(p);
  // places to go
  if (G.area === 'dun') {
    if (G.stairs && Math.hypot(G.stairs.x - me.x, G.stairs.z - me.z) < 1.2) enterLevel(G.act, G.depth + 1, 'down');
    else if (G.up && Math.hypot(G.up.x - me.x, G.up.z - me.z) < 1.1) { if (G.depth === 0) enterTown(false); else enterLevel(G.act, G.depth - 1, 'up'); }
    else if (G.portal && Math.hypot(G.portal.x - me.x, G.portal.z - me.z) < 1.1 && me.moveTo) { G.townPortal = null; enterTown(false); }
    else if (G.exitPortal && !G.exitPortal.armed && Math.hypot(G.exitPortal.x - me.x, G.exitPortal.z - me.z) > 2.5) G.exitPortal.armed = true;
    else if (G.exitPortal && G.exitPortal.armed && Math.hypot(G.exitPortal.x - me.x, G.exitPortal.z - me.z) < 1.2) { if (G.act < 2) enterLevel(G.act + 1, 0, 'start'); else { G.townPortal = null; enterTown(false); } }
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
  me.speedShown = me.speed;
  me.hitK = Math.max(0, me.hitK - dt * 5);
  animate(me.mesh, dt, me.speed, me.act && me.actT < me.actDur ? me.act : '', me.actT, me.actDur, me.hitK);
  me.mesh.visible = !me.dead && !me.form;
  if (me.formMesh) { me.formMesh.position.copy(me.mesh.position); me.formMesh.rotation.y = me.mesh.rotation.y; animate(me.formMesh, dt, me.speed, me.act && me.actT < me.actDur ? me.act : '', me.actT, me.actDur, me.hitK); me.formMesh.visible = !me.dead; }
  // camera
  if (keys.has('KeyZ')) camYaw += dt * 2; if (keys.has('KeyX')) camYaw -= dt * 2;
  const dist = 15 * camZoom, pitch = 0.98;
  shake = Math.max(0, shake - dt * 1.6); const sx = (rnd() - 0.5) * shake, sy = (rnd() - 0.5) * shake;
  camera.position.set(me.x + Math.sin(camYaw) * Math.cos(pitch) * dist + sx, Math.sin(pitch) * dist + 1 + sy, me.z + Math.cos(camYaw) * Math.cos(pitch) * dist); camera.lookAt(me.x + sx * 0.5, 1, me.z);
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
const angLerp = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
function updateHero(dt) {
  const L = G.L;
  for (let i = me.queue.length - 1; i >= 0; i--) { const q = me.queue[i]; if ((q.t -= dt) <= 0) { me.queue.splice(i, 1); q.fn(); } }
  if (me.buffer && (me.buffer.t -= dt) < -0.6) me.buffer = null;
  if (me.buffer && me.atkT <= 0 && !me.leap && !(me.whirl > 0)) { const b = me.buffer; me.buffer = null; cast(b.id, b.target && b.target.alive ? b.target.x : b.x, b.target && b.target.alive ? b.target.z : b.z, b.target && b.target.alive ? b.target : null); }
  if (me.atkT <= 0 && !me.leap) me.yaw = angLerp(me.yaw, me.yawT, 1 - Math.exp(-dt * 18)); else me.yawT = me.yaw;
  const wasMoving = me.speed > 0;
  if (me.pending && (me.pending.t -= dt) <= 0) {
    const { m, pct, opts } = me.pending; me.pending = null;
    const strike = (x) => {
      if (!(x && x.alive)) return;
      if (rnd() < hitChance(ST, ch().lvl, x.def)) { const d = attackDamage(ST, pct); const dealt = damageMob(x, d.phys, 'phys', { ...opts, crit: d.crit, melee: true }); if (d.fire) damageMob(x, d.fire, 'fire'); if (opts.elDmg) damageMob(x, opts.elDmg, opts.el); if (opts.leech) me.life = Math.min(ST.life, me.life + dealt * opts.leech / 100); sfx.play('thud'); }
      else floatText(x.x, x.z, 'Miss', '#c8c8c8');
    };
    if (m && m.alive && Math.hypot(m.x - me.x, m.z - me.z) < reach(m) + 0.8) {
      for (let h = 0; h < (opts.hits || 1); h++) { if (h === 0) strike(m); else later(h * 0.13, () => { strike(m); slash(me.yaw + (h % 2 ? 0.5 : -0.5)); }); }
      if (opts.cleave) for (const o of G.mobs) { if (o === m || !o.alive) continue; const d = Math.hypot(o.x - me.x, o.z - me.z), a = Math.atan2(o.x - me.x, o.z - me.z) - me.yaw; if (d < opts.cleave + 0.6 && Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 1.3) strike(o); }
    }
  }
  if (me.dash) {
    const D = me.dash, st = Math.min(D.left, 20 * dt); D.left -= st;
    const [nx, nz] = collide(L, me.x + Math.sin(D.yaw) * st, me.z + Math.cos(D.yaw) * st, 0.45); const blocked = Math.hypot(nx - me.x, nz - me.z) < st * 0.3; me.x = nx; me.z = nz;
    for (const m of G.mobs) if (m.alive && !D.hit.has(m) && Math.hypot(m.x - me.x, m.z - me.z) < 1.6) { D.hit.add(m); const d = attackDamage(ST, D.pct); damageMob(m, d.phys, 'phys', { crit: d.crit, melee: true, knock: 1.5 }); }
    if (D.left <= 0 || blocked) me.dash = null; me.speed = 1.5; return;
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
    if (me.whirlHit <= 0) { me.whirlHit = 0.3; slash(me.mesh.rotation.y, '#ffe8a0', 2.8); const lv = ST.sl('whirl'); for (const m of G.mobs) if (m.alive && Math.hypot(m.x - me.x, m.z - me.z) < SKILLS.whirl.r) { const dd = attackDamage(ST, SKILLS.whirl.pct(lv)); damageMob(m, dd.phys, 'phys', { crit: dd.crit, melee: true }); } sfx.play('swing'); }
    me.speed = 1; return;
  }
  // holding the mouse keeps you walking / attacking toward the cursor
  // holding the button: the monster under the cursor becomes the target, so you can sweep from one to the next
  if (!isTouch && mouse.down && !winOpen() && me.target) { const hov = mobAtScreen(mouse.x, mouse.y); if (hov && hov !== me.target) me.target = hov; }
  if (!isTouch && mouse.down && !winOpen() && !me.target && !me.pickup) { const [gx, gz] = groundAt(mouse.x, mouse.y); if (Math.hypot(gx - me.x, gz - me.z) > 0.6) { me.moveTo = { x: gx, z: gz }; me.path = null; } }
  if (!isTouch && mouse.rdown && ch().rmb && me.atkT <= 0) castAtCursor(ch().rmb);
  // WASD or the stick: move relative to the camera
  let mx = stick.mx + pad.mx, mz = stick.mz + pad.mz;
  if (!winOpen()) { if (keys.has('KeyW') || keys.has('ArrowUp')) mz -= 1; if (keys.has('KeyS') || keys.has('ArrowDown')) mz += 1; if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1; if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1; }
  me.ramp = wasMoving ? Math.min(1, me.ramp + dt * 7) : 0.35;
  const sp = 5.4 * (1 + ST.fr / 100) * me.ramp;
  me.speed = 0;
  if (Math.hypot(mx, mz) > 0.15 && me.atkT <= 0) {
    const cy = Math.cos(camYaw), sy = Math.sin(camYaw), wx = mx * cy + mz * sy, wz = -mx * sy + mz * cy, n = Math.hypot(wx, wz);
    [me.x, me.z] = collide(L, me.x + wx / n * sp * dt * Math.min(1, n), me.z + wz / n * sp * dt * Math.min(1, n), 0.45); me.yawT = Math.atan2(wx, wz); me.speed = Math.min(1, n); me.moveTo = null; if (!pad.attacking) me.target = null; return;
  }
  // a target: walk into reach, then attack
  if (me.target) {
    const m = me.target;
    if (!m.alive) { me.target = null; }
    else {
      const d = Math.hypot(m.x - me.x, m.z - me.z), range = ST.bow || (ch().cls === 'sorc' && ST.weapon && BASES[ST.weapon.base].type === 'wand') ? 14 : reach(m);
      if (d <= range && (range < 3 || sees(L, me.x, me.z, m.x, m.z))) { if (me.atkT <= 0) { if (me.queued) { const q = me.queued; me.queued = null; cast(q, m.x, m.z, m); } else { basicAttack(m); if (!holdingAttack()) me.target = null; } } return; }
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
    me.x = cx; me.z = cz; me.yawT = Math.atan2(dx, dz); me.speed = 1;
  }
}
function updateMobs(dt) {
  const L = G.L;
  G.fieldT -= dt;
  if (G.fieldT <= 0) { G.fieldT = 0.3; G.field = field(L, toT(me.x), toT(me.z)); }
  for (const m of G.mobs) {
    if (!m.alive) { if (m.mesh && m.dieT > 0) { m.dieT -= dt; m.mesh.rotation.z = Math.min(1.5, (1 - m.dieT) * 3); m.mesh.position.y = -Math.max(0, 0.4 - m.dieT) * 2; } continue; }
    if (!m.mesh) continue;
    m.cd -= dt; m.stun = Math.max(0, m.stun - dt); m.slow = Math.max(0, m.slow - dt); m.hitT = Math.max(0, (m.hitT || 0) - dt); m.actT += dt;
    if (m.cu) for (const [k, c] of Object.entries(m.cu)) { if ((c.t -= dt) <= 0) delete m.cu[k]; else if (k === 'dot') { c.acc = (c.acc || 0) + dt; if (c.acc >= 0.5) { c.acc = 0; damageMob(m, c.v * 0.5, 'poison', { dot: true }); } } }
    if (m.dots && m.dots.length) { m.dotAcc = (m.dotAcc || 0) + dt; if (m.dotAcc >= 0.5) { let sum = 0; for (const q of m.dots) { sum += q.dps * Math.min(0.5, q.t); q.t -= 0.5; } m.dots = m.dots.filter((q) => q.t > 0); m.dotAcc = 0; if (sum > 0) damageMob(m, sum, 'poison', { dot: true }); } }
    if (!m.alive) continue;
    const tg = mobTarget(m), d = Math.hypot(tg.x - m.x, tg.z - m.z);
    if (!m.aggro && Math.hypot(me.x - m.x, me.z - m.z) < (m.boss ? 16 : 11) && sees(L, m.x, m.z, me.x, me.z)) { m.aggro = true; for (const o of G.mobs) if (o.alive && !o.aggro && Math.hypot(o.x - m.x, o.z - m.z) < 7) o.aggro = true; }
    let moving = 0;
    if (m.aggro && !m.stun && !me.dead && G.area === 'dun') {
      const sp = m.speed * (m.slow > 0 ? 0.5 : 1) * (m.cu && m.cu.slow ? 1 - m.cu.slow.v / 100 : 1) * dt, R = 0.9 + MOBS[m.id].size * 0.6;
      const goTo = (tx2, tz2) => { let nx = tx2, nz = tz2; if (!sees(L, m.x, m.z, tx2, tz2) && G.field) { const s = stepOn(L, G.field, m.x, m.z); if (s) [nx, nz] = s; } const dx = nx - m.x, dz = nz - m.z, dd = Math.hypot(dx, dz) || 1; [m.x, m.z] = collide(L, m.x + dx / dd * Math.min(sp, dd), m.z + dz / dd * Math.min(sp, dd), 0.4 * MOBS[m.id].size); m.yaw = Math.atan2(dx, dz); moving = 1; };
      if (m.charging > 0) { m.charging -= dt; const vx = Math.sin(m.yaw) * m.speed * 3 * dt, vz = Math.cos(m.yaw) * m.speed * 3 * dt; [m.x, m.z] = collide(L, m.x + vx, m.z + vz, 0.4); moving = 1.5; if (d < R && !m.chargeHit) { m.chargeHit = true; mobHits(m, 1.4, tg); } }
      else if (m.ai === 'boss') (tg === me ? bossAI(m, d, dt, goTo) : (d > R ? goTo(tg.x, tg.z) : m.cd <= 0 && ((m.cd = 1.5), (m.swing = 0.4), (m.act = 'attack'), (m.actT = 0))));
      else if (m.ai === 'ranged' || m.ai === 'caster') {
        if (d > 9 || !sees(L, m.x, m.z, tg.x, tg.z)) goTo(tg.x, tg.z);
        else if (d < 4.5) { const a = Math.atan2(m.x - tg.x, m.z - tg.z); goTo(m.x + Math.sin(a) * 2, m.z + Math.cos(a) * 2); }
        if (m.cd <= 0 && d < 12 && sees(L, m.x, m.z, tg.x, tg.z)) { m.cd = 1.8 + rnd() * 0.6; m.yaw = Math.atan2(tg.x - m.x, tg.z - m.z); m.act = 'attack'; m.actT = 0; shot({ x: m.x, z: m.z, yaw: m.yaw, speed: MOBS[m.id].shot === 'arrow' ? 15 : 11, from: 'm', kind: MOBS[m.id].shot, dmgM: m.dmg, el: m.ai === 'caster' ? m.el : null, mlvl: m.mlvl }); }
      } else if (m.ai === 'charger' && d > 3.5 && d < 9 && m.cd <= 0 && sees(L, m.x, m.z, tg.x, tg.z)) { m.cd = 3.5; m.charging = 0.7; m.chargeHit = false; m.yaw = Math.atan2(tg.x - m.x, tg.z - m.z); }
      else if (d > R) goTo(tg.x, tg.z);
      else if (m.cd <= 0) { m.cd = 1.3 + rnd() * 0.5; m.act = 'attack'; m.actT = 0; m.actDur = 0.75; m.yaw = Math.atan2(tg.x - m.x, tg.z - m.z); m.swing = 0.75 * 0.46; }
      if (m.swing > 0 && (m.swing -= dt) <= 0 && d < R + 0.6) mobHits(m, 1, tg);
    }
    // keep monsters from stacking
    for (const o of G.mobs) { if (o === m || !o.alive) continue; const dx = m.x - o.x, dz = m.z - o.z, dd = Math.hypot(dx, dz), want = 0.5 * (MOBS[m.id].size + MOBS[o.id].size); if (dd < want && dd > 0.001) { const push = (want - dd) * 0.5; [m.x, m.z] = collide(L, m.x + dx / dd * push, m.z + dz / dd * push, 0.4); } }
    if (m.kx || m.kz) { [m.x, m.z] = collide(L, m.x + m.kx * dt, m.z + m.kz * dt, 0.4); const f = Math.exp(-dt * 12); m.kx *= f; m.kz *= f; if (Math.abs(m.kx) + Math.abs(m.kz) < 0.05) m.kx = m.kz = 0; }
    m.squash = Math.max(0, (m.squash || 0) - dt * 7); m.hitK = Math.max(0, (m.hitK || 0) - dt * 5);
    const base = MOBS[m.id].size * (m.champ || m.unique ? 1.15 : 1), q = m.squash;
    m.mesh.scale.set(base * (1 + 0.18 * q), base * (1 - 0.14 * q), base * (1 + 0.18 * q));
    m.mesh.position.set(m.x, 0, m.z); m.mesh.rotation.y = angLerp(m.mesh.rotation.y, m.yaw, 1 - Math.exp(-dt * 14));
    animate(m.mesh, dt, moving * (m.slow > 0 ? 0.5 : 1), m.act && m.actT < (m.actDur || 0.6) ? m.act : '', m.actT, m.actDur || 0.6, m.hitK);
  }
}
function mobHits(m, k, tg = me) {
  if (G.area !== 'dun') return;
  const weak = m.cu && m.cu.weak ? 1 - m.cu.weak.v / 100 : 1;
  if (tg !== me) { if (tg.hp > 0) { tg.hp -= m.dmg * k * weak; sparks(tg.x, 1, tg.z, '#ff8a6a', 5); } return; }
  k *= weak;
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
  else if (m.cd <= 0) { m.cd = 1.5; m.act = 'attack'; m.actT = 0; m.actDur = 0.95; m.yaw = Math.atan2(me.x - m.x, me.z - m.z); m.swing = 0.95 * 0.46; }
  if (m.swing > 0 && (m.swing -= dt) <= 0 && d < R + 0.8) mobHits(m, 1.6);
}
function updateShots(dt) {
  const L = G.L;
  for (let i = G.shots.length - 1; i >= 0; i--) {
    const s = G.shots[i]; s.life -= dt;
    const nx = s.x + s.vx * dt, nz = s.z + s.vz * dt;
    if (s.homing) { let best = null, bd = 9; for (const m of G.mobs) { if (!m.alive || s.hitSet.has(m)) continue; const d = Math.hypot(m.x - s.x, m.z - s.z); if (d < bd) { bd = d; best = m; } } if (best) { const want = Math.atan2(best.x - s.x, best.z - s.z), cur = Math.atan2(s.vx, s.vz), nyaw = angLerp(cur, want, Math.min(1, dt * 4)), sp = Math.hypot(s.vx, s.vz); s.vx = Math.sin(nyaw) * sp; s.vz = Math.cos(nyaw) * sp; } }
    let done = s.life <= 0 || !walkAt(L, nx, nz);
    s.x = nx; s.z = nz; s.mesh.position.set(s.x, 1.1, s.z);
    if (!done && (s.from === 'p' || s.from === 'a')) {
      for (const m of G.mobs) {
        if (!m.alive || s.hitSet.has(m) || Math.hypot(m.x - s.x, m.z - s.z) > 0.55 + MOBS[m.id].size * 0.4) continue;
        s.hitSet.add(m);
        if (s.kind === 'spell') {
          damageMob(m, s.sdmg, s.el, { slow: s.slow });
          if (s.boom) explode(s.x, s.z, s.boom.r, s.boom.dmg, s.boom.el);
          if (s.jumps) { let from = m, cur = nearestTo(m.x, m.z, 7, s.hitSet); for (let j = 0; j < s.jumps && cur; j++) { lightning(from, cur, s.color); damageMob(cur, s.sdmg * 0.8, s.el); s.hitSet.add(cur); from = cur; cur = nearestTo(cur.x, cur.z, 7, s.hitSet); } }
          if (!s.pierce || s.pierce-- <= 0) { done = true; break; } continue;
        }
        if (s.boom) { explode(s.x, s.z, s.boom.r, s.boom.dmg ?? s.boom.fire, s.boom.el || 'fire'); if (s.dmg) damageMob(m, s.dmg.phys, 'phys', { crit: s.dmg.crit }); done = true; break; }
        if (rnd() < hitChance(ST, ch().lvl, m.def)) { damageMob(m, s.dmg.phys, 'phys', { crit: s.dmg.crit, slow: s.slow }); if (s.dmg.fire) damageMob(m, s.dmg.fire, 'fire'); if (s.cold) damageMob(m, s.cold, 'cold', { slow: 2 }); if (s.edmg) damageMob(m, s.edmg, s.el, { slow: s.slow }); } else floatText(m.x, m.z, 'Miss', '#c8c8c8');
        if (!s.pierce || s.pierce-- <= 0) { done = true; break; }
      }
    } else if (!done && s.from === 'm' && G.allies.some((a) => Math.hypot(a.x - s.x, a.z - s.z) < 0.8)) { const a = G.allies.find((x) => Math.hypot(x.x - s.x, x.z - s.z) < 0.8); a.hp -= s.dmgM; sparks(a.x, 1, a.z, '#ff8a6a', 4); done = true;
    } else if (!done && s.from === 'm' && Math.hypot(me.x - s.x, me.z - s.z) < 0.7) { if (rnd() < mobHitChance(ST, s.mlvl) || s.el) hurtMe(s.dmgM, s.el, null); done = true; }
    if (done) { if (s.boom && s.life > 0 && s.from === 'p' && !s.hitSet.size) explode(s.x, s.z, s.boom.r, s.boom.dmg ?? s.boom.fire, s.boom.el || 'fire'); G.group.remove(s.mesh); G.shots.splice(i, 1); }
  }
}
function updateFx(dt) {
  for (let i = G.fx.length - 1; i >= 0; i--) {
    const f = G.fx[i]; f.t -= dt;
    if (f.kind === 'ring') { if (f.keep) f.mesh.material.opacity = f.t / 0.3 * 0.5; else { const k = 1 - f.t / 0.45; f.mesh.scale.setScalar(Math.max(0.05, k) * f.r); f.mesh.material.opacity = 0.8 * (1 - k); } }
    else if (f.kind === 'text') { f.y += dt * 1.6; _v.set(f.x, f.y, f.z).project(camera); f.el.style.transform = `translate(${(_v.x + 1) / 2 * innerWidth}px, ${(1 - _v.y) / 2 * innerHeight}px) translate(-50%, -50%)`; f.el.style.opacity = Math.min(1, f.t * 2); }
    else if (f.kind === 'rain') { f.tick -= dt; if (f.tick <= 0) { f.tick = 0.37; for (const m of G.mobs) if (m.alive && Math.hypot(m.x - f.x, m.z - f.z) < f.r) { const d = attackDamage(ST, f.pct); damageMob(m, d.phys, 'phys', { crit: d.crit }); } for (let k = 0; k < 6; k++) { const a = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 4), glow('#e8d8b0', 0.6)); a.position.set(f.x + (rnd() - 0.5) * f.r * 1.6, 3, f.z + (rnd() - 0.5) * f.r * 1.6); G.group.add(a); G.fx.push({ kind: 'fall', mesh: a, t: 0.25 }); } } }
    else if (f.kind === 'fall') f.mesh.position.y -= dt * 14;
    else if (f.kind === 'zone') { f.tick -= dt; if (f.tick <= 0 && f.left > 0) { f.left--; f.tick = f.every; zoneHit(f); } f.mesh.material.opacity = 0.18 + Math.sin(f.t * 10) * 0.06; }
    else if (f.kind === 'spark') { f.vy -= 14 * dt; f.mesh.position.x += f.vx * dt; f.mesh.position.y = Math.max(0.05, f.mesh.position.y + f.vy * dt); f.mesh.position.z += f.vz * dt; f.mesh.scale.setScalar(Math.max(0.1, f.t * 3)); }
    else if (f.kind === 'slash') { f.mesh.material.opacity = Math.max(0, f.t / 0.16) * 0.75; f.mesh.scale.setScalar(1 + (0.16 - f.t) * 2); }
    else if (f.kind === 'meteor') {
      if (!f.rock) { f.rock = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 8), glow('#ff6a2a', 3)); f.rock.position.set(f.x - 3, 12, f.z - 3); G.group.add(f.rock); f.t0 = f.t; }
      const k = 1 - f.t / f.t0; f.rock.position.set(f.x - 3 * (1 - k), 12 * (1 - k), f.z - 3 * (1 - k));
      if (f.t <= 0) { G.group.remove(f.rock); if (f.foe) { ring(f.x, f.z, '#ff3a2a', f.r); sfx.play('boom'); if (Math.hypot(me.x - f.x, me.z - f.z) < f.r) hurtMe(f.foe, 'fire', null); } else { explode(f.x, f.z, f.r, f.fire, 'fire'); G.fx.push({ kind: 'burn', x: f.x, z: f.z, r: f.r * 0.8, t: 3, tick: 0, fire: f.fire * 0.12, mesh: areaMarker(f.x, f.z, f.r * 0.8, '#ff4a1a') }); } }
    }
    else if (f.kind === 'burn') { f.tick -= dt; if (f.tick <= 0) { f.tick = 0.5; for (const m of G.mobs) if (m.alive && Math.hypot(m.x - f.x, m.z - f.z) < f.r) damageMob(m, f.fire, 'fire'); } f.mesh.material.opacity = 0.25 + Math.sin(f.t * 12) * 0.08; }
    if (f.t <= 0) { if (f.mesh) { G.group.remove(f.mesh); if (f.kind === 'spark' || f.kind === 'slash') f.mesh.material.dispose(); if (f.kind === 'slash') f.mesh.children[0].geometry.dispose(); } if (f.el) f.el.remove(); G.fx.splice(i, 1); }
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


// ------------------------------------------------------------------ the gamepad
// play: left stick moves · right stick turns the camera · A attack / pick up / talk (hold to keep attacking) ·
// X Y B RB the four skill slots · D-pad ↑ heal ↓ mana ← rejuvenation → town portal · Start bag · Back map · LS skills
// menus: D-pad or left stick moves the highlight · A chooses · B or Start closes
const pad = { on: false, prev: [], mx: 0, mz: 0, attacking: false, rep: 0, idx: null, name: '' };
const PADKEY = { Q: 'X', E: 'Y', R: 'B', F: 'RB', G: 'LB', H: 'LT' };
const dz = (v) => (Math.abs(v) < 0.22 ? 0 : (v - Math.sign(v) * 0.22) / 0.78);
function rumble(strength, ms) {
  const gp = padNow(); const a = gp && gp.vibrationActuator;
  if (a && a.playEffect) a.playEffect('dual-rumble', { duration: ms * 1000, strongMagnitude: strength, weakMagnitude: strength * 0.6 }).catch(() => {});
}
const padNow = () => [...(navigator.getGamepads ? navigator.getGamepads() : [])].find((g) => g && g.connected) || null;
function autoTarget(range = 3.2) {
  let best = null, bs = 1e9;
  for (const m of G.mobs) {
    if (!m.alive) continue; const d = Math.hypot(m.x - me.x, m.z - me.z); if (d > range || !sees(G.L, me.x, me.z, m.x, m.z)) continue;
    const a = Math.atan2(m.x - me.x, m.z - me.z) - me.yaw, off = Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));
    const sc = d + off * 2.5; if (sc < bs) { bs = sc; best = m; }
  }
  return best;
}
function padInteract() {
  // something to pick up, someone to talk to, somewhere to go; else attack whatever is in front
  const d = G.drops.filter((x) => Math.hypot(x.x - me.x, x.z - me.z) < 2.4).sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0];
  if (d) { me.pickup = d; walkTo(d.x, d.z); return true; }
  const spots = G.area === 'town' ? Object.entries(G.L.spots).filter(([k]) => ['merchant', 'gambler', 'stash', 'healer', 'waypoint', 'cave'].includes(k)).map(([, v]) => v) : [G.wp, G.exitPortal, G.portal].filter(Boolean);
  const s = spots.find((p) => Math.hypot(p.x - me.x, p.z - me.z) < 2.8);
  if (s) { walkTo(s.x, s.z); return true; }
  return false;
}
function padAttack() {
  const range = ST.bow || (ch().cls === 'sorc' && ST.weapon && BASES[ST.weapon.base].type === 'wand') ? 13 : 4.5;
  const t = autoTarget(range);
  if (t) { me.target = t; return; }
  if (me.atkT <= 0 && !ST.bow) { setAct('attack', 1 / ST.aps); later(0.38 / ST.aps, () => { sfx.play('swing'); slash(me.yaw); }); }   // a swing at the air still feels like something
}
function padCast(k) {
  const id = ch().keys[k]; if (!id) return;
  ch().rmb = id; const S = SKILLS[id];
  const t = autoTarget(S.kind === 'melee' ? 5 : 14);
  const far = id === 'teleport' ? 10 : 6, x = t ? t.x : me.x + Math.sin(me.yaw) * far, z = t ? t.z : me.z + Math.cos(me.yaw) * far;
  cast(id, x, z, t); drawHud(true);
}
// menus: move a highlight between buttons
function focusables() {
  const root = !$('win').hidden ? $('win') : !$('select').hidden ? $('select') : null;
  return root ? [...root.querySelectorAll('button:not([disabled]), .cell[data-i], .cell[data-st]')].filter((e) => e.offsetParent && e.id !== 'winX' && e.id !== 'sLang') : [];
}
function setFocus(el) {
  document.querySelectorAll('.padfocus').forEach((e) => e.classList.remove('padfocus'));
  if (!el) { tipEl.hidden = true; return; }
  el.classList.add('padfocus'); el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  const r = el.getBoundingClientRect(); if (el.onpointerenter) el.onpointerenter({ clientX: r.right, clientY: r.top }); else tipEl.hidden = true;
  pad.idx = focusables().indexOf(el);
}
function moveFocus(dx, dy) {
  const list = focusables(); if (!list.length) return;
  const cur = document.querySelector('.padfocus');
  if (!cur || !list.includes(cur)) { setFocus(list[Math.min(pad.idx || 0, list.length - 1)]); return; }
  const a = cur.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
  let best = null, bs = 1e9;
  for (const el of list) {
    if (el === cur) continue; const b = el.getBoundingClientRect(), vx = b.left + b.width / 2 - ax, vy = b.top + b.height / 2 - ay, along = vx * dx + vy * dy;
    if (along <= 4) continue; const side = Math.abs(vx * dy - vy * dx), sc = along + side * 2.2; if (sc < bs) { bs = sc; best = el; }
  }
  if (best) { setFocus(best); sfx.play('tick'); }
}
function pollPad(dt) {
  const gp = padNow();
  if (!gp) { if (pad.on) { pad.on = false; pad.mx = pad.mz = 0; document.body.classList.remove('pad'); drawHud(true); } return; }
  if (!pad.on) { pad.on = true; document.body.classList.add('pad'); toast(SV.lang === 'zh' ? '🎮 手把已連接' : '🎮 Controller connected'); drawHud(true); }
  const b = (i) => !!(gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.5)), hit = (i) => b(i) && !pad.prev[i];
  const lx = dz(gp.axes[0] || 0), ly = dz(gp.axes[1] || 0), rx = dz(gp.axes[2] || 0);
  const menu = !$('win').hidden || !$('select').hidden;
  if (menu) {
    pad.mx = pad.mz = 0;
    let mx = (b(15) ? 1 : 0) - (b(14) ? 1 : 0) + (Math.abs(lx) > 0.5 ? Math.sign(lx) : 0), my = (b(13) ? 1 : 0) - (b(12) ? 1 : 0) + (Math.abs(ly) > 0.5 ? Math.sign(ly) : 0);
    if (mx || my) { pad.rep -= dt; if (pad.rep <= 0) { moveFocus(Math.sign(mx), mx ? 0 : Math.sign(my)); pad.rep = pad.repFirst ? 0.14 : 0.35; pad.repFirst = true; } } else { pad.rep = 0; pad.repFirst = false; }
    if (hit(0)) { const el = document.querySelector('.padfocus'); if (el) { el.click(); sfx.play('click'); requestAnimationFrame(() => { const list = focusables(); setFocus(list[Math.min(pad.idx || 0, list.length - 1)]); }); } else moveFocus(0, 1); }
    if ((hit(1) || hit(9)) && !$('win').hidden) { closeWin(); setFocus(null); }
  } else if (started) {
    pad.mx = lx; pad.mz = ly; camYaw -= rx * dt * 2.6;
    pad.attacking = b(0) || b(7);
    if (hit(0) || hit(7)) { if (!padInteract()) padAttack(); } else if (pad.attacking && me.atkT <= 0 && !me.target) padAttack();
    if (hit(2)) padCast('Q'); if (hit(3)) padCast('E'); if (hit(1)) padCast('R'); if (hit(5)) padCast('F');
    if (hit(12)) drink('hp'); if (hit(13)) drink('mp'); if (hit(14)) drink('rejuv'); if (hit(15)) townPortal();
    if (hit(9)) { openWin('inv'); requestAnimationFrame(() => moveFocus(0, 1)); }
    if (hit(10)) { openWin('skills'); requestAnimationFrame(() => moveFocus(0, 1)); }
    if (hit(8)) bigMap = !bigMap;
    if (hit(4)) padCast('G'); if (hit(6)) padCast('H');
  }
  pad.prev = gp.buttons.map((x) => x.pressed || x.value > 0.5);
}
addEventListener('gamepadconnected', () => sfx.unlock && sfx.unlock());

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
  const g = pad.on ? ['↑', '↓', '←', '→'] : ['1', '2', '3', 'T'];
  $('pot1').innerHTML = `🧪<b>${pots('hp')}</b><small>${g[0]}</small>`; $('pot2').innerHTML = `🧴<b>${pots('mp')}</b><small>${g[1]}</small>`; $('pot3').innerHTML = `💜<b>${c.pots.rejuv || 0}</b><small>${g[2]}</small>`;
  $('tpBtn').innerHTML = `📜<b>${c.tp}</b><small>${g[3]}</small>`;
  $('skillbar').innerHTML = SKEYS.map((k) => { const id = c.keys[k], S = id && SKILLS[id], cd = id ? me.cds[id] || 0 : 0; return `<button data-k="${k}" class="${c.rmb === id && id ? 'sel' : ''}" title="${S ? esc(tx(S.n)) : ''}">${S ? S.icon : ''}<small>${pad.on ? PADKEY[k] : k}</small>${cd > 0 ? `<i>${cd.toFixed(1)}</i>` : ''}</button>`; }).join('');
  $('skillbar').querySelectorAll('button').forEach((b) => b.onclick = () => { const id = c.keys[b.dataset.k]; if (id) { c.rmb = id; drawHud(true); } else toggleWin('skills'); });
  if (isTouch) for (const k of SKEYS) { const id = c.keys[k]; $('t' + k).textContent = id ? SKILLS[id].icon : '·'; }
  $('alertPts').hidden = !(c.pts || c.spts);
  const bf = Object.entries(me.buffs).filter(([k, v]) => v > 0 && SKILLS[k]).map(([k, v]) => `<span title="${esc(tx(SKILLS[k].n))}">${SKILLS[k].icon}<small>${Math.ceil(v)}</small></span>`);
  if (G.allies.length) bf.push(`<span>👥<small>${G.allies.length}</small></span>`);
  $('buffs').innerHTML = bf.join('');
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
const SKEYS = ['Q', 'E', 'R', 'F', 'G', 'H'];
let skillTab = 0;
const codex = { tab: 'u', kind: 'all' };
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
  if (B.sk && ['sorc', 'necro', 'druid'].includes(c.cls)) lines.push(`<span class="mag">${tx(STAT_NAMES.skills).replace('{v}', B.sk)}</span>`);
  lines.push(`<span class="${it.req > c.lvl ? 'bad' : ''}">${t.req(it.req)}</span>`);
  for (const l of statLines(it)) lines.push(`<span class="mag">${esc(l)}</span>`);
  if (it.set) lines.push(setLines(it.set, c));
  lines.push(`<span class="base">💰 ${itemValue(it)}</span>`);
  return lines.join('<br>') + extra;
}
const L2 = (zh, en) => (SV.lang === 'zh' ? zh : en);
const statText = (k, v) => (STAT_NAMES[k] ? tx(STAT_NAMES[k]).replace('{v}', v) : `${k} ${v}`);
// a set: its pieces (worn ones lit) and what 2, 3 … all pieces give
function setLines(id, c) {
  const S = SET_BY_ID[id]; if (!S) return '';
  const worn = new Set(Object.values(c.equip).filter((x) => x && x.set === id).map((x) => x.sp)), n = setCount(c.equip)[id] || 0;
  const out = [`<span class="setc">${esc(tx(S.n))} (${n}/${S.pieces.length})</span>`];
  S.pieces.forEach((p, i) => out.push(`<span class="${worn.has(i) ? 'seton' : 'setoff'}">· ${esc(tx(p.n))}</span>`));
  for (const [k, st] of Object.entries(S.bonus)) for (const [s2, v] of Object.entries(st)) out.push(`<span class="${n >= +k ? 'seton' : 'setoff'}">(${+k === S.pieces.length ? L2('全套', 'Full set') : L2(`${k} 件`, `${k} pieces`)}) ${esc(statText(s2, v))}</span>`);
  return '<hr>' + out.join('<br>');
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
        <hr>${row('', t.fire, ST.res.fire + '%')}${row('', t.cold, ST.res.cold + '%')}${row('', t.light, ST.res.light + '%')}${row('', t.poison, ST.res.poison + '%')}${ST.mf ? row('', t.mf, ST.mf + '%') : ''}${ST.fr ? row('', t.fr, ST.fr + '%') : ''}${ST.dmgPct ? row('', L2('所有傷害', 'All damage'), '+' + ST.dmgPct + '%') : ''}${ST.thorns ? row('', L2('反傷', 'Thorns'), ST.thorns) : ''}
        ${Object.entries(setCount(c.equip)).map(([id, n]) => `<div class="srow setrow" data-set="${id}"><span>${esc(tx(SET_BY_ID[id].n))}</span><b>${n}/${SET_BY_ID[id].pieces.length}</b></div>`).join('')}`;
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
    const eq = SLOTS.map((s) => { const it = c.equip[s], ic = itemColor(it); return `<button class="slot s-${s} ${it ? 'r-' + it.rar : ''}" data-eq="${s}" ${it ? 'data-tip' : ''} ${ic ? `style="--ic:${ic}"` : ''}>${it ? BASES[it.base].icon : `<small>${tx(SLOT_NAMES[s])}</small>`}</button>`; }).join('');
    el.innerHTML = `<div class="twocol"><div class="lcol">${left}</div><div class="rcol"><div class="doll">${eq}<div class="fig" id="dollFig"></div></div><p class="gold">💰 ${c.gold}</p><div class="grid inv">${c.inv.map((it, i) => cellHTML(it, i, 'data-i')).join('')}${Array.from({ length: Math.max(0, 40 - c.inv.length) }, () => '<span class="cell empty"></span>').join('')}</div></div></div>`;
    hookTips(el.querySelector('.doll'), (b) => c.equip[b.dataset.eq]); mountDoll($('dollFig'));
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
    if (win === 'gamble') el.querySelectorAll('[data-gb]').forEach((b) => b.onclick = () => { const cost = 200 + c.lvl * 60; if (c.gold < cost || c.inv.length >= 40) { if (c.inv.length >= 40) msg(t.full); return; } c.gold -= cost; const u = rnd(), rar = u < 0.02 ? 'unique' : u < 0.045 ? 'set' : u < 0.14 ? 'rare' : 'magic'; const it = makeItem(b.dataset.gb, rar, c.lvl + 3); c.inv.push(it); noteFound(it); sfx.play(rar === 'unique' || rar === 'set' ? 'win' : 'buy'); toast(tx(it.name), RARITY[it.rar].c); changed(); renderWin(); });
    if (win === 'stash') { hookTips(el.querySelector('.stash'), (b) => c.stash[+b.dataset.st]); el.querySelectorAll('[data-st]').forEach((b) => b.onclick = () => { if (c.inv.length >= 40) { msg(t.full); return; } c.inv.push(c.stash[+b.dataset.st]); c.stash.splice(+b.dataset.st, 1); changed(); renderWin(); }); }
    el.querySelectorAll('[data-set]').forEach((r) => { r.onpointerenter = r.onpointermove = (e) => showTip(e, setLines(r.dataset.set, c).slice(4)); r.onpointerleave = () => { tipEl.hidden = true; }; });
    el.querySelectorAll('[data-low]').forEach((b) => b.classList.add('low'));
    $('winTitle').textContent = win === 'shop' ? t.merchant : win === 'gamble' ? t.gambler : win === 'stash' ? t.stashName : t.inv;
  } else if (win === 'skills') {
    $('winTitle').textContent = t.skills;
    const trees = TREES[c.cls]; skillTab = Math.min(skillTab, trees.length - 1); const tree = trees[skillTab];
    const learned = (tr2) => tr2.skills.reduce((a, id) => a + (c.skills[id] || 0), 0);
    el.innerHTML = `<p class="pts">${t.spoints(c.spts)}</p><div class="tabs">${trees.map((x, i) => `<button data-tab="${i}" class="${i === skillTab ? 'sel' : ''}">${x.icon} ${tx(x.n)} <small>${learned(x)}</small></button>`).join('')}</div><div class="skills">${tree.skills.map((id) => {
      const S = SKILLS[id], lv = c.skills[id] || 0, eff = lv ? lv + ST.skillsBonus : 0, can = c.spts > 0 && c.lvl >= S.req && lv < MAX_SKILL;
      const d = (l) => tx(S.d).replace(/\{(\w+)\}/g, (_, k) => (S[k] ? S[k](Math.max(1, l)) : k));
      const bindable = lv && S.kind !== 'passive';
      return `<div class="sk ${lv ? '' : 'locked'}"><span class="ic">${S.icon}</span><div><b>${tx(S.n)}</b> <small>${lv ? t.skillLv(eff) : c.lvl < S.req ? t.learnAt(S.req) : t.lv(S.req)}</small><p>${esc(d(eff || 1))}</p>${lv && lv < MAX_SKILL ? `<p class="dim">${t.next}: ${esc(d(eff + 1))}</p>` : ''}${S.mana && S.mana(1) ? `<p class="dim">💧 ${S.mana(Math.max(1, eff))}</p>` : ''}</div>
        <div class="acts">${can ? `<button data-up="${id}">+</button>` : ''}${bindable ? SKEYS.map((k) => `<button class="key ${c.keys[k] === id ? 'sel' : ''}" data-bind="${id}" data-k="${k}">${pad.on ? PADKEY[k] : k}</button>`).join('') : ''}</div></div>`;
    }).join('')}</div>`;
    el.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { skillTab = +b.dataset.tab; renderWin(); });
    el.querySelectorAll('[data-up]').forEach((b) => b.onclick = () => { const id = b.dataset.up; if (c.spts <= 0) return; c.spts--; c.skills[id] = (c.skills[id] || 0) + 1; if (SKILLS[id].kind !== 'passive' && !Object.values(c.keys).includes(id)) { const free = SKEYS.find((k) => !c.keys[k]); if (free) c.keys[free] = id; } sfx.play('levelup'); refreshStats(); changed(); renderWin(); drawHud(true); });
    el.querySelectorAll('[data-bind]').forEach((b) => b.onclick = () => { for (const k of Object.keys(c.keys)) if (c.keys[k] === b.dataset.bind) c.keys[k] = null; c.keys[b.dataset.k] = b.dataset.bind; c.rmb = b.dataset.bind; changed(); renderWin(); drawHud(true); });
  } else if (win === 'codex') {
    $('winTitle').textContent = L2('圖鑑', 'Codex');
    const F = SV.found || { u: {}, s: {} }, nU = Object.keys(F.u).length, nS = Object.keys(F.s).length, nP = SETS.reduce((a, S) => a + S.pieces.length, 0);
    const kinds = [['all', '全部', 'All'], ['weapon', '武器', 'Weapons'], ['head', '頭部', 'Helms'], ['body', '盔甲', 'Armour'], ['gloves', '手套', 'Gloves'], ['boots', '靴子', 'Boots'], ['belt', '腰帶', 'Belts'], ['offhand', '副手', 'Off-hand'], ['ring', '戒指', 'Rings'], ['amulet', '項鍊', 'Amulets']];
    const range = (st) => Object.entries(st).map(([k, v]) => esc(statText(k, Array.isArray(v) ? (v[0] === v[1] ? v[0] : `${v[0]}–${v[1]}`) : v))).join(' · ');
    let body = '';
    if (codex.tab === 'u') {
      const list = UNIQUES.filter((u) => codex.kind === 'all' || BASES[u.base].slot === codex.kind).sort((a, b) => a.lvl - b.lvl);
      body = list.map((u) => `<div class="cx ${F.u[u.id] ? 'got' : ''}"><span class="ic" style="--ic:${u.col}">${BASES[u.base].icon}</span><div><b style="color:${RARITY.unique.c}">${esc(tx(u.n))}</b> <small>${esc(tx(BASES[u.base].n))} · ${t.lv(u.lvl)}${F.u[u.id] ? ' · ✓' : ''}</small><p>${range(u.st)}</p></div></div>`).join('');
    } else {
      const list = SETS.filter((S) => codex.kind === 'all' || S.pieces.some((p) => BASES[p.base].slot === codex.kind));
      body = list.map((S) => { const got = S.pieces.filter((p, i) => F.s[S.id + ':' + i]).length; return `<div class="cx set ${got === S.pieces.length ? 'got' : ''}"><span class="ic" style="--ic:${S.col}">🛡️</span><div><b style="color:${RARITY.set.c}">${esc(tx(S.n))}</b> <small>${t.lv(S.lvl)} · ${got}/${S.pieces.length}</small>
        ${S.pieces.map((p, i) => `<p class="${F.s[S.id + ':' + i] ? 'seton' : ''}">${BASES[p.base].icon} ${esc(tx(p.n))} — ${range(p.st)}</p>`).join('')}
        ${Object.entries(S.bonus).map(([k, st]) => `<p class="dim">(${+k === S.pieces.length ? L2('全套', 'Full set') : L2(`${k} 件`, `${k} pieces`)}) ${range(st)}</p>`).join('')}</div></div>`; }).join('');
    }
    el.innerHTML = `<div class="tabs"><button data-ct="u" class="${codex.tab === 'u' ? 'sel' : ''}">${L2('暗金', 'Uniques')} <small>${nU}/${UNIQUES.length}</small></button><button data-ct="s" class="${codex.tab === 's' ? 'sel' : ''}">${L2('套裝', 'Sets')} <small>${nS}/${nP}</small></button></div>
      <div class="tabs small">${kinds.map(([k, zh, en]) => `<button data-ck="${k}" class="${codex.kind === k ? 'sel' : ''}">${L2(zh, en)}</button>`).join('')}</div><div class="codex">${body}</div>`;
    el.querySelectorAll('[data-ct]').forEach((b) => b.onclick = () => { codex.tab = b.dataset.ct; renderWin(); });
    el.querySelectorAll('[data-ck]').forEach((b) => b.onclick = () => { codex.kind = b.dataset.ck; renderWin(); });
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
    el.innerHTML = t.helpBody.map((p) => `<p>${p}</p>`).join('') + `<p class="dim">${isTouch ? t.touchKeys : t.keys}</p><p class="dim">${t.padKeys}</p><div class="row"><button id="hLang">${t.lang}</button><button id="hSnd">🔊 ${t.sound}: ${SV.sound ? 'ON' : 'OFF'}</button><button id="hQuit">${t.quit}</button></div>`;
    $('hLang').onclick = () => { SV.lang = SV.lang === 'zh' ? 'en' : 'zh'; persist(); renderWin(); drawHud(true); };
    $('hSnd').onclick = () => { SV.sound = !SV.sound; sfx.on = SV.sound; persist(); renderWin(); };
    $('hQuit').onclick = () => { persist(); location.reload(); };
  }
}
function refreshShop() { const c = ch(), r = Math.random; shopStock = Array.from({ length: 8 }, () => { const it = rollItem(Math.max(1, c.lvl), 0, r); if (it.rar === 'rare' || it.rar === 'unique') return makeItem(it.base, 'magic', c.lvl, r); return it; }); }
for (const [id, w] of [['bInv', 'inv'], ['bSkills', 'skills'], ['bCodex', 'codex'], ['bMap', null], ['bHelp', 'help']]) $(id).onclick = () => { sfx.unlock(); if (w) toggleWin(w); else bigMap = !bigMap; };
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
window.DH = { G, me, ch, camera, refresh: () => { refreshStats(); buildHero(); }, get ST() { return ST; }, enterLevel, enterTown, cast, setForm, makeItem, SETS, UNIQUES, BASES, order: (c) => SKILL_ORDER[c], skill: (id) => SKILLS[id], formBuffs: () => Object.fromEntries(Object.entries(SKILLS).filter(([, S]) => S.mech === 'form').map(([k, S]) => [k, S.form])), openWin, closeWin, gainXp, dropItem, pickUp, SV: () => SV };
