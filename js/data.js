// Duskhold: classes and skills, monsters, item bases, affixes and uniques. Names are [中文, English].
import { buildSkills } from './skillgen.js?v=4';
import { buildItems } from './itemgen.js?v=4';

// ------------------------------------------------------------------ classes
export const CLASSES = {
  warrior: { n: ['戰士', 'Warrior'], icon: '🛡️', color: '#c8503a', base: { str: 30, dex: 20, vit: 25, ene: 10 }, life: 60, mana: 10, desc: ['近戰專家：重擊、跳斬、戰吼和旋風斬', 'Melee expert: Bash, Leap, War Cry and Whirlwind'] },
  ranger: { n: ['遊俠', 'Ranger'], icon: '🏹', color: '#4a9a4a', base: { str: 20, dex: 30, vit: 20, ene: 15 }, life: 50, mana: 15, desc: ['弓箭手：多重箭、冰霜箭、爆裂箭和箭雨', 'Archer: Multishot, Frost Arrow, Explosive Arrow and Arrow Rain'] },
  druid: { n: ['德魯伊', 'Druid'], icon: '🐻', color: '#6a8a3a', base: { str: 20, dex: 20, vit: 25, ene: 20 }, life: 55, mana: 20, desc: ['自然之力：熔岩與風暴、狼人熊人變身、召喚野獸', 'Nature’s power: magma and storms, wolf and bear forms, summoned beasts'] },
  necro: { n: ['死靈法師', 'Necromancer'], icon: '💀', color: '#5a4a7a', base: { str: 15, dex: 25, vit: 15, ene: 25 }, life: 45, mana: 25, desc: ['亡者之術：白骨與劇毒、召喚骷髏大軍、詛咒敵人', 'The dead obey: bone and poison, skeleton armies, curses'] },
  sorc: { n: ['法師', 'Sorceress'], icon: '🔮', color: '#5a6ae8', base: { str: 10, dex: 20, vit: 15, ene: 35 }, life: 40, mana: 35, desc: ['元素法術：火球、冰霜新星、閃電鏈、傳送和隕石', 'Elements: Fireball, Frost Nova, Chain Lightning, Teleport and Meteor'] },
};
// skills: req = character level; kind: melee | bow | spell | passive | buff; mana and numbers grow with skill level (lv 1–20)
const BASE_SKILLS = {
  bash: { cls: 'warrior', req: 1, kind: 'melee', icon: '🔨', n: ['重擊', 'Bash'], mana: (l) => 2, pct: (l) => 40 + 12 * l, d: ['揮出重擊，傷害 +{pct}%，擊退敵人', 'A heavy blow: +{pct}% damage, knocks back'] },
  ironskin: { cls: 'warrior', req: 3, kind: 'passive', icon: '🪨', n: ['鐵壁', 'Iron Skin'], def: (l) => 20 + 10 * l, res: (l) => 2 * l, d: ['被動：防禦 +{def}%，所有抗性 +{res}', 'Passive: +{def}% defence, +{res} to all resistances'] },
  leap: { cls: 'warrior', req: 6, kind: 'melee', icon: '🦘', cd: 3, n: ['跳斬', 'Leap Attack'], mana: (l) => 8, pct: (l) => 100 + 15 * l, r: 2.8, d: ['跳到目標處，對周圍造成 {pct}% 傷害', 'Leap to the target and hit everything around for {pct}%'] },
  warcry: { cls: 'warrior', req: 12, kind: 'spell', icon: '📢', cd: 4, n: ['戰吼', 'War Cry'], mana: (l) => 10, flat: (l) => 20 + 9 * l, r: 6, d: ['怒吼：周圍敵人受到 {flat} 傷害並暈眩 1.5 秒', 'A roar: {flat} damage to nearby foes and a 1.5 s stun'] },
  frenzy: { cls: 'warrior', req: 18, kind: 'passive', icon: '💢', n: ['狂暴', 'Frenzy'], ias: (l) => 5 + 2 * l, fr: (l) => 3 + l, d: ['被動：攻擊速度 +{ias}%，移動速度 +{fr}%', 'Passive: +{ias}% attack speed, +{fr}% movement'] },
  whirl: { cls: 'warrior', req: 24, kind: 'melee', icon: '🌀', n: ['旋風斬', 'Whirlwind'], mana: (l) => 15, pct: (l) => 60 + 8 * l, r: 2.8, d: ['旋轉 2 秒衝向目標，每 0.3 秒造成 {pct}% 傷害', 'Spin toward the target for 2 s, hitting for {pct}% every 0.3 s'] },
  power: { cls: 'ranger', req: 1, kind: 'bow', icon: '🎯', n: ['強力射擊', 'Power Shot'], mana: (l) => 2, pct: (l) => 50 + 15 * l, d: ['強力的一箭：傷害 +{pct}%', 'A mighty arrow: +{pct}% damage'] },
  evasion: { cls: 'ranger', req: 3, kind: 'passive', icon: '💨', n: ['閃避', 'Evasion'], dodge: (l) => Math.min(45, 5 + 2 * l), fr: (l) => Math.round(1.5 * l), d: ['被動：{dodge}% 機率閃避攻擊，移動速度 +{fr}%', 'Passive: {dodge}% chance to dodge, +{fr}% movement'] },
  multi: { cls: 'ranger', req: 6, kind: 'bow', icon: '🪶', n: ['多重箭', 'Multishot'], mana: (l) => 5, count: (l) => Math.min(11, 3 + Math.floor(l / 2)), pct: (l) => 70, d: ['一次射出 {count} 支箭（70% 傷害）', 'Fire {count} arrows at once (70% damage)'] },
  frost: { cls: 'ranger', req: 12, kind: 'bow', icon: '❄️', n: ['冰霜箭', 'Frost Arrow'], mana: (l) => 4, cold: (l) => 5 + 7 * l, pct: (l) => 100, d: ['附加 {cold} 冰冷傷害並緩速', 'Adds {cold} cold damage and slows'] },
  explode: { cls: 'ranger', req: 18, kind: 'bow', icon: '💥', n: ['爆裂箭', 'Explosive Arrow'], mana: (l) => 8, fire: (l) => 12 + 13 * l, pct: (l) => 60, r: 2.6, d: ['箭爆炸造成 {fire} 火焰傷害（範圍）', 'The arrow explodes for {fire} fire damage in an area'] },
  rain: { cls: 'ranger', req: 24, kind: 'bow', icon: '🌧️', cd: 2, n: ['箭雨', 'Arrow Rain'], mana: (l) => 18, pct: (l) => 40 + 6 * l, r: 4.2, d: ['3 秒內箭如雨下，每次 {pct}% 傷害', 'Arrows pour down for 3 s, {pct}% damage each'] },
  fireball: { cls: 'sorc', req: 1, kind: 'spell', icon: '🔥', n: ['火球', 'Fireball'], mana: (l) => 3 + Math.floor(l / 3), fire: (l) => 8 + 8 * l, r: 1.6, d: ['火球爆炸造成 {fire} 火焰傷害', 'A fireball exploding for {fire} fire damage'] },
  shield: { cls: 'sorc', req: 3, kind: 'buff', icon: '🫧', n: ['魔力護盾', 'Energy Shield'], mana: (l) => 10, absorb: (l) => Math.min(80, 30 + 3 * l), d: ['120 秒內 {absorb}% 傷害改由法力吸收', 'For 120 s, {absorb}% of damage drains mana instead'] },
  nova: { cls: 'sorc', req: 6, kind: 'spell', icon: '💠', n: ['冰霜新星', 'Frost Nova'], mana: (l) => 9, cold: (l) => 8 + 7 * l, r: 7, d: ['冰環向外擴散，造成 {cold} 冰冷傷害並緩速', 'A ring of ice: {cold} cold damage and slow'] },
  chain: { cls: 'sorc', req: 12, kind: 'spell', icon: '⚡', n: ['閃電鏈', 'Chain Lightning'], mana: (l) => 10, light: (l) => 20 + 14 * l, jumps: (l) => 3 + Math.floor(l / 4), d: ['閃電跳躍 {jumps} 次，每次 1–{light} 閃電傷害', 'Lightning that jumps {jumps} times for 1–{light} each'] },
  teleport: { cls: 'sorc', req: 18, kind: 'spell', icon: '✨', cd: 0.4, n: ['傳送', 'Teleport'], mana: (l) => Math.max(5, 16 - l), d: ['瞬間移動到指定位置', 'Blink to the chosen spot'] },
  meteor: { cls: 'sorc', req: 24, kind: 'spell', icon: '☄️', cd: 1, n: ['隕石', 'Meteor'], mana: (l) => 20, fire: (l) => 40 + 18 * l, r: 3.2, d: ['1 秒後隕石落下：{fire} 火焰傷害並留下火焰', 'A meteor lands after 1 s: {fire} fire damage and burning ground'] },
};
// every class has five trees of 40 skills (skillgen.js); the hand-made skills above are signature skills inside them
const BUILT = buildSkills(BASE_SKILLS);
export const SKILLS = BUILT.SKILLS, TREES = BUILT.TREES;
export const SKILL_ORDER = Object.fromEntries(Object.entries(TREES).map(([c, t]) => [c, t.flatMap((x) => x.skills)]));
export const MAX_SKILL = 20, MAX_LEVEL = 60;
export const xpFor = (lv) => Math.round(80 * Math.pow(lv, 2.05));

// ------------------------------------------------------------------ acts, levels and monsters
// mlvl of a level: act, depth and difficulty
export const DIFFS = [{ n: ['普通', 'Normal'], lv: 0, mult: 1, res: 0 }, { n: ['惡夢', 'Nightmare'], lv: 30, mult: 2.6, res: -40 }, { n: ['地獄', 'Hell'], lv: 60, mult: 6, res: -100 }];
export const ACTS = [
  { n: ['第一幕：地下墓穴', 'Act I: The Catacombs'], theme: 'crypt', levels: [['墓穴入口', 'Crypt Gate'], ['白骨長廊', 'Bone Halls'], ['亡者之井', 'Well of the Dead'], ['骷髏王的王座', 'Throne of the Bone King']], mobs: ['skeleton', 'archer', 'zombie', 'bat'], boss: 'boneking' },
  { n: ['第二幕：沉沒神殿', 'Act II: The Sunken Temple'], theme: 'temple', levels: [['淹沒的前廳', 'Flooded Antechamber'], ['蛇人迴廊', 'Serpent Cloister'], ['祭司密室', 'Priests’ Vault'], ['沙蠍女王的巢穴', 'Lair of the Scorpion Queen']], mobs: ['scarab', 'mummy', 'imp', 'naga'], boss: 'queen' },
  { n: ['第三幕：燼淵', 'Act III: The Ember Abyss'], theme: 'abyss', levels: [['焦土裂谷', 'Scorched Rift'], ['熔岩之河', 'River of Magma'], ['惡魔熔爐', 'Demon Forge'], ['深淵領主的王座', 'Throne of the Abyss Lord']], mobs: ['fireimp', 'knight', 'wraith', 'hound'], boss: 'lord' },
];
export const mlvlOf = (act, depth, diff) => act * 10 + depth * 2 + 1 + DIFFS[diff].lv;
// monsters: hp and dmg at mlvl 1; ai: melee | ranged | caster | charger; el: damage element
export const MOBS = {
  skeleton: { n: ['骷髏兵', 'Skeleton'], hp: 22, dmg: 5, def: 8, speed: 3.4, ai: 'melee', xp: 12, size: 1, color: '#e8e0c8' },
  archer: { n: ['骷髏弓手', 'Skeleton Archer'], hp: 16, dmg: 4, def: 5, speed: 3.2, ai: 'ranged', xp: 14, size: 1, color: '#d8d0b8', shot: 'arrow' },
  zombie: { n: ['殭屍', 'Zombie'], hp: 40, dmg: 7, def: 4, speed: 2.1, ai: 'melee', xp: 15, size: 1.1, color: '#7a9a6a' },
  bat: { n: ['吸血蝙蝠', 'Vampire Bat'], hp: 10, dmg: 3, def: 12, speed: 5.6, ai: 'melee', xp: 8, size: 0.7, color: '#5a3a5a', fly: true },
  scarab: { n: ['雷甲蟲', 'Thunder Scarab'], hp: 34, dmg: 6, def: 14, speed: 3.6, ai: 'charger', xp: 18, size: 1, color: '#3a6ab8', el: 'light' },
  mummy: { n: ['木乃伊', 'Mummy'], hp: 52, dmg: 8, def: 8, speed: 2.4, ai: 'melee', xp: 20, size: 1.15, color: '#d8c8a0', el: 'poison' },
  imp: { n: ['沙地小鬼', 'Sand Imp'], hp: 20, dmg: 5, def: 10, speed: 5, ai: 'melee', xp: 14, size: 0.8, color: '#c89a5a' },
  naga: { n: ['蛇人祭司', 'Naga Priest'], hp: 28, dmg: 7, def: 8, speed: 3, ai: 'caster', xp: 22, size: 1.1, color: '#4a9a7a', shot: 'bolt', el: 'light' },
  fireimp: { n: ['火焰小惡魔', 'Fire Imp'], hp: 24, dmg: 7, def: 10, speed: 3.6, ai: 'caster', xp: 22, size: 0.85, color: '#e8582a', shot: 'firebolt', el: 'fire' },
  knight: { n: ['惡魔騎士', 'Demon Knight'], hp: 70, dmg: 11, def: 20, speed: 3, ai: 'melee', xp: 30, size: 1.3, color: '#5a2a2a' },
  wraith: { n: ['冰冷幽魂', 'Frost Wraith'], hp: 30, dmg: 8, def: 16, speed: 4.2, ai: 'melee', xp: 24, size: 1, color: '#8ab8e8', el: 'cold', fly: true },
  hound: { n: ['熔岩獵犬', 'Magma Hound'], hp: 36, dmg: 8, def: 12, speed: 5.4, ai: 'charger', xp: 24, size: 1, color: '#8a3a1a', el: 'fire' },
  // bosses
  boneking: { n: ['骷髏王', 'The Bone King'], hp: 900, dmg: 10, def: 30, speed: 3.2, ai: 'boss', xp: 900, size: 2.2, color: '#f0e8d0', boss: true, summon: 'skeleton' },
  queen: { n: ['沙蠍女王', 'The Scorpion Queen'], hp: 1500, dmg: 13, def: 40, speed: 3.6, ai: 'boss', xp: 1800, size: 2.4, color: '#c87a3a', boss: true, summon: 'scarab', el: 'poison' },
  // allies (summons, traps, shapeshift forms) borrow a monster's model with their own colour
  a_wolf: { n: ['靈狼', 'Spirit Wolf'], model: 'hound', color: '#9aa8c8', size: 0.9, speed: 6, ally: true },
  a_bear: { n: ['熊靈', 'Spirit Bear'], model: 'hound', color: '#7a5a3a', size: 1.45, speed: 4.5, ally: true },
  a_hawk: { n: ['獵鷹', 'Hawk'], model: 'bat', color: '#c8a070', size: 0.9, speed: 7, ally: true },
  a_raven: { n: ['烏鴉', 'Raven'], model: 'bat', color: '#2a2a3a', size: 0.8, speed: 7, ally: true },
  a_cat: { n: ['靈貓', 'Spirit Cat'], model: 'hound', color: '#d8b87a', size: 0.75, speed: 6.5, ally: true },
  a_vine: { n: ['藤蔓', 'Vine'], model: 'naga', color: '#4a9a3a', size: 1, speed: 0, ally: true, ranged: true },
  a_spirit: { n: ['精靈', 'Spirit'], model: 'wraith', color: '#9affc8', size: 0.9, speed: 5, ally: true, ranged: true },
  a_skelwar: { n: ['骷髏戰士', 'Skeleton Warrior'], model: 'skeleton', color: '#e8e0c8', size: 1, speed: 4.5, ally: true },
  a_skelmage: { n: ['骷髏法師', 'Skeleton Mage'], model: 'naga', color: '#c8b8e8', size: 0.95, speed: 4, ally: true, ranged: true },
  a_golem: { n: ['魔像', 'Golem'], model: 'knight', color: '#8a8a7a', size: 1.3, speed: 3.6, ally: true },
  a_sentry: { n: ['雷擊哨塔', 'Shock Sentry'], model: 'scarab', color: '#7ab8ff', size: 0.7, speed: 0, ally: true, ranged: true },
  a_totem: { n: ['圖騰', 'Totem'], model: 'naga', color: '#c8783a', size: 0.8, speed: 0, ally: true, ranged: true },
  lord: { n: ['深淵領主', 'The Abyss Lord'], hp: 2600, dmg: 17, def: 55, speed: 3.4, ai: 'boss', xp: 3600, size: 2.8, color: '#8a1a2a', boss: true, summon: 'fireimp', el: 'fire' },
};
export const mobStats = (id, mlvl, diff = 0) => {
  const M = MOBS[id], k = DIFFS[diff].mult;
  return { hp: Math.round(M.hp * (1 + 0.32 * (mlvl - 1)) * k), dmg: Math.round(M.dmg * (1 + 0.2 * (mlvl - 1)) * Math.sqrt(k) * (diff ? 1.3 : 1)), def: Math.round(M.def * (1 + 0.25 * (mlvl - 1))), xp: Math.round(M.xp * (1 + 0.24 * (mlvl - 1)) * (1 + diff * 0.6)) };
};
// champion and unique monster mods
export const MODS = {
  fast: { n: ['極速', 'Extra Fast'] }, strong: { n: ['強壯', 'Extra Strong'] }, stone: { n: ['石膚', 'Stone Skin'] },
  fire: { n: ['火焰強化', 'Fire Enchanted'] }, cold: { n: ['冰冷強化', 'Cold Enchanted'] }, light: { n: ['閃電強化', 'Lightning Enchanted'] },
  vamp: { n: ['吸血', 'Vampiric'] },
};
export const UNAME = [['陰影', 'Shade'], ['腐骨', 'Rotbone'], ['血牙', 'Bloodfang'], ['灰燼', 'Ash'], ['寂靜', 'Silent'], ['瘋狂', 'Mad'], ['冰心', 'Frostheart'], ['毒刺', 'Venomsting'], ['鐵顎', 'Ironjaw'], ['黑焰', 'Blackflame']];
export const UNAME2 = [['剝皮者', 'the Flayer'], ['吞噬者', 'the Devourer'], ['守墓人', 'the Gravekeeper'], ['屠夫', 'the Butcher'], ['低語者', 'the Whisperer'], ['碎顱者', 'the Skullcrusher']];

// ------------------------------------------------------------------ items
// bases: slot, type, tier (1–3), level, stats; weapons have dmg [min, max] and speed (attacks a second); armour has def
const B = {};
const base = (id, zh, en, o) => { B[id] = { id, n: [zh, en], ...o }; };
// weapons
base('short_sword', '短劍', 'Short Sword', { slot: 'weapon', type: 'sword', tier: 1, lvl: 1, dmg: [2, 7], speed: 1.6, icon: '🗡️' });
base('broad_sword', '闊劍', 'Broad Sword', { slot: 'weapon', type: 'sword', tier: 2, lvl: 14, dmg: [8, 20], speed: 1.55, icon: '🗡️' });
base('claymore', '雙手巨劍', 'Claymore', { slot: 'weapon', type: 'sword', tier: 2, lvl: 20, dmg: [14, 34], speed: 1.25, two: true, icon: '⚔️' });
base('rune_sword', '符文劍', 'Rune Sword', { slot: 'weapon', type: 'sword', tier: 3, lvl: 32, dmg: [18, 44], speed: 1.55, icon: '⚔️' });
base('hand_axe', '手斧', 'Hand Axe', { slot: 'weapon', type: 'axe', tier: 1, lvl: 2, dmg: [3, 8], speed: 1.45, icon: '🪓' });
base('war_axe', '戰斧', 'War Axe', { slot: 'weapon', type: 'axe', tier: 2, lvl: 18, dmg: [10, 26], speed: 1.4, icon: '🪓' });
base('great_axe', '巨斧', 'Great Axe', { slot: 'weapon', type: 'axe', tier: 3, lvl: 36, dmg: [30, 70], speed: 1.05, two: true, icon: '🪓' });
base('club', '棍棒', 'Club', { slot: 'weapon', type: 'mace', tier: 1, lvl: 1, dmg: [2, 9], speed: 1.4, icon: '🏏' });
base('flail', '連枷', 'Flail', { slot: 'weapon', type: 'mace', tier: 2, lvl: 16, dmg: [6, 30], speed: 1.35, icon: '🔨' });
base('war_hammer', '戰鎚', 'War Hammer', { slot: 'weapon', type: 'mace', tier: 3, lvl: 34, dmg: [35, 75], speed: 1.0, two: true, icon: '🔨' });
base('short_bow', '短弓', 'Short Bow', { slot: 'weapon', type: 'bow', tier: 1, lvl: 1, dmg: [2, 6], speed: 1.7, two: true, icon: '🏹' });
base('long_bow', '長弓', 'Long Bow', { slot: 'weapon', type: 'bow', tier: 2, lvl: 15, dmg: [6, 22], speed: 1.55, two: true, icon: '🏹' });
base('war_bow', '戰爭之弓', 'War Bow', { slot: 'weapon', type: 'bow', tier: 3, lvl: 33, dmg: [16, 48], speed: 1.55, two: true, icon: '🏹' });
base('wand', '魔杖', 'Wand', { slot: 'weapon', type: 'wand', tier: 1, lvl: 1, dmg: [1, 5], speed: 1.5, icon: '🪄', sk: 1 });
base('bone_wand', '骨杖', 'Bone Wand', { slot: 'weapon', type: 'wand', tier: 2, lvl: 15, dmg: [4, 12], speed: 1.5, icon: '🪄', sk: 1 });
base('grim_wand', '冥府魔杖', 'Grim Wand', { slot: 'weapon', type: 'wand', tier: 3, lvl: 32, dmg: [8, 20], speed: 1.5, icon: '🪄', sk: 2 });
base('battle_staff', '戰鬥法杖', 'Battle Staff', { slot: 'weapon', type: 'staff', tier: 2, lvl: 16, dmg: [8, 22], speed: 1.3, two: true, icon: '🦯', sk: 1 });
base('staff', '法杖', 'Quarterstaff', { slot: 'weapon', type: 'staff', tier: 1, lvl: 4, dmg: [4, 12], speed: 1.3, two: true, icon: '🦯', sk: 1 });
base('elder_staff', '長者法杖', 'Elder Staff', { slot: 'weapon', type: 'staff', tier: 3, lvl: 30, dmg: [14, 36], speed: 1.3, two: true, icon: '🦯', sk: 2 });
// armour
base('cap', '皮帽', 'Cap', { slot: 'head', tier: 1, lvl: 1, def: [3, 5], icon: '🧢' });
base('helm', '頭盔', 'Helm', { slot: 'head', tier: 2, lvl: 14, def: [15, 20], icon: '⛑️' });
base('circlet', '頭環', 'Circlet', { slot: 'head', tier: 2, lvl: 18, def: [8, 12], icon: '💠', sk: 1 });
base('crown', '王冠', 'Crown', { slot: 'head', tier: 3, lvl: 32, def: [35, 50], icon: '👑' });
base('quilted', '襯墊甲', 'Quilted Armour', { slot: 'body', tier: 1, lvl: 1, def: [8, 11], icon: '🦺' });
base('chain', '鎖子甲', 'Chain Mail', { slot: 'body', tier: 2, lvl: 15, def: [40, 55], icon: '🥋' });
base('plate', '全身鎧', 'Full Plate', { slot: 'body', tier: 3, lvl: 34, def: [90, 120], icon: '🛡️' });
base('gloves', '皮手套', 'Leather Gloves', { slot: 'gloves', tier: 1, lvl: 2, def: [2, 3], icon: '🧤' });
base('gauntlets', '鐵手套', 'Gauntlets', { slot: 'gloves', tier: 2, lvl: 20, def: [12, 16], icon: '🧤' });
base('war_gauntlets', '戰神護手', 'War Gauntlets', { slot: 'gloves', tier: 3, lvl: 36, def: [28, 36], icon: '🧤' });
base('boots', '皮靴', 'Boots', { slot: 'boots', tier: 1, lvl: 2, def: [2, 3], icon: '👢' });
base('greaves', '鐵靴', 'Greaves', { slot: 'boots', tier: 2, lvl: 20, def: [12, 16], icon: '🥾' });
base('war_boots', '戰神之靴', 'War Boots', { slot: 'boots', tier: 3, lvl: 36, def: [28, 36], icon: '🥾' });
base('sash', '腰帶', 'Sash', { slot: 'belt', tier: 1, lvl: 2, def: [2, 3], icon: '🎗️' });
base('war_belt', '戰鬥腰帶', 'War Belt', { slot: 'belt', tier: 2, lvl: 22, def: [12, 16], icon: '🎗️' });
base('plated_belt', '板甲腰帶', 'Plated Belt', { slot: 'belt', tier: 3, lvl: 38, def: [28, 36], icon: '🎗️' });
base('buckler', '小圓盾', 'Buckler', { slot: 'offhand', tier: 1, lvl: 1, def: [4, 6], block: 20, icon: '🛡️' });
base('kite', '鳶形盾', 'Kite Shield', { slot: 'offhand', tier: 2, lvl: 16, def: [20, 28], block: 28, icon: '🛡️' });
base('tower', '塔盾', 'Tower Shield', { slot: 'offhand', tier: 3, lvl: 32, def: [45, 60], block: 35, icon: '🛡️' });
base('orb', '法球', 'Sacred Orb', { slot: 'offhand', tier: 2, lvl: 12, def: [2, 4], icon: '🔮', sk: 1 });
base('ring', '戒指', 'Ring', { slot: 'ring', tier: 1, lvl: 1, icon: '💍', jewel: true });
base('amulet', '項鍊', 'Amulet', { slot: 'amulet', tier: 1, lvl: 1, icon: '📿', jewel: true });
export const BASES = B;

// affixes: k = the stat; [min, max] at its item level band; slots it can roll on
// p = prefix (adds a word in front), s = suffix (… of something)
export const AFFIXES = [
  { k: 'edmg', p: [['鋒利的', 'Sharp'], ['殘酷的', 'Cruel'], ['殘暴的', 'Merciless']], r: [[15, 35], [40, 80], [90, 160]], slots: ['weapon'] },
  { k: 'mindmg', p: [['尖銳的', 'Jagged'], ['致命的', 'Deadly']], r: [[1, 3], [4, 10], [10, 20]], slots: ['weapon', 'ring', 'amulet', 'gloves'] },
  { k: 'maxdmg', s: [['之力', 'of Might'], ['之暴怒', 'of Fury']], r: [[2, 5], [6, 14], [15, 30]], slots: ['weapon', 'ring', 'amulet', 'gloves'] },
  { k: 'ias', s: [['之敏捷', 'of Readiness'], ['之迅捷', 'of Alacrity'], ['之疾風', 'of Swiftness']], r: [[10, 15], [15, 25], [25, 40]], slots: ['weapon', 'gloves', 'amulet'] },
  { k: 'life', s: [['之活力', 'of Vitality'], ['之巨人', 'of the Giant'], ['之泰坦', 'of the Titan']], r: [[10, 25], [30, 55], [60, 100]], slots: ['head', 'body', 'belt', 'ring', 'amulet', 'offhand', 'boots'] },
  { k: 'mana', p: [['藍色的', 'Azure'], ['清澈的', 'Lapis'], ['星輝的', 'Starry']], r: [[10, 20], [25, 45], [50, 80]], slots: ['head', 'ring', 'amulet', 'weapon', 'offhand'] },
  { k: 'str', s: [['之力量', 'of Strength'], ['之猛獁', 'of the Mammoth']], r: [[3, 6], [7, 12], [13, 20]], slots: ['ring', 'amulet', 'gloves', 'belt', 'weapon', 'body'] },
  { k: 'dex', s: [['之靈巧', 'of Dexterity'], ['之獵豹', 'of the Leopard']], r: [[3, 6], [7, 12], [13, 20]], slots: ['ring', 'amulet', 'gloves', 'boots', 'weapon'] },
  { k: 'vit', s: [['之體魄', 'of Stamina'], ['之巨熊', 'of the Bear']], r: [[3, 6], [7, 12], [13, 20]], slots: ['ring', 'amulet', 'belt', 'body', 'head'] },
  { k: 'ene', s: [['之智慧', 'of the Mind'], ['之賢者', 'of the Sage']], r: [[3, 6], [7, 12], [13, 20]], slots: ['ring', 'amulet', 'head', 'weapon', 'offhand'] },
  { k: 'edef', p: [['堅固的', 'Sturdy'], ['強化的', 'Strong'], ['神聖的', 'Holy']], r: [[20, 40], [45, 80], [90, 150]], slots: ['head', 'body', 'gloves', 'boots', 'belt', 'offhand'] },
  { k: 'fres', p: [['紅寶石的', 'Ruby']], r: [[10, 20], [21, 30], [31, 40]], slots: ['head', 'body', 'boots', 'belt', 'ring', 'amulet', 'offhand'] },
  { k: 'cres', p: [['藍寶石的', 'Sapphire']], r: [[10, 20], [21, 30], [31, 40]], slots: ['head', 'body', 'boots', 'belt', 'ring', 'amulet', 'offhand'] },
  { k: 'lres', p: [['黃玉的', 'Topaz']], r: [[10, 20], [21, 30], [31, 40]], slots: ['head', 'body', 'boots', 'belt', 'ring', 'amulet', 'offhand'] },
  { k: 'allres', p: [['稜鏡的', 'Prismatic']], r: [[5, 9], [10, 15], [16, 25]], slots: ['amulet', 'offhand', 'body', 'ring'], minIl: 12 },
  { k: 'ls', s: [['之水蛭', 'of the Leech'], ['之吸血鬼', 'of the Vampire']], r: [[2, 4], [4, 7], [7, 10]], slots: ['weapon', 'ring', 'amulet', 'gloves'] },
  { k: 'fr', s: [['之旅人', 'of Traveling'], ['之疾行', 'of Speed']], r: [[10, 20], [20, 30], [30, 40]], slots: ['boots'] },
  { k: 'mf', s: [['之幸運', 'of Luck'], ['之財富', 'of Fortune']], r: [[5, 15], [15, 25], [25, 40]], slots: ['ring', 'amulet', 'head', 'boots', 'gloves'] },
  { k: 'crit', s: [['之精準', 'of Precision'], ['之致命', 'of Slaughter']], r: [[3, 6], [6, 10], [10, 15]], slots: ['weapon', 'gloves', 'ring', 'amulet'] },
  { k: 'skills', p: [['大師的', 'Master’s'], ['宗師的', 'Grandmaster’s']], r: [[1, 1], [1, 1], [1, 2]], slots: ['amulet', 'weapon', 'head', 'offhand'], minIl: 16, rare: true },
  { k: 'fdmg', p: [['燃燒的', 'Burning'], ['熔岩的', 'Molten']], r: [[3, 8], [9, 20], [21, 40]], slots: ['weapon', 'ring', 'amulet'] },
  { k: 'regen', s: [['之再生', 'of Regeneration']], r: [[2, 4], [4, 8], [8, 14]], slots: ['ring', 'amulet', 'body', 'head', 'belt'] },
];
export const STAT_NAMES = {
  edmg: ['+{v}% 增強傷害', '+{v}% Enhanced Damage'], mindmg: ['+{v} 最小傷害', '+{v} to Minimum Damage'], maxdmg: ['+{v} 最大傷害', '+{v} to Maximum Damage'],
  ias: ['+{v}% 攻擊速度', '+{v}% Attack Speed'], life: ['+{v} 生命', '+{v} to Life'], mana: ['+{v} 法力', '+{v} to Mana'],
  str: ['+{v} 力量', '+{v} to Strength'], dex: ['+{v} 敏捷', '+{v} to Dexterity'], vit: ['+{v} 體力', '+{v} to Vitality'], ene: ['+{v} 精力', '+{v} to Energy'],
  edef: ['+{v}% 增強防禦', '+{v}% Enhanced Defence'], fres: ['火焰抗性 +{v}%', 'Fire Resist +{v}%'], cres: ['冰冷抗性 +{v}%', 'Cold Resist +{v}%'], lres: ['閃電抗性 +{v}%', 'Lightning Resist +{v}%'],
  allres: ['所有抗性 +{v}', 'All Resistances +{v}'], ls: ['{v}% 生命竊取', '{v}% Life Stolen per Hit'], fr: ['+{v}% 移動速度', '+{v}% Faster Run'], mf: ['+{v}% 尋獲魔法物品', '+{v}% Magic Find'],
  crit: ['{v}% 致命一擊', '{v}% Deadly Strike'], skills: ['+{v} 所有技能等級', '+{v} to All Skills'], fdmg: ['+{v} 火焰傷害', 'Adds {v} Fire Damage'], regen: ['每秒回復 {v} 生命', 'Replenish {v} Life a second'],
  def: ['+{v} 防禦', '+{v} Defence'], dmgp: ['+{v}% 所有傷害', '+{v}% to All Damage'], thorns: ['反彈 {v} 傷害給攻擊者', 'Attacker Takes {v} Damage'], minion: ['+{v}% 召喚物力量', '+{v}% Summon Strength'],
};
// uniques: a fixed name on a base, fixed stats (ranges roll)
const HAND_UNIQUES = [
  { id: 'gravecaller', base: 'short_sword', n: ['召墓者', 'Gravecaller'], st: { edmg: [80, 120], ls: [5, 7], life: [15, 25] } },
  { id: 'emberbite', base: 'hand_axe', n: ['餘燼之咬', 'Emberbite'], st: { edmg: [60, 90], fdmg: [8, 14], ias: [20, 20] } },
  { id: 'hollowhorn', base: 'short_bow', n: ['空角', 'Hollowhorn'], st: { edmg: [70, 110], dex: [8, 12], ias: [20, 20] } },
  { id: 'whisperwood', base: 'staff', n: ['低語之木', 'Whisperwood'], st: { skills: [1, 1], mana: [40, 60], ene: [10, 15] } },
  { id: 'kingscap', base: 'cap', n: ['國王的帽子', 'King’s Cap'], st: { edef: [80, 120], mf: [20, 30], life: [20, 30] } },
  { id: 'rattlebones', base: 'quilted', n: ['白骨之甲', 'Rattlebones'], st: { edef: [100, 150], allres: [10, 15], vit: [10, 10] } },
  { id: 'stormstride', base: 'boots', n: ['風暴之履', 'Stormstride'], st: { fr: [30, 30], lres: [30, 40], dex: [8, 10] } },
  { id: 'sandsnake', base: 'sash', n: ['沙蛇腰帶', 'Sandsnake'], st: { life: [40, 60], regen: [5, 8], allres: [8, 12] } },
  { id: 'nightwing', base: 'long_bow', n: ['夜翼', 'Nightwing'], st: { edmg: [140, 180], crit: [15, 20], fdmg: [10, 18] }, lvl: 18 },
  { id: 'crown_ash', base: 'helm', n: ['灰燼之冠', 'Crown of Ashes'], st: { skills: [1, 1], fres: [30, 40], life: [40, 60] }, lvl: 20 },
  { id: 'bloodrage', base: 'war_axe', n: ['血怒', 'Bloodrage'], st: { edmg: [160, 220], ls: [8, 10], str: [15, 20] }, lvl: 22 },
  { id: 'starweave', base: 'chain', n: ['星辰編織', 'Starweave'], st: { edef: [120, 160], mana: [60, 90], skills: [1, 1] }, lvl: 22 },
  { id: 'oath', base: 'ring', n: ['誓約之戒', 'Ring of the Oath'], st: { life: [30, 40], mana: [30, 40], allres: [10, 15], mf: [10, 15] }, lvl: 15 },
  { id: 'heart', base: 'amulet', n: ['深淵之心', 'Heart of the Abyss'], st: { skills: [2, 2], allres: [20, 30], life: [40, 60] }, lvl: 30 },
  { id: 'godslayer', base: 'rune_sword', n: ['弒神者', 'Godslayer'], st: { edmg: [220, 300], crit: [20, 25], ias: [30, 40], ls: [6, 8] }, lvl: 34 },
  { id: 'aegis', base: 'tower', n: ['永恆之盾', 'Aegis Eternal'], st: { edef: [150, 200], allres: [25, 35], life: [60, 90] }, lvl: 34 },
  { id: 'meteorfall', base: 'elder_staff', n: ['隕落', 'Meteorfall'], st: { skills: [2, 3], fdmg: [30, 50], ene: [20, 30] }, lvl: 32 },
  { id: 'deadeye', base: 'war_bow', n: ['亡眼', 'Deadeye'], st: { edmg: [200, 260], dex: [20, 25], crit: [20, 30] }, lvl: 34 },
];
// …and 482 more uniques and 100 sets made by itemgen.js
export const { UNIQUES, SETS } = buildItems(B, HAND_UNIQUES);
export const UNIQUE_BY_ID = Object.fromEntries(UNIQUES.map((u) => [u.id, u])), SET_BY_ID = Object.fromEntries(SETS.map((s) => [s.id, s]));
// an item's own colour (uniques and sets), for the paper doll and the hero's model
export const itemColor = (it) => (!it ? null : it.u ? (UNIQUE_BY_ID[it.u] || {}).col : it.set ? (SET_BY_ID[it.set] || {}).col : null);
export const RARE_A = [['血', 'Blood'], ['惡夢', 'Doom'], ['靈魂', 'Soul'], ['風暴', 'Storm'], ['骨', 'Bone'], ['烏鴉', 'Raven'], ['龍', 'Dragon'], ['寒霜', 'Rime'], ['暗影', 'Shadow'], ['惡魔', 'Demon'], ['星', 'Star'], ['狼', 'Wolf']];
export const RARE_B = [['之牙', 'Fang'], ['之心', 'Heart'], ['之冠', 'Crown'], ['之刃', 'Edge'], ['之握', 'Grip'], ['之紗', 'Veil'], ['之歌', 'Song'], ['之盾', 'Ward'], ['之眼', 'Eye'], ['之翼', 'Wing'], ['之爪', 'Claw'], ['之誓', 'Oath']];
export const RARITY = { normal: { n: ['普通', 'Normal'], c: '#e8e8e8' }, magic: { n: ['魔法', 'Magic'], c: '#7a8aff' }, rare: { n: ['稀有', 'Rare'], c: '#ffe25a' }, unique: { n: ['暗金', 'Unique'], c: '#d8a84a' }, set: { n: ['套裝', 'Set'], c: '#3ade5a' } };
export const POTIONS = {
  hp1: { n: ['小治療藥水', 'Minor Healing Potion'], icon: '🧪', heal: 60, price: 30, c: '#e8382a' }, hp2: { n: ['治療藥水', 'Healing Potion'], icon: '🧪', heal: 180, price: 120, c: '#e8382a', lvl: 12 }, hp3: { n: ['強效治療藥水', 'Greater Healing Potion'], icon: '🧪', heal: 450, price: 400, c: '#e8382a', lvl: 28 },
  mp1: { n: ['小法力藥水', 'Minor Mana Potion'], icon: '🧴', mana: 50, price: 30, c: '#3a6ae8' }, mp2: { n: ['法力藥水', 'Mana Potion'], icon: '🧴', mana: 140, price: 110, c: '#3a6ae8', lvl: 12 }, mp3: { n: ['強效法力藥水', 'Greater Mana Potion'], icon: '🧴', mana: 320, price: 360, c: '#3a6ae8', lvl: 28 },
  rejuv: { n: ['回復藥水', 'Rejuvenation Potion'], icon: '💜', pct: 35, price: 500, c: '#a83ad8', lvl: 20 },
};
export const SLOTS = ['head', 'amulet', 'weapon', 'body', 'offhand', 'gloves', 'belt', 'ring1', 'ring2', 'boots'];
export const SLOT_NAMES = { head: ['頭部', 'Head'], amulet: ['項鍊', 'Amulet'], weapon: ['武器', 'Weapon'], body: ['盔甲', 'Body'], offhand: ['副手', 'Off-hand'], gloves: ['手套', 'Gloves'], belt: ['腰帶', 'Belt'], ring1: ['戒指', 'Ring'], ring2: ['戒指', 'Ring'], boots: ['靴子', 'Boots'] };
