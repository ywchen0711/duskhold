// Little synthesized sounds (no files to load).
let ctx = null, on = true;
export const sfx = {
  get on() { return on; }, set on(v) { on = v; },
  unlock() { if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = null; } } if (ctx && ctx.state === 'suspended') ctx.resume(); },
  play(name) {
    if (!on || !ctx) return;
    const S = SOUNDS[name]; if (S) S(ctx.currentTime);
  },
};
function tone(t, f0, f1, dur, type = 'sine', vol = 0.18, delay = 0) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t + delay); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + delay + dur);
  g.gain.setValueAtTime(0.0001, t + delay); g.gain.exponentialRampToValueAtTime(vol, t + delay + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + delay + dur);
  o.connect(g).connect(ctx.destination); o.start(t + delay); o.stop(t + delay + dur + 0.05);
}
const SOUNDS = {
  click: (t) => tone(t, 700, 500, 0.06, 'square', 0.06),
  tick: (t) => tone(t, 1200, 1100, 0.05, 'square', 0.05),
  check: (t) => { tone(t, 880, 880, 0.08, 'triangle', 0.15); tone(t, 1320, 1320, 0.1, 'triangle', 0.12, 0.09); },
  good: (t) => tone(t, 660, 990, 0.14, 'triangle', 0.16),
  great: (t) => { tone(t, 784, 1175, 0.12, 'triangle', 0.16); tone(t, 1175, 1568, 0.16, 'triangle', 0.14, 0.1); },
  fail: (t) => { tone(t, 220, 110, 0.35, 'sawtooth', 0.14); tone(t, 233, 116, 0.35, 'square', 0.06); },
  hit: (t) => { tone(t, 160, 50, 0.35, 'square', 0.22); tone(t, 90, 40, 0.4, 'sawtooth', 0.12); },
  pick: (t) => tone(t, 900, 1500, 0.09, 'sine', 0.14),
  item: (t) => { tone(t, 600, 900, 0.1, 'triangle', 0.14); tone(t, 900, 1300, 0.12, 'triangle', 0.12, 0.08); },
  buy: (t) => { tone(t, 1000, 1000, 0.06, 'square', 0.08); tone(t, 1500, 1500, 0.1, 'square', 0.08, 0.07); },
  mdone: (t) => { for (let i = 0; i < 4; i++) tone(t, 523 * Math.pow(1.26, i), 523 * Math.pow(1.26, i), 0.14, 'triangle', 0.14, i * 0.09); },
  elev: (t) => { tone(t, 988, 988, 0.4, 'sine', 0.2); tone(t, 784, 784, 0.6, 'sine', 0.2, 0.35); },
  beat: (t) => { tone(t, 70, 45, 0.12, 'sine', 0.35); tone(t, 65, 40, 0.12, 'sine', 0.25, 0.16); },
  spot: (t) => { tone(t, 300, 600, 0.12, 'sawtooth', 0.1); tone(t, 320, 640, 0.18, 'sawtooth', 0.08, 0.1); },
  ability: (t) => { tone(t, 400, 1200, 0.25, 'sine', 0.15); },
  chop: (t) => { tone(t, 220, 140, 0.08, 'square', 0.12); tone(t, 180, 120, 0.06, 'triangle', 0.1, 0.05); },
  mine: (t) => { tone(t, 1400, 900, 0.05, 'square', 0.08); tone(t, 1800, 1100, 0.06, 'square', 0.06, 0.04); },
  splash: (t) => tone(t, 500, 120, 0.25, 'sawtooth', 0.06),
  bite: (t) => { tone(t, 900, 900, 0.07, 'square', 0.12); tone(t, 900, 900, 0.07, 'square', 0.12, 0.12); },
  catch: (t) => { for (let i = 0; i < 3; i++) tone(t, 660 * Math.pow(1.26, i), 660 * Math.pow(1.26, i), 0.12, 'triangle', 0.15, i * 0.08); },
  plant: (t) => tone(t, 300, 500, 0.12, 'sine', 0.14),
  water: (t) => { tone(t, 1200, 600, 0.2, 'sine', 0.06); tone(t, 1000, 500, 0.2, 'sine', 0.05, 0.1); },
  swing: (t) => tone(t, 300, 900, 0.1, 'sawtooth', 0.06),
  levelup: (t) => { for (let i = 0; i < 5; i++) tone(t, 523 * Math.pow(1.19, i), 523 * Math.pow(1.19, i), 0.16, 'triangle', 0.15, i * 0.08); },
  gift: (t) => { tone(t, 880, 1320, 0.15, 'sine', 0.15); tone(t, 1320, 1760, 0.2, 'sine', 0.12, 0.12); },
  win: (t) => { for (let i = 0; i < 6; i++) tone(t, 392 * Math.pow(1.12, i), 392 * Math.pow(1.12, i), 0.2, 'triangle', 0.16, i * 0.12); },
  over: (t) => { for (let i = 0; i < 4; i++) tone(t, 392 / Math.pow(1.12, i), 380 / Math.pow(1.12, i), 0.3, 'triangle', 0.15, i * 0.25); },
  fire: (t) => { tone(t, 180, 60, 0.35, 'sawtooth', 0.1); tone(t, 900, 200, 0.25, 'square', 0.03); },
  frost: (t) => { tone(t, 1600, 800, 0.3, 'sine', 0.1); tone(t, 2400, 1200, 0.25, 'triangle', 0.05, 0.05); },
  zap: (t) => { for (let i = 0; i < 4; i++) tone(t, 2000 - i * 300, 300, 0.05, 'square', 0.07, i * 0.03); },
  bow: (t) => tone(t, 500, 1400, 0.08, 'triangle', 0.1),
  thud: (t) => tone(t, 120, 50, 0.15, 'square', 0.12),
  boom: (t) => { tone(t, 90, 30, 0.6, 'sawtooth', 0.2); tone(t, 60, 25, 0.7, 'square', 0.12); },
  gold: (t) => { tone(t, 1800, 1800, 0.05, 'square', 0.06); tone(t, 2400, 2400, 0.06, 'square', 0.05, 0.05); },
  drop: (t) => tone(t, 300, 200, 0.12, 'triangle', 0.12),
  drink: (t) => { for (let i = 0; i < 3; i++) tone(t, 400 + i * 80, 300, 0.07, 'sine', 0.1, i * 0.07); },
  door: (t) => { tone(t, 140, 90, 0.4, 'sawtooth', 0.08); },
  die: (t) => tone(t, 220, 60, 0.4, 'sawtooth', 0.08),
  portal: (t) => { tone(t, 300, 1200, 0.5, 'sine', 0.12); tone(t, 600, 2400, 0.5, 'sine', 0.06, 0.1); },
};
