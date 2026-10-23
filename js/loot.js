// Items: rolling drops (base, rarity, affixes), naming them, and what they are worth.
import { BASES, AFFIXES, UNIQUES, RARE_A, RARE_B, POTIONS } from './data.js?v=3';

export function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pick = (list, r) => list[Math.floor(r() * list.length)];
const roll = ([a, b], r) => a + Math.floor(r() * (b - a + 1));
export const band = (il) => (il < 15 ? 0 : il < 32 ? 1 : 2);
let uidN = 0;
export const newUid = () => Date.now().toString(36) + (uidN++).toString(36) + Math.floor(Math.random() * 1e4).toString(36);

// bases that can drop at an item level: the newest tier the level allows weighs most
export function basesFor(il) {
  const ok = Object.values(BASES).filter((b) => b.lvl <= il + 2);
  return ok.flatMap((b) => Array(b.lvl > il - 14 ? 3 : 1).fill(b));
}
export function makeItem(baseId, rar, il, r = Math.random) {
  const B = BASES[baseId];
  const it = { uid: newUid(), base: baseId, rar, il, st: {}, req: B.lvl };
  if (rar === 'unique') {
    const U = UNIQUES.find((u) => u.base === baseId && (u.lvl || 1) <= il + 4);
    if (!U) return makeItem(baseId, 'rare', il, r);
    it.u = U.id; it.name = U.n; for (const [k, v] of Object.entries(U.st)) it.st[k] = roll(v, r); it.req = Math.max(B.lvl, U.lvl || B.lvl);
  } else if (rar === 'magic' || rar === 'rare') {
    const n = rar === 'magic' ? 1 + (r() < 0.5 ? 1 : 0) : 3 + Math.floor(r() * 3);
    const slot = B.slot === 'ring' || B.slot === 'amulet' ? B.slot : B.slot;
    const pool = AFFIXES.filter((a) => a.slots.includes(slot) && (!a.minIl || il >= a.minIl) && (!a.rare || rar === 'rare' || r() < 0.3));
    let pre = null, suf = null;
    const used = new Set(), bd = band(il);
    for (let i = 0; i < n && pool.length; i++) {
      const a = pick(pool.filter((x) => !used.has(x.k)), r); if (!a) break;
      used.add(a.k);
      const t = Math.min(bd, a.r.length - 1, Math.floor(r() * (bd + 1.6)));
      it.st[a.k] = roll(a.r[t], r);
      it.req = Math.max(it.req, Math.round(t * 13 + il * 0.5));
      if (a.p && !pre) pre = a.p[Math.min(t, a.p.length - 1)]; else if (a.s && !suf) suf = a.s[Math.min(t, a.s.length - 1)];
    }
    if (rar === 'magic') it.name = [(pre ? pre[0] : '') + B.n[0] + (suf ? suf[0] : ''), [pre && pre[1], B.n[1], suf && suf[1]].filter(Boolean).join(' ')];
    else { const a = pick(RARE_A, r), b = pick(RARE_B, r); it.name = [a[0] + b[0], a[1] + ' ' + b[1]]; }
  } else it.name = B.n;
  // the item's own numbers: armour defence, weapon damage
  if (B.def) it.def = Math.round(roll(B.def, r) * (1 + (it.st.edef || 0) / 100));
  if (B.dmg) { const k = 1 + (it.st.edmg || 0) / 100; it.dmg = [Math.round(B.dmg[0] * k) + (it.st.mindmg || 0), Math.round(B.dmg[1] * k) + (it.st.maxdmg || 0)]; if (it.dmg[1] <= it.dmg[0]) it.dmg[1] = it.dmg[0] + 1; }
  if (B.block) it.block = B.block;
  it.req = Math.min(it.req, 99);
  return it;
}
// a drop from a monster: an item (or null), with magic find; champions and bosses roll better
export function rollItem(il, mf = 0, r = Math.random, { boss = false, champ = false, minRar = null } = {}) {
  const B = pick(basesFor(il), r);
  const mfU = mf * 250 / (mf + 250), mfR = mf * 600 / (mf + 600), mfM = mf;
  const k = boss ? 4 : champ ? 2 : 1;
  const u = r(), cu = 0.008 * k * (1 + mfU / 100), cr = cu + 0.055 * k * (1 + mfR / 100), cm = cr + 0.3 * (1 + mfM / 100);
  let rar = u < cu ? 'unique' : u < cr ? 'rare' : u < cm ? 'magic' : 'normal';
  if (B.jewel && rar === 'normal') rar = 'magic';
  const order = ['normal', 'magic', 'rare', 'unique'];
  if (minRar && order.indexOf(rar) < order.indexOf(minRar)) rar = minRar;
  return makeItem(B.id, rar, il, r);
}
export function potionFor(lvl, r = Math.random) {
  const t = lvl >= 28 ? 3 : lvl >= 12 ? 2 : 1;
  if (lvl >= 20 && r() < 0.08) return 'rejuv';
  return (r() < 0.6 ? 'hp' : 'mp') + t;
}
// what the vendor pays (and charges ×4)
export function itemValue(it) {
  const B = BASES[it.base], m = { normal: 1, magic: 3, rare: 7, unique: 15 }[it.rar];
  const affix = Object.values(it.st).reduce((a, v) => a + Math.abs(v), 0);
  return Math.max(5, Math.round((B.tier * 25 + it.il * 4 + affix * 1.5) * m));
}
export { POTIONS };
