// Uniques and sets, generated once from word lists: 500 uniques (the hand-made ones first) and 100 sets of 2–6 pieces.
// Every unique and set has a colour of its own, which the paper doll and the hero's model wear.
const rng = (seed) => { let s = seed >>> 0 || 1; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
export const ITEM_MAX_LVL = 60;

// a stat's value at level fraction f (0 at level 1, 1 at level 60): [low, high] at the ends
const SCALE = {
  edmg: [60, 320], edef: [60, 260], mindmg: [2, 25], maxdmg: [4, 45], ias: [10, 45], life: [15, 160], mana: [15, 130],
  str: [4, 35], dex: [4, 35], vit: [4, 35], ene: [4, 35], fres: [10, 50], cres: [10, 50], lres: [10, 50], allres: [5, 35],
  ls: [3, 12], fr: [10, 40], mf: [10, 60], crit: [4, 30], fdmg: [5, 80], regen: [2, 25], dmgp: [5, 60], thorns: [5, 200], minion: [10, 90],
};
export const statAt = (k, f, k2 = 1) => {
  if (k === 'skills') { const v = Math.min(3, 1 + Math.floor(f * 2.2)); return [v, v]; }
  const [lo, hi] = SCALE[k], c = (lo + (hi - lo) * f) * k2;
  return [Math.max(1, Math.round(c * 0.78)), Math.max(1, Math.round(c))];
};
// what can roll where
const POOL = {
  weapon: ['ias', 'ls', 'crit', 'mindmg', 'maxdmg', 'fdmg', 'str', 'dex', 'life', 'dmgp', 'mana'],
  caster: ['ene', 'mana', 'skills', 'dmgp', 'minion', 'life', 'crit', 'regen', 'fdmg'],
  head: ['life', 'mana', 'allres', 'fres', 'cres', 'lres', 'vit', 'ene', 'mf', 'skills', 'regen', 'dmgp'],
  body: ['life', 'allres', 'fres', 'cres', 'lres', 'vit', 'str', 'regen', 'thorns', 'mana'],
  gloves: ['ias', 'crit', 'str', 'dex', 'ls', 'life', 'mf', 'fdmg'],
  boots: ['fr', 'dex', 'life', 'fres', 'cres', 'lres', 'mf', 'vit'],
  belt: ['life', 'vit', 'str', 'regen', 'allres', 'fres', 'cres', 'lres', 'mana'],
  offhand: ['life', 'allres', 'vit', 'thorns', 'fres', 'cres', 'lres', 'str'],
  orb: ['ene', 'mana', 'skills', 'dmgp', 'minion', 'allres', 'life'],
  ring: ['life', 'mana', 'str', 'dex', 'vit', 'ene', 'crit', 'ls', 'mf', 'allres', 'fdmg', 'dmgp', 'regen'],
  amulet: ['life', 'mana', 'skills', 'allres', 'str', 'dex', 'vit', 'ene', 'mf', 'crit', 'dmgp', 'minion'],
};
const poolOf = (B) => (B.slot === 'weapon' ? (B.sk ? 'caster' : 'weapon') : B.slot === 'offhand' && !B.block ? 'orb' : B.slot);
const must = (B) => (B.dmg && !B.sk ? 'edmg' : B.def ? 'edef' : null);

// the first word of a unique: [中文, English, colour]
const WORDS = [
  ['血月', 'Bloodmoon', '#c83a3a'], ['霜狼', 'Frostwolf', '#9ad0ff'], ['灰燼', 'Ashen', '#8a8a8a'], ['雷鳴', 'Thunder', '#ffe25a'], ['夜梟', 'Nightowl', '#5a4a8a'],
  ['骨棘', 'Bonethorn', '#e8e0c8'], ['蝕日', 'Eclipse', '#3a2a4a'], ['星墜', 'Starfall', '#c8d8ff'], ['冥河', 'Styx', '#2a5a6a'], ['鴉羽', 'Ravenwing', '#2a2a3a'],
  ['龍息', 'Dragonbreath', '#ff7a2a'], ['幽影', 'Shade', '#4a4a6a'], ['赤焰', 'Crimsonflame', '#ff4a2a'], ['寒鐵', 'Coldiron', '#a8b8c8'], ['腐根', 'Rotroot', '#6a7a3a'],
  ['蛇鱗', 'Serpentscale', '#3a8a5a'], ['獅心', 'Lionheart', '#e8b84a'], ['鐵荊', 'Ironbriar', '#6a5a4a'], ['虛空', 'Void', '#6a3aaa'], ['黎明', 'Dawn', '#ffc8a0'],
  ['黃昏', 'Dusk', '#c8784a'], ['永夜', 'Evernight', '#1a1a3a'], ['狂嵐', 'Galeborn', '#8ae8d8'], ['碎顱', 'Skullsplitter', '#a83a2a'], ['噬魂', 'Soulreaver', '#7a3aa8'],
  ['聖光', 'Holylight', '#fff4c8'], ['墓土', 'Gravesoil', '#5a4a3a'], ['蒼穹', 'Skyvault', '#5a9ae8'], ['熔心', 'Moltenheart', '#ff8a3a'], ['霧隱', 'Mistveil', '#b8c8c8'],
  ['雷角', 'Stormhorn', '#8ab8ff'], ['銀月', 'Silvermoon', '#d8e0f0'], ['黑曜', 'Obsidian', '#2a2030'], ['琥珀', 'Amber', '#e8a03a'], ['翡翠', 'Jade', '#3ab87a'],
  ['赤銅', 'Copperblood', '#b8683a'], ['荒原', 'Wasteland', '#a8946a'], ['怒濤', 'Ragetide', '#3a7ac8'], ['寂靜', 'Silent', '#9a9aaa'], ['瘟疫', 'Plague', '#8aa83a'],
  ['烈陽', 'Blazing Sun', '#ffb83a'], ['幻夢', 'Dreamweft', '#d8a8ff'], ['枯骨', 'Witherbone', '#c8b89a'], ['狼王', 'Wolfking', '#8a8a9a'], ['熊魂', 'Bearsoul', '#7a5a3a'],
  ['鷹眼', 'Hawkeye', '#c8a070'], ['蠍尾', 'Scorpiontail', '#c87a2a'], ['寒冬', 'Wintertide', '#c8e8ff'], ['餘暉', 'Afterglow', '#ffa07a'], ['深淵', 'Abyssal', '#3a1a3a'],
  ['古樹', 'Elderwood', '#5a7a3a'], ['聖骸', 'Relic', '#e8d8a8'], ['惡魔', 'Fiend', '#c82a3a'], ['天使', 'Seraph', '#fff8e8'], ['風暴', 'Tempest', '#7ab8e8'],
  ['鏽蝕', 'Rustbitten', '#a85a3a'], ['水晶', 'Crystal', '#b8f0ff'], ['暗潮', 'Undertow', '#2a4a6a'], ['紅蓮', 'Red Lotus', '#e83a5a'], ['無光', 'Lightless', '#141418'],
  ['巨人', 'Titan', '#9a8a7a'], ['毒牙', 'Venomfang', '#5ac83a'], ['影刃', 'Shadowblade', '#3a3a5a'], ['王者', 'Sovereign', '#e8c84a'], ['亡魂', 'Wraith', '#a8c8b8'],
];
// the second word, by kind of item: [中文, English]
const NOUNS = {
  weapon: [['之刃', 'Edge'], ['之牙', 'Fang'], ['之怒', 'Wrath'], ['之痕', 'Scar'], ['之吻', 'Kiss'], ['之咬', 'Bite'], ['審判', 'Judgement'], ['終焉', 'Ending'], ['嘆息', 'Sigh'], ['誓言', 'Oath'], ['裁決', 'Verdict'], ['獠牙', 'Tusk']],
  bow: [['長弦', 'Longstring'], ['箭雨', 'Arrowstorm'], ['弧光', 'Arc'], ['低吟', 'Hum'], ['獵心', 'Hunter'], ['之翼', 'Wing'], ['流星', 'Meteor'], ['之歌', 'Song']],
  caster: [['低語', 'Whisper'], ['秘語', 'Secret'], ['智慧', 'Wisdom'], ['呼喚', 'Call'], ['迴響', 'Echo'], ['星圖', 'Starchart'], ['預言', 'Prophecy'], ['權杖', 'Scepter'], ['之枝', 'Branch']],
  head: [['之冠', 'Crown'], ['面甲', 'Visor'], ['兜帽', 'Cowl'], ['頭環', 'Circlet'], ['凝視', 'Gaze'], ['思緒', 'Thoughts'], ['額飾', 'Diadem'], ['面容', 'Visage']],
  body: [['之甲', 'Mail'], ['外衣', 'Coat'], ['胸甲', 'Cuirass'], ['戰袍', 'Raiment'], ['皮囊', 'Hide'], ['之鎧', 'Plate'], ['庇護', 'Shelter'], ['外殼', 'Shell']],
  gloves: [['之握', 'Grip'], ['之拳', 'Fist'], ['手掌', 'Palm'], ['之觸', 'Touch'], ['之爪', 'Claw'], ['巧手', 'Hands']],
  boots: [['之履', 'Stride'], ['足跡', 'Tracks'], ['步伐', 'Steps'], ['行者', 'Walker'], ['歸途', 'Way Home'], ['之蹄', 'Hooves']],
  belt: [['束帶', 'Cinch'], ['腰鍊', 'Chain'], ['之環', 'Girdle'], ['之纏', 'Coil'], ['繩結', 'Knot'], ['束縛', 'Binding']],
  offhand: [['壁壘', 'Bulwark'], ['之盾', 'Ward'], ['守護', 'Guard'], ['堡壘', 'Bastion'], ['之門', 'Gate']],
  orb: [['之眼', 'Eye'], ['星辰', 'Star'], ['之心', 'Heart'], ['光球', 'Sphere']],
  ring: [['之戒', 'Band'], ['印記', 'Seal'], ['循環', 'Loop'], ['誓環', 'Promise'], ['指環', 'Ring']],
  amulet: [['之心', 'Heart'], ['護符', 'Charm'], ['之淚', 'Tear'], ['吊墜', 'Pendant'], ['聖物', 'Relic'], ['之瞳', 'Eye']],
};
const nounKind = (B) => (B.type === 'bow' ? 'bow' : B.slot === 'weapon' ? (B.sk ? 'caster' : 'weapon') : B.slot === 'offhand' && !B.block ? 'orb' : B.slot);

// set owners are made-up names from paired syllables, so 中文 and English match
const SYL = [['阿', 'A'], ['貝', 'be'], ['卡', 'ka'], ['達', 'da'], ['艾', 'e'], ['菲', 'fi'], ['加', 'ga'], ['赫', 'he'], ['伊', 'i'], ['賈', 'ja'], ['凱', 'kai'], ['洛', 'lo'], ['瑪', 'ma'], ['諾', 'no'], ['奧', 'o'],
  ['佩', 'pe'], ['羅', 'ro'], ['薩', 'sa'], ['托', 'to'], ['烏', 'u'], ['維', 'vi'], ['溫', 'win'], ['澤', 'ze'], ['莉', 'li'], ['倫', 'ren'], ['瑟', 'ser'], ['蒂', 'ti'], ['娜', 'na'], ['塔', 'ta'], ['拉', 'ra'], ['夏', 'sha'], ['莫', 'mo'], ['西', 'si'], ['貢', 'gon']];
const END = [['恩', 'n'], ['斯', 's'], ['爾', 'r'], ['德', 'd'], ['克', 'k'], ['姆', 'm']];
const COLL = [['遺物', 'Relics'], ['戰甲', 'Battlegear'], ['榮耀', 'Glory'], ['誓約', 'Vows'], ['傳承', 'Legacy'], ['裝束', 'Garb'], ['武裝', 'Arms'], ['秘寶', 'Treasures'], ['鋼鐵', 'Steel'], ['偽裝', 'Disguise']];
const PIECE = {
  sword: ['之劍', 'Sword'], axe: ['之斧', 'Axe'], mace: ['之錘', 'Hammer'], bow: ['之弓', 'Bow'], wand: ['魔杖', 'Wand'], staff: ['法杖', 'Staff'],
  head: ['頭盔', 'Visor'], body: ['胸甲', 'Hauberk'], gloves: ['護手', 'Gauntlets'], boots: ['戰靴', 'Boots'], belt: ['腰帶', 'Belt'], shield: ['之盾', 'Shield'], orb: ['寶珠', 'Orb'], ring: ['指環', 'Ring'], amulet: ['護符', 'Amulet'],
};
const SET_COLS = ['#3ade5a', '#c84a3a', '#4a7ae8', '#e8c84a', '#8a4ac8', '#e8e8f0', '#2a2a3a', '#3ab8c8', '#c87a3a', '#5a9a3a', '#e85aa8', '#8a9aa8', '#7a3a2a', '#a8e8a8'];

export function buildItems(BASES, HAND) {
  const r = rng(424242), pick = (a) => a[Math.floor(r() * a.length)];
  const bases = Object.values(BASES);
  const rollStats = (B, lvl, n, k2 = 1, avoid = new Set()) => {
    const f = Math.max(0, (lvl - 1) / (ITEM_MAX_LVL - 1)), st = {}, m = must(B);
    if (m && !avoid.has(m)) st[m] = statAt(m, f, k2);
    const pool = POOL[poolOf(B)].filter((k) => !avoid.has(k) && (k !== 'skills' || r() < 0.4));
    while (Object.keys(st).length < n && pool.length) { const k = pool.splice(Math.floor(r() * pool.length), 1)[0]; st[k] = statAt(k, f, k2); }
    return st;
  };
  // ---------------------------------------------------------------- uniques
  const UNIQUES = HAND.map((u, i) => ({ ...u, lvl: u.lvl || BASES[u.base].lvl, col: u.col || WORDS[(i * 7) % WORDS.length][2] }));
  const names = new Set(UNIQUES.map((u) => u.n[0]));
  const per = Math.ceil((500 - UNIQUES.length) / bases.length);
  for (let bi = 0; UNIQUES.length < 500; bi = (bi + 1) % bases.length) {
    const B = bases[bi], have = UNIQUES.filter((u) => u.base === B.id && u.gen).length;
    if (have >= per) { if (bases.every((b) => UNIQUES.filter((u) => u.base === b.id && u.gen).length >= per)) break; continue; }
    // spread a base's uniques from its own level up to the top
    const lvl = Math.min(ITEM_MAX_LVL, Math.round(B.lvl + (ITEM_MAX_LVL - B.lvl) * (have + r() * 0.8) / per));
    let w, nn, tries = 0;
    do { w = pick(WORDS); nn = pick(NOUNS[nounKind(B)]); tries++; } while (names.has(w[0] + nn[0]) && tries < 200);
    if (names.has(w[0] + nn[0])) continue;
    names.add(w[0] + nn[0]);
    const n = 3 + Math.floor(lvl / 22) + (r() < 0.3 ? 1 : 0);
    UNIQUES.push({ id: 'u' + UNIQUES.length, base: B.id, n: [w[0] + nn[0], w[1] + ' ' + nn[1]], lvl, col: w[2], st: rollStats(B, lvl, n), gen: true });
  }
  // ---------------------------------------------------------------- sets
  const SETS = [], owners = new Set(), SLOTS = ['weapon', 'head', 'body', 'gloves', 'boots', 'belt', 'offhand', 'ring', 'amulet'];
  for (let i = 0; i < 100; i++) {
    let zh, en;
    do {
      const a = pick(SYL), b = pick(SYL), e = r() < 0.55 ? pick(END) : null;
      zh = a[0] + b[0] + (e ? e[0] : ''); en = (a[1] + b[1] + (e ? e[1] : '')); en = en[0].toUpperCase() + en.slice(1);
    } while (owners.has(zh) || zh.length < 2);
    owners.add(zh);
    const C = COLL[i % COLL.length], lvl = Math.max(1, Math.min(58, Math.round(1 + i * 0.58 + r() * 4)));
    const count = 2 + ((i * 7 + Math.floor(r() * 3)) % 5), slots = SLOTS.slice().sort(() => r() - 0.5).slice(0, count);
    if (slots.includes('weapon') && !slots.includes('offhand') && r() < 0.3) slots[slots.indexOf('weapon')] = 'offhand';
    const pieces = [];
    for (const slot of [...new Set(slots)]) {
      let cand = bases.filter((b) => b.slot === slot && b.lvl <= lvl + 2);
      if (slot === 'weapon' && slots.includes('offhand')) cand = cand.filter((b) => !b.two);
      if (!cand.length) cand = bases.filter((b) => b.slot === slot).sort((a, b) => a.lvl - b.lvl).slice(0, 1);
      if (!cand.length) continue;
      const best = cand.filter((b) => b.tier >= Math.max(...cand.map((x) => x.tier)) - 1), B = pick(best);
      const pn = B.slot === 'weapon' ? PIECE[B.type] : B.slot === 'offhand' ? PIECE[B.block ? 'shield' : 'orb'] : PIECE[B.slot];
      pieces.push({ base: B.id, n: [zh + '的' + pn[0].replace(/^之/, ''), en + '’s ' + pn[1]], st: rollStats(B, lvl, 2 + (r() < 0.4 ? 1 : 0), 0.75) });
    }
    if (pieces.length < 2) { i--; owners.delete(zh); continue; }
    // bonuses grow with each piece worn; the whole set gives the most
    const f = (lvl - 1) / (ITEM_MAX_LVL - 1), bonus = {}, BONUS = ['life', 'allres', 'dmgp', 'crit', 'ias', 'mf', 'fr', 'ls', 'regen', 'str', 'dex', 'vit', 'ene', 'mana', 'thorns', 'minion', 'fdmg'];
    for (let k = 2; k <= pieces.length; k++) {
      const full = k === pieces.length, st = {}, pool = BONUS.slice();
      for (let j = 0; j < (full ? 3 : 1 + (r() < 0.4 ? 1 : 0)); j++) { const s = pool.splice(Math.floor(r() * pool.length), 1)[0]; st[s] = statAt(s, f, full ? 1.4 : 0.8)[1]; }
      if (full && lvl >= 20) st.skills = lvl >= 45 ? 2 : 1;
      bonus[k] = st;
    }
    SETS.push({ id: 's' + i, n: [zh + '的' + C[0], en + '’s ' + C[1]], owner: [zh, en], lvl, col: SET_COLS[(i * 5) % SET_COLS.length], pieces, bonus });
  }
  return { UNIQUES, SETS };
}
