// A character's numbers from their class, stat points, level, skills and gear; hit chances and damage.
import { CLASSES, SKILLS, BASES, DIFFS } from './data.js?v=2';

export const EQUIP_SLOTS = ['head', 'amulet', 'weapon', 'body', 'offhand', 'gloves', 'belt', 'ring1', 'ring2', 'boots'];
// ch: { cls, lvl, alloc: {str,dex,vit,ene}, skills: {id: lv}, equip: {slot: item}, diff }
export function derive(ch) {
  const C = CLASSES[ch.cls], s = { str: 0, dex: 0, vit: 0, ene: 0 }, add = {};
  for (const k of Object.keys(s)) s[k] = C.base[k] + (ch.alloc[k] || 0);
  let def = 0, block = 0, weapon = null, skillsBonus = 0;
  for (const slot of EQUIP_SLOTS) {
    const it = ch.equip[slot]; if (!it) continue;
    if (it.lvlTooLow) continue;
    for (const [k, v] of Object.entries(it.st || {})) add[k] = (add[k] || 0) + v;
    if (it.def) def += it.def;
    if (it.block) block = it.block;
    if (slot === 'weapon') weapon = it;
    skillsBonus += BASES[it.base].sk && (ch.cls === 'sorc') ? BASES[it.base].sk : 0;
  }
  for (const k of ['str', 'dex', 'vit', 'ene']) s[k] += add[k] || 0;
  skillsBonus += add.skills || 0;
  const sl = (id) => { const b = ch.skills[id] || 0; return b ? b + skillsBonus : 0; };
  const iron = sl('ironskin'), frenzy = sl('frenzy'), eva = sl('evasion');
  const life = Math.round(C.life + s.vit * 3 + (ch.lvl - 1) * 3 + (add.life || 0));
  const mana = Math.round(C.mana + s.ene * 2 + (ch.lvl - 1) * 1.5 + (add.mana || 0));
  def = Math.round((def + s.dex / 4) * (1 + (iron ? SKILLS.ironskin.def(iron) : 0) / 100));
  const B = weapon ? BASES[weapon.base] : null;
  const bow = !!(B && B.type === 'bow');
  const dmg = weapon ? weapon.dmg.slice() : [1, 3];
  const main = bow ? s.dex : s.str;
  const resBonus = (iron ? SKILLS.ironskin.res(iron) : 0) + (add.allres || 0);
  const pen = DIFFS[ch.diff || 0].res;
  const cap = (v) => Math.max(-100, Math.min(75, v));
  return {
    ...s, life, mana, def, block, bow, weapon, skillsBonus, sl,
    dmg, main, aps: (B ? B.speed : 1.4) * (1 + ((add.ias || 0) + (frenzy ? SKILLS.frenzy.ias(frenzy) : 0)) / 100),
    crit: Math.min(75, 5 + (add.crit || 0)), ls: add.ls || 0, fdmg: add.fdmg || 0, regen: (add.regen || 0) + life * 0.004,
    res: { fire: cap(pen + resBonus + (add.fres || 0)), cold: cap(pen + resBonus + (add.cres || 0)), light: cap(pen + resBonus + (add.lres || 0)), poison: cap(pen + resBonus) },
    fr: (add.fr || 0) + (frenzy ? SKILLS.frenzy.fr(frenzy) : 0) + (eva ? SKILLS.evasion.fr(eva) : 0),
    mf: add.mf || 0, dodge: eva ? SKILLS.evasion.dodge(eva) : 0, spell: 1 + s.ene * 0.0025,
  };
}
// a weapon blow or arrow: physical damage with a skill's bonus %, plus flat fire
export function attackDamage(st, pct = 0, r = Math.random) {
  const base = st.dmg[0] + r() * (st.dmg[1] - st.dmg[0]);
  let d = base * (1 + st.main / 100) * (1 + pct / 100);
  const crit = r() * 100 < st.crit; if (crit) d *= 2;
  return { phys: Math.round(d), fire: st.fdmg, crit };
}
export const hitChance = (st, plvl, mdef) => Math.max(0.3, Math.min(0.97, 0.95 - (mdef / (mdef + 40 + plvl * 10 + st.dex)) * 0.7));
export const mobHitChance = (st, mlvl) => Math.max(0.25, Math.min(0.95, 0.92 - (st.def / (st.def + 60 + mlvl * 14)) * 0.8));
// damage a player takes: physical reduced a little by defence, elements by resistance
export function takeDamage(st, dmg, el) {
  if (!el || el === 'phys') return Math.max(1, Math.round(dmg * (1 - Math.min(0.35, st.def / (st.def + 900)))));
  return Math.max(1, Math.round(dmg * (1 - st.res[el] / 100)));
}
