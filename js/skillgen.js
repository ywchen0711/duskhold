// 200 skills per class: five trees of 40. Each tree has a theme (an element and a vocabulary) and a cycle of
// mechanics; every skill is a mechanic with its own numbers, a name built from the theme's words, an icon and a
// description. The original hand-made skills sit in their trees as signature skills.
// Mechanics (main.js runs them): proj nova area cone chain melee bow dash teleport buff passive curse summon form
// formstrike corpse revive heal trap.

const lerp = (a, b, t) => a + (b - a) * t;
function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// the damage a skill is worth at its required level and skill level
export const budget = (req, lv) => (6 + req * 3.6) * (1 + 0.13 * (lv - 1));
const W = (zh, en) => [zh, en];

// nouns for each mechanic (zh, en), shared; trees may override
const NOUN = {
  proj: [W('彈', 'Bolt'), W('球', 'Orb'), W('矛', 'Lance'), W('飛刃', 'Shard'), W('流星', 'Comet'), W('飛矢', 'Dart'), W('之觸', 'Touch'), W('彗星', 'Meteorite')],
  nova: [W('新星', 'Nova'), W('爆發', 'Burst'), W('衝擊', 'Shockwave'), W('漩渦', 'Vortex'), W('脈衝', 'Pulse')],
  area: [W('之雨', 'Rain'), W('風暴', 'Storm'), W('之陣', 'Circle'), W('領域', 'Field'), W('裂隙', 'Rift'), W('降臨', 'Descent'), W('之池', 'Pool')],
  cone: [W('吐息', 'Breath'), W('噴流', 'Jet'), W('扇擊', 'Fan'), W('怒濤', 'Surge')],
  chain: [W('鎖鏈', 'Chain'), W('連環', 'Arc'), W('迴響', 'Echo')],
  buff: [W('護盾', 'Shield'), W('鎧甲', 'Armour'), W('附魔', 'Enchant'), W('之心', 'Heart'), W('祝福', 'Blessing'), W('之魂', 'Spirit')],
  passive: [W('掌控', 'Mastery'), W('精通', 'Expertise'), W('共鳴', 'Resonance'), W('專注', 'Focus'), W('天賦', 'Gift'), W('智慧', 'Wisdom'), W('本能', 'Instinct'), W('意志', 'Will')],
  curse: [W('詛咒', 'Curse'), W('印記', 'Mark'), W('凋零', 'Wither'), W('枷鎖', 'Shackles')],
  summon: [W('精靈', 'Spirit'), W('守衛', 'Warden'), W('魔像', 'Golem'), W('化身', 'Avatar')],
  melee: [W('斬', 'Slash'), W('擊', 'Strike'), W('劈', 'Cleave'), W('連擊', 'Flurry'), W('重擊', 'Smash'), W('突刺', 'Thrust')],
  bow: [W('箭', 'Arrow'), W('射擊', 'Shot'), W('箭雨', 'Volley'), W('連射', 'Barrage'), W('穿心箭', 'Piercer')],
  dash: [W('衝鋒', 'Charge'), W('突進', 'Rush'), W('閃擊', 'Blitz')],
  trap: [W('陷阱', 'Trap'), W('哨塔', 'Sentry'), W('圖騰', 'Totem')],
  heal: [W('復甦', 'Renewal'), W('甘露', 'Dew'), W('癒合', 'Mending')],
  formstrike: [W('撕咬', 'Maul'), W('爪擊', 'Rake'), W('衝撞', 'Ram'), W('狂咬', 'Frenzy Bite')],
  corpse: [W('屍爆', 'Corpse Blast')], revive: [W('復活', 'Raise')],
};
const ICON = {
  fire: { proj: '🔥', nova: '💥', area: '☄️', cone: '🐉', chain: '🔥', buff: '🛡️', passive: '📈', melee: '🗡️', bow: '🏹' },
  cold: { proj: '❄️', nova: '💠', area: '🌨️', cone: '🌬️', chain: '❄️', buff: '🧊', passive: '📈', melee: '🗡️', bow: '🏹' },
  light: { proj: '⚡', nova: '🌩️', area: '⛈️', cone: '⚡', chain: '🔗', buff: '🔆', passive: '📈', melee: '🗡️', bow: '🏹' },
  poison: { proj: '🧪', nova: '☣️', area: '🫧', cone: '🤢', chain: '🧪', buff: '🍄', passive: '📈', melee: '🗡️', bow: '🏹' },
  phys: { proj: '🦴', nova: '💢', area: '🌪️', cone: '🪓', chain: '🔗', buff: '🛡️', passive: '📈', melee: '⚔️', bow: '🏹' },
  magic: { proj: '🔮', nova: '✴️', area: '🌀', cone: '🌌', chain: '✨', buff: '🫧', passive: '📈', melee: '🗡️', bow: '🏹' },
};
const MICON = { curse: '💀', summon: '👻', dash: '💨', trap: '🪤', heal: '🌿', form: '🐺', formstrike: '🐾', corpse: '💣', revive: '⚰️', teleport: '✨' };
const EL_ZH = { fire: '火焰', cold: '冰冷', light: '閃電', poison: '毒素', phys: '物理', magic: '魔法' };
const EL_EN = { fire: 'fire', cold: 'cold', light: 'lightning', poison: 'poison', phys: 'physical', magic: 'magic' };

// ------------------------------------------------------------------ the trees
// cycle: the mechanics a tree's 40 skills go through; sig: [position, original skill id]
const T = (o) => o;
export const TREE_DEFS = {
  warrior: [
    T({ id: 'combat', n: W('戰技', 'Combat Arts'), icon: '⚔️', el: 'phys', kind: 'melee', cycle: ['melee', 'melee', 'dash', 'melee', 'passive', 'melee', 'nova', 'melee'], sig: [[0, 'bash'], [10, 'leap'], [29, 'whirl']],
      adj: [W('猛', 'Fierce'), W('疾風', 'Gale'), W('雷霆', 'Thunder'), W('破甲', 'Sunder'), W('旋', 'Spinning'), W('雙', 'Twin'), W('猛虎', 'Tiger'), W('裂地', 'Earthsplit'), W('斷鋼', 'Steelbreaker'), W('龍牙', 'Dragonfang'), W('殘月', 'Waning Moon'), W('天崩', 'Skyfall')] }),
    T({ id: 'cries', n: W('戰吼', 'Warcries'), icon: '📢', el: 'phys', kind: 'spell', cycle: ['nova', 'buff', 'curse', 'nova', 'buff', 'passive', 'nova', 'curse'], sig: [[13, 'warcry']],
      adj: [W('震天', 'Thundering'), W('戰神', 'War God'), W('狂獅', 'Lion'), W('鐵血', 'Ironblood'), W('不屈', 'Unbowed'), W('咆哮', 'Roaring'), W('威嚇', 'Daunting'), W('號令', 'Rallying'), W('英雄', 'Heroic'), W('先祖', 'Ancestral'), W('戰鼓', 'Wardrum'), W('凱旋', 'Triumphant')],
      nouns: { nova: [W('怒吼', 'Roar'), W('戰嚎', 'Howl'), W('吶喊', 'Shout'), W('震波', 'Quake')], buff: [W('戰令', 'Battle Order'), W('號角', 'Horn'), W('意志', 'Resolve'), W('戰歌', 'War Song')], curse: [W('威壓', 'Intimidation'), W('恐嚇', 'Terror'), W('挑釁', 'Taunt')] } }),
    T({ id: 'guard', n: W('守護', 'Guardian'), icon: '🛡️', el: 'phys', kind: 'melee', cycle: ['passive', 'buff', 'melee', 'passive', 'nova', 'buff', 'passive', 'heal'], sig: [[4, 'ironskin']],
      adj: [W('鐵壁', 'Ironwall'), W('磐石', 'Bedrock'), W('聖盾', 'Holy Shield'), W('堅毅', 'Steadfast'), W('守望', 'Vigilant'), W('銅牆', 'Bronze'), W('城塞', 'Bastion'), W('不動', 'Immovable'), W('誓約', 'Oathbound'), W('壁壘', 'Rampart'), W('金剛', 'Adamant'), W('守夜', 'Nightwatch')] }),
    T({ id: 'rage', n: W('狂戰', 'Berserker'), icon: '💢', el: 'fire', kind: 'melee', cycle: ['melee', 'buff', 'passive', 'melee', 'dash', 'melee', 'nova', 'passive'], sig: [[21, 'frenzy']],
      adj: [W('狂怒', 'Raging'), W('血怒', 'Bloodrage'), W('焚身', 'Burning'), W('嗜血', 'Bloodthirsty'), W('野性', 'Savage'), W('瘋狂', 'Mad'), W('戰慄', 'Dread'), W('暴走', 'Rampaging'), W('赤焰', 'Crimson'), W('魔怒', 'Demonrage'), W('烈魂', 'Fierysoul'), W('劫火', 'Calamity')] }),
    T({ id: 'master', n: W('武器大師', 'Weapon Master'), icon: '🗡️', el: 'phys', kind: 'melee', cycle: ['passive', 'melee', 'passive', 'melee', 'cone', 'passive', 'melee', 'chain'],
      adj: [W('劍聖', 'Swordsaint'), W('斧王', 'Axelord'), W('錘匠', 'Hammerer'), W('槍神', 'Spearmaster'), W('精準', 'Precise'), W('致命', 'Lethal'), W('無影', 'Shadowless'), W('千刃', 'Thousand-blade'), W('流水', 'Flowing'), W('破軍', 'Armybreaker'), W('一閃', 'Flash'), W('無雙', 'Peerless')] }),
  ],
  ranger: [
    T({ id: 'archery', n: W('弓術', 'Archery'), icon: '🎯', el: 'phys', kind: 'bow', cycle: ['bow', 'bow', 'passive', 'bow', 'bow', 'dash', 'bow', 'passive'], sig: [[0, 'power'], [8, 'multi'], [31, 'rain']],
      adj: [W('鷹眼', 'Hawkeye'), W('疾', 'Swift'), W('穿雲', 'Cloudpiercer'), W('連珠', 'Pearl-string'), W('暗', 'Shadow'), W('獵', 'Hunter’s'), W('風行', 'Windwalker'), W('百步', 'Hundred-pace'), W('流星', 'Shooting Star'), W('天弓', 'Skybow'), W('破甲', 'Armour-piercing'), W('無聲', 'Silent')] }),
    T({ id: 'frostbow', n: W('冰霜箭', 'Frost Arrows'), icon: '❄️', el: 'cold', kind: 'bow', cycle: ['bow', 'bow', 'nova', 'bow', 'passive', 'area', 'bow', 'buff'], sig: [[15, 'frost']],
      adj: [W('寒霜', 'Frost'), W('冰晶', 'Crystal'), W('凜冬', 'Winter'), W('雪狼', 'Snowwolf'), W('極地', 'Polar'), W('冰河', 'Glacial'), W('霜降', 'Rimefall'), W('永凍', 'Permafrost'), W('白魔', 'White Witch'), W('冰魄', 'Ice-soul'), W('凍原', 'Tundra'), W('冰龍', 'Ice Dragon')] }),
    T({ id: 'firebow', n: W('烈焰箭', 'Fire Arrows'), icon: '💥', el: 'fire', kind: 'bow', cycle: ['bow', 'bow', 'area', 'bow', 'passive', 'bow', 'nova', 'buff'], sig: [[22, 'explode']],
      adj: [W('火', 'Fire'), W('爆炎', 'Explosive'), W('燎原', 'Wildfire'), W('炎', 'Flame'), W('灼熱', 'Searing'), W('熔岩', 'Magma'), W('烽火', 'Beacon'), W('火鳥', 'Firebird'), W('紅蓮', 'Crimson Lotus'), W('烈日', 'Blazing Sun'), W('焚天', 'Skyburner'), W('火龍', 'Fire Drake')] }),
    T({ id: 'traps', n: W('陷阱', 'Traps'), icon: '🪤', el: 'light', kind: 'spell', cycle: ['trap', 'trap', 'area', 'passive', 'trap', 'curse', 'trap', 'nova'],
      adj: [W('雷擊', 'Shock'), W('飛刃', 'Blade'), W('電網', 'Web'), W('烈焰', 'Fire'), W('死亡', 'Death'), W('閃電', 'Lightning'), W('毒刺', 'Venom'), W('迴旋', 'Spinning'), W('爆裂', 'Blast'), W('雷神', 'Thunder God'), W('哨兵', 'Sentinel'), W('天羅', 'Heaven’s Net')] }),
    T({ id: 'hunter', n: W('遊獵', 'Hunter'), icon: '🐺', el: 'phys', kind: 'spell', cycle: ['passive', 'summon', 'buff', 'passive', 'dash', 'summon', 'passive', 'heal'], sig: [[2, 'evasion']],
      adj: [W('狼群', 'Pack'), W('獵鷹', 'Falcon'), W('林地', 'Woodland'), W('潛行', 'Stalking'), W('野地', 'Wild'), W('月影', 'Moonshadow'), W('迅捷', 'Fleet'), W('追蹤', 'Tracking'), W('荒野', 'Wilderness'), W('山貓', 'Lynx'), W('森靈', 'Forest'), W('風語', 'Windspeaker')],
      nouns: { summon: [W('狼', 'Wolf'), W('鷹', 'Hawk'), W('熊', 'Bear'), W('靈貓', 'Spirit Cat')] } }),
  ],
  sorc: [
    T({ id: 'fire', n: W('火焰', 'Fire'), icon: '🔥', el: 'fire', kind: 'spell', cycle: ['proj', 'nova', 'proj', 'area', 'passive', 'cone', 'proj', 'buff'], sig: [[0, 'fireball'], [33, 'meteor']],
      adj: [W('火焰', 'Flame'), W('烈焰', 'Blaze'), W('熾炎', 'Searing'), W('灼熱', 'Scorching'), W('熔岩', 'Magma'), W('業火', 'Hellfire'), W('焚天', 'Skyburn'), W('炎龍', 'Dragonfire'), W('紅蓮', 'Crimson Lotus'), W('烈陽', 'Sunfire'), W('鳳凰', 'Phoenix'), W('煉獄', 'Inferno')] }),
    T({ id: 'cold', n: W('冰霜', 'Cold'), icon: '❄️', el: 'cold', kind: 'spell', cycle: ['proj', 'nova', 'area', 'proj', 'buff', 'cone', 'passive', 'proj'], sig: [[8, 'nova']],
      adj: [W('冰', 'Ice'), W('霜', 'Frost'), W('寒冰', 'Glacial'), W('暴雪', 'Blizzard'), W('冰晶', 'Crystal'), W('凜冬', 'Winter'), W('永凍', 'Permafrost'), W('極光', 'Aurora'), W('冰魄', 'Ice-soul'), W('雪月', 'Snowmoon'), W('冰河', 'Glacier'), W('絕對零度', 'Absolute Zero')] }),
    T({ id: 'light', n: W('閃電', 'Lightning'), icon: '⚡', el: 'light', kind: 'spell', cycle: ['proj', 'chain', 'nova', 'proj', 'area', 'passive', 'chain', 'buff'], sig: [[16, 'chain']],
      adj: [W('雷', 'Thunder'), W('電', 'Spark'), W('雷霆', 'Thunderclap'), W('閃光', 'Flash'), W('天雷', 'Heaven’s'), W('雷龍', 'Storm Dragon'), W('紫電', 'Violet'), W('靜電', 'Static'), W('雷神', 'Thor’s'), W('奔雷', 'Rolling Thunder'), W('電漿', 'Plasma'), W('九天', 'Nine Heavens')] }),
    T({ id: 'arcane', n: W('秘法', 'Arcane'), icon: '🔮', el: 'magic', kind: 'spell', cycle: ['proj', 'buff', 'teleport', 'nova', 'passive', 'summon', 'proj', 'curse'], sig: [[3, 'shield'], [24, 'teleport']],
      adj: [W('奧術', 'Arcane'), W('秘法', 'Mystic'), W('虛空', 'Void'), W('星辰', 'Astral'), W('以太', 'Ether'), W('靈能', 'Psionic'), W('混沌', 'Chaos'), W('時光', 'Chrono'), W('幻影', 'Phantom'), W('符文', 'Rune'), W('魔導', 'Magitek'), W('天體', 'Celestial')] }),
    T({ id: 'mastery', n: W('元素掌控', 'Elemental Mastery'), icon: '🌈', el: 'magic', kind: 'spell', cycle: ['passive', 'passive', 'buff', 'passive', 'nova', 'passive', 'area', 'passive'],
      adj: [W('元素', 'Elemental'), W('火之', 'Fire'), W('冰之', 'Ice'), W('雷之', 'Storm'), W('三相', 'Trinity'), W('法力', 'Mana'), W('奧秘', 'Arcanum'), W('大法師', 'Archmage'), W('賢者', 'Sage'), W('稜鏡', 'Prismatic'), W('源能', 'Wellspring'), W('魔典', 'Grimoire')] }),
  ],
  druid: [
    T({ id: 'elements', n: W('元素', 'Elemental'), icon: '🌋', el: 'fire', kind: 'spell', cycle: ['proj', 'area', 'nova', 'cone', 'proj', 'passive', 'area', 'buff'],
      adj: [W('熔岩', 'Molten'), W('火山', 'Volcanic'), W('地裂', 'Fissure'), W('岩漿', 'Lava'), W('大地', 'Earthen'), W('焦土', 'Scorched'), W('山崩', 'Landslide'), W('烈火', 'Wildfire'), W('炎岩', 'Firestone'), W('地心', 'Earthcore'), W('灰燼', 'Cinder'), W('火之森', 'Burning Grove')],
      nouns: { proj: [W('巨石', 'Boulder'), W('火岩', 'Firestone'), W('熔彈', 'Magma Ball'), W('碎岩', 'Rubble')] } }),
    T({ id: 'shape', n: W('變身', 'Shapeshifting'), icon: '🐺', el: 'phys', kind: 'melee', cycle: ['form', 'formstrike', 'passive', 'formstrike', 'buff', 'formstrike', 'passive', 'form'],
      adj: [W('狼人', 'Werewolf'), W('熊人', 'Werebear'), W('野獸', 'Beast'), W('月嚎', 'Moonhowl'), W('狂熊', 'Wild Bear'), W('血爪', 'Bloodclaw'), W('獸王', 'Beastlord'), W('銀狼', 'Silverwolf'), W('灰熊', 'Grizzly'), W('影狼', 'Shadow Wolf'), W('巨熊', 'Great Bear'), W('原始', 'Primal')] }),
    T({ id: 'summon', n: W('召喚', 'Summoning'), icon: '🐻', el: 'phys', kind: 'spell', cycle: ['summon', 'summon', 'passive', 'buff', 'summon', 'heal', 'summon', 'passive'],
      adj: [W('靈狼', 'Spirit Wolf'), W('烏鴉', 'Raven'), W('熊靈', 'Bear Spirit'), W('藤蔓', 'Vine'), W('森林', 'Forest'), W('橡樹', 'Oak'), W('荊棘', 'Thorn'), W('月光', 'Moonlit'), W('古樹', 'Ancient'), W('狂野', 'Feral'), W('林精', 'Dryad'), W('大地', 'Earth')],
      nouns: { summon: [W('之靈', 'Spirit'), W('召喚', 'Calling'), W('守護者', 'Guardian'), W('群', 'Pack')] } }),
    T({ id: 'nature', n: W('自然', 'Nature'), icon: '🌿', el: 'poison', kind: 'spell', cycle: ['heal', 'curse', 'area', 'buff', 'passive', 'proj', 'heal', 'nova'],
      adj: [W('自然', 'Nature’s'), W('荊棘', 'Thorn'), W('翠綠', 'Verdant'), W('孢子', 'Spore'), W('花語', 'Blossom'), W('生命', 'Life'), W('苔蘚', 'Moss'), W('蜂群', 'Swarm'), W('毒藤', 'Poison Ivy'), W('月桂', 'Laurel'), W('世界樹', 'World Tree'), W('春雨', 'Spring Rain')] }),
    T({ id: 'storm', n: W('風暴', 'Storm'), icon: '🌪️', el: 'cold', kind: 'spell', cycle: ['proj', 'area', 'nova', 'chain', 'buff', 'proj', 'passive', 'cone'],
      adj: [W('颶風', 'Hurricane'), W('龍捲', 'Tornado'), W('極地', 'Arctic'), W('寒風', 'Biting Wind'), W('冰雹', 'Hail'), W('雷暴', 'Thunderstorm'), W('旋風', 'Cyclone'), W('暴風', 'Tempest'), W('北風', 'North Wind'), W('霜狼', 'Frostwolf'), W('天候', 'Weather'), W('風神', 'Wind God')] }),
  ],
  necro: [
    T({ id: 'bone', n: W('白骨', 'Bone'), icon: '🦴', el: 'magic', kind: 'spell', cycle: ['proj', 'buff', 'proj', 'nova', 'area', 'passive', 'proj', 'corpse'],
      adj: [W('白骨', 'Bone'), W('骸骨', 'Skeletal'), W('骨刺', 'Spine'), W('碎骨', 'Splinter'), W('墳墓', 'Grave'), W('亡骨', 'Deadbone'), W('骨靈', 'Bone Spirit'), W('枯骨', 'Withered'), W('骨牢', 'Bone Cage'), W('死亡', 'Death'), W('白魂', 'Pale Soul'), W('骨王', 'Bone King’s')],
      nouns: { proj: [W('之矛', 'Spear'), W('之牙', 'Teeth'), W('之靈', 'Spirit'), W('碎片', 'Shards')], buff: [W('骨甲', 'Bone Armour'), W('骨盾', 'Bone Shield'), W('骨牆', 'Bone Wall')] } }),
    T({ id: 'poison', n: W('毒素', 'Poison'), icon: '☣️', el: 'poison', kind: 'spell', cycle: ['proj', 'nova', 'area', 'melee', 'passive', 'cone', 'proj', 'curse'],
      adj: [W('劇毒', 'Toxic'), W('瘟疫', 'Plague'), W('腐蝕', 'Corrosive'), W('毒霧', 'Miasma'), W('蛇毒', 'Venom'), W('屍毒', 'Cadaver'), W('枯萎', 'Blight'), W('沼澤', 'Bog'), W('黑死', 'Black Death'), W('毒牙', 'Fang'), W('膿血', 'Pus'), W('死瘴', 'Deathfog')] }),
    T({ id: 'raise', n: W('召喚', 'Summoning'), icon: '💀', el: 'phys', kind: 'spell', cycle: ['summon', 'passive', 'summon', 'revive', 'summon', 'passive', 'buff', 'corpse'],
      adj: [W('骷髏', 'Skeleton'), W('亡靈', 'Undead'), W('鮮血', 'Blood'), W('鋼鐵', 'Iron'), W('黏土', 'Clay'), W('烈焰', 'Fire'), W('墓穴', 'Crypt'), W('亡者', 'Lich'), W('死騎', 'Death Knight'), W('冥府', 'Netherworld'), W('骨龍', 'Bone Dragon'), W('黑暗', 'Dark')],
      nouns: { summon: [W('戰士', 'Warrior'), W('法師', 'Mage'), W('魔像', 'Golem'), W('衛士', 'Guard')] } }),
    T({ id: 'curses', n: W('詛咒', 'Curses'), icon: '👁️', el: 'magic', kind: 'spell', cycle: ['curse', 'curse', 'passive', 'curse', 'nova', 'curse', 'buff', 'curse'],
      adj: [W('增幅', 'Amplify'), W('衰老', 'Decrepify'), W('虛弱', 'Weaken'), W('生命竊取', 'Life Tap'), W('恐懼', 'Terror'), W('混亂', 'Confuse'), W('低抗', 'Lower Resist'), W('鐵處女', 'Iron Maiden'), W('黑暗', 'Dark'), W('凋零', 'Withering'), W('吸魂', 'Soulsap'), W('末日', 'Doom')] }),
    T({ id: 'blood', n: W('血魔', 'Blood Magic'), icon: '🩸', el: 'phys', kind: 'spell', cycle: ['proj', 'heal', 'nova', 'buff', 'passive', 'area', 'chain', 'passive'],
      adj: [W('鮮血', 'Blood'), W('血月', 'Blood Moon'), W('血腥', 'Gory'), W('血河', 'Blood River'), W('吸血', 'Vampiric'), W('猩紅', 'Scarlet'), W('血咒', 'Hex-blood'), W('血肉', 'Flesh'), W('血魂', 'Bloodsoul'), W('血祭', 'Sacrificial'), W('血王', 'Blood Lord’s'), W('赤霧', 'Red Mist')] }),
  ],
};
// what each passive raises (picked in turn so a tree's passives differ)
const PASSIVE_STATS = {
  phys: ['dmgPct', 'crit', 'life', 'def', 'ias', 'ls'], fire: ['elPct', 'dmgPct', 'life', 'ias', 'res'], cold: ['elPct', 'res', 'mana', 'def', 'crit'],
  light: ['elPct', 'crit', 'mana', 'fr', 'res'], poison: ['elPct', 'regen', 'life', 'res', 'mana'], magic: ['elPct', 'mana', 'manaRegen', 'res', 'crit'],
};
const BUFF_STATS = { phys: ['dmgPct', 'def', 'ias', 'life', 'ls'], fire: ['dmgPct', 'thorns', 'ias', 'elPct'], cold: ['def', 'chill', 'res', 'absorb'], light: ['ias', 'fr', 'elPct', 'crit'], poison: ['regen', 'res', 'thorns', 'life'], magic: ['absorb', 'manaRegen', 'elPct', 'res'] };
const STAT_W = { dmgPct: (lv, req) => Math.round(8 + req * 0.4 + lv * 3), elPct: (lv, req) => Math.round(8 + req * 0.4 + lv * 4), crit: (lv) => 2 + Math.round(lv * 0.8), life: (lv, req) => Math.round(5 + req * 0.15 + lv * 2), mana: (lv, req) => Math.round(8 + req * 0.2 + lv * 3), def: (lv, req) => Math.round(15 + req * 0.5 + lv * 6), ias: (lv) => 4 + Math.round(lv * 1.5), ls: (lv) => 1 + Math.round(lv * 0.3), res: (lv) => 3 + Math.round(lv * 1.8), fr: (lv) => 3 + Math.round(lv * 1.2), regen: (lv, req) => Math.round(1 + req * 0.1 + lv * 0.8), manaRegen: (lv) => 5 + lv * 3, thorns: (lv, req) => Math.round(4 + req * 0.6 + lv * 3), chill: (lv) => 1, absorb: (lv) => Math.min(70, 20 + lv * 2) };
export const BONUS_NAMES = {
  dmgPct: ['傷害 +{v}%', '+{v}% damage'], elPct: ['{el}傷害 +{v}%', '+{v}% {el} damage'], crit: ['致命一擊 +{v}%', '+{v}% deadly strike'], life: ['生命 +{v}%', '+{v}% life'], mana: ['法力 +{v}%', '+{v}% mana'],
  def: ['防禦 +{v}%', '+{v}% defence'], ias: ['攻擊速度 +{v}%', '+{v}% attack speed'], ls: ['生命竊取 +{v}%', '+{v}% life steal'], res: ['所有抗性 +{v}', '+{v} all resistances'], fr: ['移動速度 +{v}%', '+{v}% faster run'],
  regen: ['每秒回復 {v} 生命', 'Regenerate {v} life a second'], manaRegen: ['法力回復 +{v}%', '+{v}% mana regeneration'], thorns: ['反彈 {v} 傷害給攻擊者', 'Attackers take {v} damage'], chill: ['冰甲：凍結攻擊者', 'Frost armour chills attackers'], absorb: ['{v}% 傷害由法力吸收', '{v}% of damage drains mana instead'],
  minion: ['召喚物傷害與生命 +{v}%', '+{v}% minion damage and life'],
};
const ALLY_BY = {
  warrior: ['spirit'], ranger: ['wolf', 'hawk', 'bear', 'cat'], sorc: ['spirit'], druid: ['wolf', 'raven', 'bear', 'vine'], necro: ['skelwar', 'skelmage', 'golem', 'skelwar'],
};

// build every class's trees
export function buildSkills(base) {
  const SK = { ...base }, TREES = {};
  for (const [cls, trees] of Object.entries(TREE_DEFS)) {
    TREES[cls] = [];
    const used = new Set();                        // names are unique across the whole class
    trees.forEach((tr, ti) => {
      const r = rng(cls.length * 7919 + ti * 104729 + 17), ids = [], count = {};
      const sigAt = new Map(tr.sig || []);
      for (let i = 0; i < 40; i++) {
        if (sigAt.has(i)) { const id = sigAt.get(i); SK[id] = { ...SK[id], tree: tr.id }; ids.push(id); used.add(tx0(SK[id].n)); continue; }
        const mech = tr.cycle[i % tr.cycle.length], req = Math.max(1, Math.min(60, Math.round(1 + i * 1.5 + (r() - 0.5) * 2)));
        const nouns = (tr.nouns && tr.nouns[mech]) || NOUN[mech] || NOUN.proj, k = count[mech] = (count[mech] || 0) + 1;
        let name = null;
        for (let t = 0; t < 40 && !name; t++) { const a = tr.adj[(k * 5 + t * 7 + ti) % tr.adj.length], nn = nouns[(k + t) % nouns.length], cand = [a[0] + nn[0], `${a[1]} ${nn[1]}`]; if (!used.has(cand[0])) name = cand; }
        if (!name) name = [tr.adj[i % tr.adj.length][0] + nouns[0][0] + (i + 1), `${tr.adj[i % tr.adj.length][1]} ${nouns[0][1]} ${i + 1}`];
        used.add(name[0]);
        const id = `${cls}_${tr.id}_${i}`;
        SK[id] = makeSkill(cls, tr, mech, req, name, i, r);
        ids.push(id);
      }
      TREES[cls].push({ id: tr.id, n: tr.n, icon: tr.icon, skills: ids });
    });
  }
  return { SKILLS: SK, TREES };
}
const tx0 = (n) => n[0];
function makeSkill(cls, tr, mech, req, name, i, r) {
  const el = tr.el, B = (lv) => budget(req, lv), S = { cls, tree: tr.id, req, n: name, mech, el, gen: true };
  const elZh = EL_ZH[el], elEn = EL_EN[el];
  S.icon = (MICON[mech] || (ICON[el] && ICON[el][mech]) || '✦');
  const v = (x) => () => x;
  switch (mech) {
    case 'proj': {
      const multi = r() < 0.35 ? 3 + Math.floor(r() * 3 + req / 20) : 1, pierce = r() < 0.25 ? 2 : 0, boom = r() < 0.35 ? 1.6 + r() * 1.2 : 0, jumps = el === 'light' && r() < 0.5 ? 2 + Math.floor(req / 15) : 0, homing = r() < 0.15;
      const per = (multi > 1 ? 1.6 / multi : 1) * (boom ? 0.85 : 1) * (jumps ? 0.7 : 1);
      Object.assign(S, { kind: 'spell', count: v(multi), pierce, boom, jumps, homing, speed: 13 + r() * 9, dmg: (lv) => Math.round(B(lv) * per), mana: (lv) => Math.round(2 + req * 0.22 + lv * 0.25 + multi * 0.6) });
      S.d = [`射出 ${multi > 1 ? '{count} 顆' : ''}${name[0]}，造成 {dmg} ${elZh}傷害${boom ? '並爆炸' : ''}${pierce ? '，可以貫穿' : ''}${jumps ? `，還會跳躍 ${jumps} 次` : ''}${homing ? '，會追蹤敵人' : ''}`, `Fire ${multi > 1 ? '{count} ' : 'a '}${name[1]}${multi > 1 ? 's' : ''} for {dmg} ${elEn} damage${boom ? ', exploding' : ''}${pierce ? ', piercing' : ''}${jumps ? `, jumping ${jumps} times` : ''}${homing ? ', seeking foes' : ''}`];
      break;
    }
    case 'nova': { const rr = 4.5 + req / 15 + r() * 1.5; Object.assign(S, { kind: 'spell', r: rr, dmg: (lv) => Math.round(B(lv) * 0.8), mana: (lv) => Math.round(5 + req * 0.3 + lv * 0.3), slow: el === 'cold' ? 2 : 0, stun: el === 'phys' && r() < 0.5 ? 1 : 0 });
      S.d = [`以你為中心爆發，對 ${rr.toFixed(1)} 範圍內造成 {dmg} ${elZh}傷害${S.slow ? '並緩速' : ''}${S.stun ? '並暈眩' : ''}`, `A burst around you: {dmg} ${elEn} damage within ${rr.toFixed(1)}${S.slow ? ', slowing' : ''}${S.stun ? ', stunning' : ''}`]; break; }
    case 'area': { const dot = r() < 0.5, rr = 2.8 + r() * 1.6 + req / 25, ticks = dot ? 6 + Math.floor(r() * 4) : 1, delay = dot ? 0.2 : 0.6 + r() * 0.6;
      Object.assign(S, { kind: 'spell', r: rr, ticks, delay, dmg: (lv) => Math.round(B(lv) * (dot ? 2.2 / ticks : 1.35)), mana: (lv) => Math.round(6 + req * 0.4 + lv * 0.4) });
      S.d = dot ? [`在目標區域降下${name[0]}：${ticks} 次，每次 {dmg} ${elZh}傷害`, `${name[1]} on the target area: ${ticks} hits of {dmg} ${elEn} damage`] : [`${delay.toFixed(1)} 秒後在目標處爆發，範圍內 {dmg} ${elZh}傷害`, `After ${delay.toFixed(1)} s the target area erupts: {dmg} ${elEn} damage`]; break; }
    case 'cone': { const ang = 0.4 + r() * 0.35, range = 6 + r() * 3; Object.assign(S, { kind: 'spell', ang, range, dmg: (lv) => Math.round(B(lv) * 0.95), mana: (lv) => Math.round(4 + req * 0.3 + lv * 0.3), slow: el === 'cold' ? 2 : 0 });
      S.d = [`向前方扇形噴出，${range.toFixed(0)} 距離內 {dmg} ${elZh}傷害`, `A cone ahead: {dmg} ${elEn} damage up to ${range.toFixed(0)} away`]; break; }
    case 'chain': { const jumps = 3 + Math.floor(req / 12); Object.assign(S, { kind: 'spell', jumps: v(jumps), dmg: (lv) => Math.round(B(lv) * 0.65), mana: (lv) => Math.round(5 + req * 0.3 + lv * 0.3) });
      S.d = [`在敵人間跳躍 {jumps} 次，每次 {dmg} ${elZh}傷害`, `Jumps between foes {jumps} times for {dmg} ${elEn} damage each`]; break; }
    case 'melee': case 'formstrike': {
      const hits = r() < 0.3 ? 2 + Math.floor(r() * 2) : 1, cleave = r() < 0.35 ? 2.4 : 0, stun = r() < 0.25 ? 0.8 : 0, leech = r() < 0.2 ? 4 : 0, add = el !== 'phys' ? 1 : 0;
      Object.assign(S, { kind: mech === 'formstrike' ? 'form' : 'melee', hits, cleave, stun, leech, pct: (lv) => Math.round((30 + req * 1.6 + (lv - 1) * 9) * (hits > 1 ? 0.6 : 1) * (cleave ? 0.85 : 1)), elDmg: add ? (lv) => Math.round(B(lv) * 0.35) : null, mana: (lv) => Math.round(2 + req * 0.12 + lv * 0.2) });
      if (mech === 'formstrike') S.form = i % 2 ? 'bear' : 'wolf';
      S.d = [`${hits > 1 ? `連打 ${hits} 次，` : ''}每擊傷害 +{pct}%${cleave ? '，橫掃周圍' : ''}${add ? `，附加 ${elZh}傷害` : ''}${stun ? '，暈眩' : ''}${leech ? '，吸取生命' : ''}${S.form ? `（${S.form === 'wolf' ? '狼人' : '熊人'}形態）` : ''}`, `${hits > 1 ? `${hits} quick hits, each` : 'A blow'} with +{pct}% damage${cleave ? ', cleaving around' : ''}${add ? `, adding ${elEn} damage` : ''}${stun ? ', stunning' : ''}${leech ? ', stealing life' : ''}${S.form ? ` (${S.form} form)` : ''}`];
      break;
    }
    case 'bow': {
      const multi = r() < 0.35 ? 3 + Math.floor(r() * 4) : 1, pierce = r() < 0.3 ? 3 : 0, boom = el !== 'phys' && r() < 0.4 ? 2.2 : 0, rain = r() < 0.12;
      Object.assign(S, { kind: 'bow', count: v(multi), pierce, boom, rain, pct: (lv) => Math.round((40 + req * 1.4 + (lv - 1) * 8) * (multi > 1 ? 0.55 : 1)), elDmg: el !== 'phys' ? (lv) => Math.round(B(lv) * (boom ? 0.6 : 0.4)) : null, mana: (lv) => Math.round(2 + req * 0.15 + lv * 0.2 + multi * 0.4), slow: el === 'cold' ? 2 : 0, r: rain ? 4 : boom });
      S.d = rain ? ['箭雨落在目標區域：6 次，每次 +{pct}% 傷害', 'Arrows rain on the target area: 6 hits at +{pct}% damage'] : [`射出 ${multi > 1 ? '{count} 支' : ''}${name[0]}，傷害 +{pct}%${S.elDmg ? `，附加 ${elZh}傷害` : ''}${pierce ? '，貫穿' : ''}${boom ? '，命中時爆炸' : ''}${S.slow ? '，緩速' : ''}`, `Loose ${multi > 1 ? '{count} arrows' : 'an arrow'} at +{pct}% damage${S.elDmg ? `, adding ${elEn} damage` : ''}${pierce ? ', piercing' : ''}${boom ? ', exploding on impact' : ''}${S.slow ? ', slowing' : ''}`];
      break;
    }
    case 'dash': { const dist = 7 + r() * 4; Object.assign(S, { kind: tr.kind === 'melee' ? 'melee' : 'spell', dist, cd: 2.5, pct: (lv) => Math.round(60 + req * 1.5 + (lv - 1) * 10), mana: (lv) => Math.round(5 + req * 0.15) });
      S.d = [`向前衝刺 ${dist.toFixed(0)} 距離，撞擊路上的敵人（傷害 +{pct}%）`, `Dash ${dist.toFixed(0)} forward, striking foes in the way (+{pct}% damage)`]; break; }
    case 'teleport': Object.assign(S, { kind: 'spell', cd: 0.6, mana: () => 12 }); S.d = ['瞬間移動到指定位置', 'Blink to the chosen spot']; break;
    case 'buff': case 'passive': {
      const pool = (mech === 'buff' ? BUFF_STATS : PASSIVE_STATS)[el], k = pool[(i + Math.floor(r() * 2)) % pool.length], k2 = r() < 0.4 ? pool[(i + 2) % pool.length] : null;
      S.kind = mech; S.stats = [k, k2].filter((x, j, a) => x && a.indexOf(x) === j);
      if (cls === 'necro' && tr.id === 'raise' && mech === 'passive') S.stats = ['minion'];
      if (cls === 'druid' && tr.id === 'summon' && mech === 'passive') S.stats = ['minion', S.stats[0]];
      S.val = (key, lv) => (key === 'minion' ? 10 + lv * 6 + Math.round(req * 0.3) : STAT_W[key](lv, req));
      if (mech === 'buff') { S.dur = 60 + Math.round(r() * 60); S.mana = (lv) => Math.round(8 + req * 0.2); }
      S.stats.forEach((key, j) => { S['v' + j] = (lv) => S.val(key, lv); });
      S.d = [S.stats.map((x, j) => BONUS_NAMES[x][0].replace('{el}', elZh).replace('{v}', `{v${j}}`)).join('，'), S.stats.map((x, j) => BONUS_NAMES[x][1].replace('{el}', elEn).replace('{v}', `{v${j}}`)).join(', ')];
      if (mech === 'buff') S.d = [`${S.dur} 秒內：` + S.d[0], `For ${S.dur} s: ` + S.d[1]];
      else S.d = ['被動：' + S.d[0], 'Passive: ' + S.d[1]];
      break;
    }
    case 'curse': {
      const kinds = ['amp', 'slow', 'weak', 'leech', 'dot'], k = kinds[(i + Math.floor(r() * 5)) % 5], rr = 3.5 + r() * 2;
      Object.assign(S, { kind: 'spell', curse: k, r: rr, dur: 8 + Math.round(r() * 6), val: (lv) => (k === 'dot' ? Math.round(budget(req, lv) * 0.25) : Math.min(k === 'slow' ? 60 : 80, 15 + lv * 3 + Math.round(req * 0.3))), mana: (lv) => Math.round(5 + req * 0.2) });
      const what = { amp: ['受到的傷害 +{val}%', 'take +{val}% damage'], slow: ['移動和攻擊變慢 {val}%', 'are {val}% slower'], weak: ['造成的傷害 −{val}%', 'deal {val}% less damage'], leech: ['被打時你回復傷害的 {val}%', 'heal you for {val}% of the damage they take'], dot: ['每秒受到 {val} 傷害', 'take {val} damage a second'] }[k];
      S.d = [`範圍內的敵人 ${S.dur} 秒內${what[0]}`, `Foes in the area ${what[1]} for ${S.dur} s`]; break;
    }
    case 'summon': {
      const kinds = ALLY_BY[cls], kind = kinds[(i + Math.floor(r() * kinds.length)) % kinds.length], perm = cls === 'necro';
      Object.assign(S, { kind: 'summon', ally: kind, count: (lv) => Math.min(perm ? 8 : 5, 1 + Math.floor(lv / (perm ? 3 : 5)) + (req > 30 ? 1 : 0)), dur: perm ? 0 : 40 + Math.round(r() * 30), adm: (lv) => Math.round(budget(req, lv) * 0.3), ahp: (lv) => Math.round(40 + req * 12 + lv * 18), mana: (lv) => Math.round(10 + req * 0.35) });
      S.d = [`召喚 {count} 個${name[0]}${perm ? '' : `（${S.dur} 秒）`}，每擊 {adm} 傷害，生命 {ahp}`, `Summon {count} ${name[1]}${perm ? '' : ` (${S.dur} s)`}: {adm} damage a hit, {ahp} life`]; break;
    }
    case 'trap': { const kind = r() < 0.5 ? 'sentry' : 'totem'; Object.assign(S, { kind: 'summon', ally: kind, count: (lv) => Math.min(5, 1 + Math.floor(lv / 6)), dur: 20, adm: (lv) => Math.round(budget(req, lv) * 0.45), ahp: (lv) => Math.round(30 + req * 6), mana: (lv) => Math.round(8 + req * 0.3), el });
      S.d = [`放置 {count} 個${name[0]}（20 秒），自動射擊敵人，每發 {adm} ${elZh}傷害`, `Place {count} ${name[1]}${'s'} (20 s) that shoot foes for {adm} ${elEn} damage`]; break; }
    case 'heal': Object.assign(S, { kind: 'spell', heal: (lv) => Math.round(20 + req * 4 + lv * 12), mana: (lv) => Math.round(8 + req * 0.3), cd: 3 }); S.d = ['為自己和召喚物回復 {heal} 生命', 'Heal yourself and your minions for {heal} life']; break;
    case 'form': { const form = i % 16 === 0 ? 'wolf' : 'bear'; Object.assign(S, { kind: 'buff', form, dur: 120, mana: () => 15, stats: form === 'wolf' ? ['ias', 'fr'] : ['life', 'dmgPct'], val: (key, lv) => STAT_W[key](lv, req) * (form === 'bear' && key === 'life' ? 4 : 1) });
      S.d = [form === 'wolf' ? '變身為狼人（120 秒）：攻擊與移動更快' : '變身為熊人（120 秒）：生命與傷害大增', form === 'wolf' ? 'Become a werewolf (120 s): faster attacks and movement' : 'Become a werebear (120 s): much more life and damage']; break; }
    case 'corpse': Object.assign(S, { kind: 'spell', r: 3.5, pct: (lv) => 40 + lv * 6, mana: (lv) => Math.round(8 + req * 0.25) }); S.d = ['引爆目標附近的屍體，造成屍體生命 {pct}% 的範圍傷害', 'Detonate a corpse near the target for {pct}% of its life in an area']; break;
    case 'revive': Object.assign(S, { kind: 'summon', ally: 'revived', count: (lv) => Math.min(6, 1 + Math.floor(lv / 4)), dur: 60, adm: (lv) => Math.round(budget(req, lv) * 0.4), ahp: (lv) => Math.round(60 + req * 15 + lv * 20), mana: (lv) => Math.round(15 + req * 0.4) }); S.d = ['讓附近的屍體復活為你戰鬥（最多 {count} 隻，60 秒）', 'Raise nearby corpses to fight for you (up to {count}, 60 s)']; break;
  }
  // make every number in the description callable by level
  for (const k of ['count', 'jumps']) if (typeof S[k] === 'number') { const n = S[k]; S[k] = () => n; }
  if (!S.mana) S.mana = () => 0;
  return S;
}
