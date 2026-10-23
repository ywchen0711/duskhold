// node tools/test.mjs: levels are connected, loot rolls sensibly, and fights are fair at every act and difficulty
import { genLevel, genTown, field, walk, toT, FLOOR } from '../js/dungeon.js';
import { rollItem, makeItem, rng, itemValue, potionFor } from '../js/loot.js';
import { derive, setCount, attackDamage, spellDamage, hitChance, mobHitChance, takeDamage } from '../js/combat.js';
import { CLASSES, SKILLS, SKILL_ORDER, TREES, MOBS, ACTS, mlvlOf, mobStats, BASES, UNIQUES, SETS, xpFor } from '../js/data.js';

let fails = 0;
const ok = (name, cond, info = '') => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${info ? '  ' + info : ''}`); if (!cond) fails++; };

// 1. levels
{
  let bad = 0, n = 0, rooms = 0;
  for (let s = 1; s <= 300; s++) for (const boss of [false, true]) {
    const L = genLevel(s * 7919, boss); n++; rooms += L.rooms.length;
    const d = field(L, toT(L.start.x), toT(L.start.z));
    let floor = 0, reach = 0; for (let i = 0; i < L.grid.length; i++) if (L.grid[i] === FLOOR) { floor++; if (d[i] >= 0) reach++; }
    const spots = [L.end, ...L.packs, ...L.props, ...(L.bossAt ? [L.bossAt] : [])];
    if (floor !== reach || spots.some((p) => d[toT(p.z) * L.N + toT(p.x)] < 0) || (!boss && L.rooms.length < 6)) { bad++; if (bad < 4) console.log('   bad level', s, boss, floor, reach); }
  }
  ok('levels are connected', bad === 0, `${n} levels, ${(rooms / n).toFixed(1)} rooms each, ${bad} bad`);
  const T = genTown(), d = field(T, toT(T.start.x), toT(T.start.z));
  ok('the camp is walkable to every spot', Object.values(T.spots).every((p) => d[toT(p.z) * T.N + toT(p.x)] >= 0 || [[0, 1], [0, -1], [1, 0], [-1, 0]].some(([a, b]) => d[(toT(p.z) + b) * T.N + toT(p.x) + a] >= 0)));
}
// 2. loot
{
  const r = rng(5), count = { normal: 0, magic: 0, rare: 0, set: 0, unique: 0 }; let badName = 0;
  for (let i = 0; i < 20000; i++) { const it = rollItem(1 + (i % 50), 0, r); count[it.rar]++; if (!it.name || !it.name[0] || !it.name[1]) badName++; if (it.rar !== 'normal' && it.rar !== 'unique' && !Object.keys(it.st).length) badName++; }
  ok('drops: mostly plain and magic, some rare, a few unique', count.unique > 40 && count.unique < 500 && count.rare > 600 && count.magic > count.rare && badName === 0, JSON.stringify(count));
  const mf = { normal: 0, magic: 0, rare: 0, set: 0, unique: 0 }; for (let i = 0; i < 20000; i++) mf[rollItem(30, 200, r).rar]++;
  ok('magic find helps', mf.unique > count.unique && mf.rare > count.rare, JSON.stringify(mf));
  const allU = UNIQUES.every((u) => { const it = makeItem(u.base, 'unique', 60, r, u.id); return it.u === u.id && it.name[0] === u.n[0] && Object.keys(it.st).length >= 3; });
  ok('500 uniques, all named differently, every one can be made', UNIQUES.length === 500 && new Set(UNIQUES.map((u) => u.n[0])).size === 500 && new Set(UNIQUES.map((u) => u.n[1])).size === 500 && allU, `${UNIQUES.length} uniques on ${Object.keys(BASES).length} bases`);
  let badP = 0; for (const S of SETS) S.pieces.forEach((p, i) => { const it = makeItem(p.base, 'set', 60, r, S.id + ':' + i); if (it.set !== S.id || it.sp !== i || it.name[0] !== p.n[0]) badP++; });
  const slotsOk = SETS.every((S) => new Set(S.pieces.map((p) => BASES[p.base].slot)).size === S.pieces.length && S.pieces.length >= 2 && S.pieces.length <= 6 && S.bonus[S.pieces.length]);
  ok('100 sets of 2-6 pieces, one per slot, every piece can be made', SETS.length === 100 && new Set(SETS.map((S) => S.n[0])).size === 100 && badP === 0 && slotsOk, `${SETS.reduce((a, S) => a + S.pieces.length, 0)} pieces`);
  // wearing a whole set turns on all its bonuses
  const S = SETS.find((x) => x.pieces.length >= 4), equip = {};
  S.pieces.forEach((p, i) => { const B = BASES[p.base]; equip[B.slot === 'ring' ? 'ring1' : B.slot] = makeItem(p.base, 'set', 60, r, S.id + ':' + i); });
  const bare = derive({ cls: 'warrior', lvl: 60, alloc: {}, skills: {}, equip: {}, diff: 0 }), worn = derive({ cls: 'warrior', lvl: 60, alloc: {}, skills: {}, equip, diff: 0 });
  ok('set bonuses count', setCount(equip)[S.id] === S.pieces.length && worn.life >= bare.life, `${S.n[0]}: ${S.pieces.length} pieces, life ${bare.life} -> ${worn.life}`);
  const drops = { set: 0, unique: 0 }; for (let i = 0; i < 40000; i++) { const it = rollItem(10 + (i % 70), 0, r); if (it.rar in drops) drops[it.rar]++; }
  ok('sets and uniques both drop', drops.set > 150 && drops.unique > 150, JSON.stringify(drops));
  ok('things are worth something', itemValue(makeItem('war_bow', 'rare', 40, r)) > itemValue(makeItem('short_bow', 'normal', 1, r)));
}
// 3. skills: 200 per class in five trees, every description fills in, every mechanic is one the game runs
{
  const MECHS = new Set(['proj', 'nova', 'area', 'cone', 'chain', 'melee', 'formstrike', 'bow', 'dash', 'teleport', 'buff', 'form', 'passive', 'curse', 'heal', 'corpse', 'summon', 'trap', 'revive']);
  let badD = 0, badM = 0, badA = 0;
  for (const cls of Object.keys(CLASSES)) {
    const ids = SKILL_ORDER[cls], names = new Set(ids.map((id) => SKILLS[id].n[0]));
    ok(`${cls}: 200 skills in 5 trees, all named differently`, ids.length === 200 && TREES[cls].length === 5 && names.size === 200, `${ids.length} skills, ${names.size} names`);
    for (const id of ids) {
      const S = SKILLS[id];
      for (const d of S.d) for (const [, k] of d.matchAll(/\{(\w+)\}/g)) for (const lv of [1, 20]) { const v = S[k] && S[k](lv); if (typeof v !== 'number' || !isFinite(v)) { badD++; if (badD < 4) console.log('   bad text', id, k); } }
      if (S.gen && !MECHS.has(S.mech)) badM++;
      if (S.ally && S.mech !== 'revive' && !MOBS['a_' + S.ally]) badA++;  // the raised dead keep their own monster
    }
  }
  ok('every skill description has its numbers', badD === 0, `${badD} bad`);
  ok('every skill mechanic and ally exists', badM === 0 && badA === 0, `${badM} mechanics, ${badA} allies`);
}
// 4. fights: a typical character at each act (level-appropriate magic gear, points in their main stat and attack skill)
function hero(cls, lvl, r) {
  const mainStat = { warrior: 'str', ranger: 'dex', sorc: 'ene', druid: 'ene', necro: 'ene' }[cls], pts = (lvl - 1) * 5;
  const alloc = { str: 0, dex: 0, vit: Math.round(pts * 0.45), ene: 0 }; alloc[mainStat] += pts - alloc.vit;
  const weapon = { warrior: lvl >= 34 ? 'rune_sword' : lvl >= 14 ? 'broad_sword' : 'short_sword', ranger: lvl >= 33 ? 'war_bow' : lvl >= 15 ? 'long_bow' : 'short_bow', sorc: lvl >= 30 ? 'elder_staff' : 'staff', druid: lvl >= 30 ? 'elder_staff' : 'staff', necro: lvl >= 30 ? 'elder_staff' : 'staff' }[cls];
  const tier = (a, b, c) => (lvl >= 32 ? c : lvl >= 15 ? b : a);
  const equip = { weapon: makeItem(weapon, 'magic', lvl, r), head: makeItem(tier('cap', 'helm', 'crown'), 'magic', lvl, r), body: makeItem(tier('quilted', 'chain', 'plate'), 'magic', lvl, r), gloves: makeItem(lvl >= 20 ? 'gauntlets' : 'gloves', 'magic', lvl, r), boots: makeItem(lvl >= 20 ? 'greaves' : 'boots', 'magic', lvl, r), belt: makeItem(lvl >= 22 ? 'war_belt' : 'sash', 'magic', lvl, r), ring1: makeItem('ring', 'magic', lvl, r), amulet: makeItem('amulet', 'magic', lvl, r) };
  if (cls === 'warrior') equip.offhand = makeItem(tier('buckler', 'kite', 'tower'), 'magic', lvl, r);
  const skills = {}; let sp = lvl - 1 + 2;
  for (const id of SKILL_ORDER[cls]) if (!SKILLS[id].gen && SKILLS[id].req <= lvl) skills[id] = 1, sp--;
  // druids and necromancers lead with the best damage spell of their first tree they can learn
  const best = () => TREES[cls][0].skills.filter((id) => ['proj', 'nova', 'chain'].includes(SKILLS[id].mech) && SKILLS[id].req <= lvl).sort((a, b) => SKILLS[b].req - SKILLS[a].req)[0];
  const main = { warrior: lvl >= 24 ? 'whirl' : 'bash', ranger: lvl >= 18 ? 'explode' : 'power', sorc: lvl >= 24 ? 'meteor' : lvl >= 12 ? 'chain' : 'fireball' }[cls] || best();
  skills[main] = Math.min(20, 1 + Math.max(0, sp)); sp = 0;
  return { cls, lvl, alloc, skills, equip, diff: 0, main };
}
function dps(h, st, mob) {
  const lv = st.sl(h.main), S = SKILLS[h.main], r = rng(9);
  if (S.gen) return spellDamage(st, S, lv) * (S.count ? Math.min(2, S.count(lv)) : 1) * 1.6 * (S.mech === 'nova' ? 1.2 : 1);
  if (S.kind === 'spell') {
    const per = (S.fire ? S.fire(lv) : S.light ? S.light(lv) / 2 * 1.6 : S.cold(lv)) * st.spell;
    const rate = h.main === 'meteor' ? 0.85 : 1.8, aoe = h.main === 'meteor' ? 1.3 : 1;
    return per * rate * aoe;
  }
  let tot = 0; for (let i = 0; i < 400; i++) { const d = attackDamage(st, S.pct ? S.pct(lv) : 0, r); tot += d.phys + d.fire + (S.fire ? S.fire(lv) / 1.3 : 0); }
  const per = tot / 400, hits = h.main === 'whirl' ? 1 / 0.3 : st.aps;
  return per * hits * hitChance(st, h.lvl, mob.def);
}
const rows = [];
for (const cls of Object.keys(CLASSES)) for (let a = 0; a < 3; a++) {
  const ml = mlvlOf(a, 2, 0), lvl = ml + 2, r = rng(a * 31 + cls.length);
  const h = hero(cls, lvl, r), st = derive(h);
  const mob = mobStats(ACTS[a].mobs[0], ml), boss = mobStats(ACTS[a].boss, mlvlOf(a, 3, 0) + 2);
  const d = dps(h, st, mob), ttk = mob.hp / d, bossTtk = boss.hp / d;
  const mobDps = takeDamage(st, mob.dmg, null) * mobHitChance(st, ml) * 0.8, survive = st.life / mobDps, packSurvive = st.life / (mobDps * 5);
  const bossDps = takeDamage(st, boss.dmg * 1.6, MOBS[ACTS[a].boss].el || null) * mobHitChance(st, ml + 4) * 0.8;
  // the sorceress's energy shield moves part of the damage onto her mana
  // ...and druids and necromancers never fight alone: their summons take a share of the blows
  const shield = cls === 'sorc' ? (st.life + st.mana) / st.life : cls === 'druid' || cls === 'necro' ? 1.6 : 1;
  if (h.main && SKILLS[h.main].gen) console.log(`   ${cls} main: ${SKILLS[h.main].n[0]} (${SKILLS[h.main].mech})`);
  rows.push({ cls, a, lvl, ttk, bossTtk, survive, packSurvive, bossSurvive: st.life * shield / bossDps });
  console.log(`   ${cls.padEnd(7)} act ${a + 1} Lv${lvl}: life ${st.life}, ${Math.round(d)} dps · a monster falls in ${ttk.toFixed(1)}s · the boss in ${Math.round(bossTtk)}s · you last ${Math.round(survive)}s vs one, ${packSurvive.toFixed(1)}s vs five, ${bossDps ? (st.life / bossDps).toFixed(1) : '∞'}s vs the boss`);
}
ok('normal monsters fall in a few hits', rows.every((x) => x.ttk > 0.25 && x.ttk < 4));
ok('bosses take a real fight (15 s – 2 min)', rows.every((x) => x.bossTtk > 15 && x.bossTtk < 120));
ok('packs are dangerous but survivable', rows.every((x) => x.packSurvive > 3 && x.survive > 12));
ok('bosses need potions', rows.every((x) => x.bossSurvive > 5 && x.bossSurvive < x.bossTtk));
ok('levelling curve', xpFor(10) < xpFor(30) && xpFor(30) < 200000, `xp to Lv10 ${xpFor(10)}, Lv30 ${xpFor(30)}, Lv60 ${xpFor(60)}`);
console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);
