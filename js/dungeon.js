// Levels: random rooms joined by corridors on a grid of 2-stud tiles; a boss lair is one big hall; the camp is a
// clearing with tents. Also walkability and a distance field for monsters to find you.
import { rng } from './loot.js?v=4';
export const TS = 2;
export const WALL = 0, FLOOR = 1, PILLAR = 2;
export const toW = (t) => t * TS + TS / 2, toT = (v) => Math.floor(v / TS);

export function genLevel(seed, boss = false) {
  const r = rng(seed), N = boss ? 40 : 64, grid = new Uint8Array(N * N);
  const rooms = [];
  const carveRect = (x0, y0, w, h, v = FLOOR) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (x > 0 && y > 0 && x < N - 1 && y < N - 1) grid[y * N + x] = v; };
  if (boss) {
    rooms.push({ x: 16, y: 31, w: 8, h: 6 }, { x: 7, y: 6, w: 26, h: 20 });
  } else {
    for (let tries = 0; tries < 200 && rooms.length < 16; tries++) {
      const w = 5 + Math.floor(r() * 7), h = 5 + Math.floor(r() * 6), x = 2 + Math.floor(r() * (N - w - 4)), y = 2 + Math.floor(r() * (N - h - 4));
      if (rooms.some((o) => x < o.x + o.w + 2 && x + w + 2 > o.x && y < o.y + o.h + 2 && y + h + 2 > o.y)) continue;
      rooms.push({ x, y, w, h });
    }
  }
  for (const o of rooms) { o.cx = Math.floor(o.x + o.w / 2); o.cy = Math.floor(o.y + o.h / 2); carveRect(o.x, o.y, o.w, o.h); }
  // join every room (a spanning tree by distance), plus a few loops
  const corridor = (a, b) => {
    const hFirst = r() < 0.5, w = 2;
    const run = (x0, y0, x1, y1) => { const dx = Math.sign(x1 - x0), dy = Math.sign(y1 - y0); let x = x0, y = y0; while (x !== x1 || y !== y1) { carveRect(x, y, w, w); if (x !== x1) x += dx; else y += dy; } carveRect(x, y, w, w); };
    if (hFirst) { run(a.cx, a.cy, b.cx, a.cy); run(b.cx, a.cy, b.cx, b.cy); } else { run(a.cx, a.cy, a.cx, b.cy); run(a.cx, b.cy, b.cx, b.cy); }
  };
  const inTree = new Set([0]), d = (a, b) => Math.abs(a.cx - b.cx) + Math.abs(a.cy - b.cy);
  while (inTree.size < rooms.length) {
    let best = null;
    for (const i of inTree) for (let j = 0; j < rooms.length; j++) if (!inTree.has(j)) { const v = d(rooms[i], rooms[j]); if (!best || v < best[0]) best = [v, i, j]; }
    corridor(rooms[best[1]], rooms[best[2]]); inTree.add(best[2]);
  }
  for (let k = 0; k < Math.floor(rooms.length / 3); k++) { const a = pickR(rooms, r), b = pickR(rooms, r); if (a !== b && d(a, b) < 26) corridor(a, b); }
  // start: the first room; the way down: the room farthest away by walking
  const start = rooms[0];
  const dist = field({ N, grid }, start.cx, start.cy);
  let end = rooms[rooms.length - 1], bd = -1;
  for (const o of rooms) { const v = dist[o.cy * N + o.cx]; if (v > bd) { bd = v; end = o; } }
  // pillars in big rooms (never on the centre lines, so corridors stay open)
  for (const o of rooms) if (o.w >= 8 && o.h >= 8 && o !== start && !boss) for (const [px, py] of [[o.x + 2, o.y + 2], [o.x + o.w - 3, o.y + 2], [o.x + 2, o.y + o.h - 3], [o.x + o.w - 3, o.y + o.h - 3]]) grid[py * N + px] = PILLAR;
  if (boss) for (const [px, py] of [[11, 10], [28, 10], [11, 21], [28, 21]]) grid[py * N + px] = PILLAR;
  // torches on walls next to floor, breakable urns and chests in rooms, monster packs
  const torches = [], props = [], packs = [];
  for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
    if (grid[y * N + x] !== WALL) continue;
    const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dy]) => grid[(y + dy) * N + x + dx] === FLOOR);
    if (near && r() < 0.035) torches.push({ x: toW(x), z: toW(y), dx: near[0], dz: near[1] });
  }
  for (const o of rooms) {
    if (o === start) continue;
    for (let i = 0; i < 2; i++) if (r() < 0.45) { const x = o.x + (r() < 0.5 ? 0 : o.w - 1), y = o.y + 1 + Math.floor(r() * (o.h - 2)); if (grid[y * N + x] === FLOOR) props.push({ x: toW(x), z: toW(y), kind: r() < 0.5 ? 'urn' : 'barrel' }); }
    if (!boss && r() < 0.28) { const x = o.x + 1 + Math.floor(r() * (o.w - 2)), y = o.y; if (grid[y * N + x] === FLOOR) props.push({ x: toW(x), z: toW(y) + 0.4, kind: 'chest' }); }
    if (!boss && o !== end) { const n = 1 + Math.floor(o.w * o.h / 50); for (let i = 0; i < n; i++) packs.push({ x: toW(o.x + 1 + Math.floor(r() * (o.w - 2))), z: toW(o.y + 1 + Math.floor(r() * (o.h - 2))) }); }
    if (!boss && o === end) packs.push({ x: toW(o.cx), z: toW(o.cy - 1), guard: true });
  }
  // nothing may sit on a pillar
  const onFloor = (p) => grid[toT(p.z) * N + toT(p.x)] === FLOOR;
  return { N, grid, rooms, boss, start: { x: toW(start.cx), z: toW(start.cy) }, end: { x: toW(end.cx), z: toW(end.cy) }, torches, props: props.filter(onFloor), packs: packs.filter(onFloor), bossAt: boss ? { x: toW(20), z: toW(12) } : null };
}
const pickR = (l, r) => l[Math.floor(r() * l.length)];

// the camp: an open clearing, tents for the merchant and the gambler, the stash, the waypoint and the way down
export function genTown() {
  const N = 30, grid = new Uint8Array(N * N);
  for (let y = 2; y < N - 2; y++) for (let x = 2; x < N - 2; x++) grid[y * N + x] = FLOOR;
  const P = (x, y) => ({ x: toW(x), z: toW(y) });
  const spots = { merchant: P(9, 10), gambler: P(20, 10), stash: P(15, 9), waypoint: P(15, 16), cave: P(15, 25), healer: P(9, 18), start: P(15, 20), portal: P(19, 19) };
  for (const k of ['merchant', 'gambler']) { const t = toT(spots[k].x), u = toT(spots[k].z) - 2; for (let y = u - 1; y <= u; y++) for (let x = t - 1; x <= t + 1; x++) grid[y * N + x] = PILLAR; }
  return { N, grid, town: true, rooms: [], start: spots.start, end: spots.cave, torches: [], props: [], packs: [], spots };
}

export const walk = (L, tx, ty) => tx >= 0 && ty >= 0 && tx < L.N && ty < L.N && L.grid[ty * L.N + tx] === FLOOR;
export const walkAt = (L, x, z) => walk(L, toT(x), toT(z));
// a circle against blocked tiles
export function collide(L, x, z, rad) {
  for (let pass = 0; pass < 2; pass++) for (let ty = toT(z - rad); ty <= toT(z + rad); ty++) for (let tx = toT(x - rad); tx <= toT(x + rad); tx++) {
    if (walk(L, tx, ty)) continue;
    const x0 = tx * TS, z0 = ty * TS, nx = Math.max(x0, Math.min(x, x0 + TS)), nz = Math.max(z0, Math.min(z, z0 + TS)), dx = x - nx, dz = z - nz, dd = Math.hypot(dx, dz);
    if (dd >= rad) continue;
    if (dd < 1e-6) { x = x < x0 + TS / 2 ? x0 - rad : x0 + TS + rad; continue; }
    x = nx + dx / dd * rad; z = nz + dz / dd * rad;
  }
  return [x, z];
}
// distance (in tiles) from a tile to everywhere walkable
export function field(L, sx, sy) {
  const N = L.N, d = new Int16Array(N * N).fill(-1), q = new Int32Array(N * N); let h = 0, t = 0;
  if (sx < 0 || sy < 0 || sx >= N || sy >= N) return d;
  d[sy * N + sx] = 0; q[t++] = sy * N + sx;
  while (h < t) { const i = q[h++], x = i % N, y = (i / N) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue; const j = ny * N + nx; if (d[j] >= 0 || L.grid[j] !== FLOOR) continue; d[j] = d[i] + 1; q[t++] = j; } }
  return d;
}
export function stepOn(L, d, x, z) {
  const N = L.N, tx = toT(x), ty = toT(z); let best = null, bv = d[ty * N + tx] < 0 ? 1e9 : d[ty * N + tx];
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const nx = tx + dx, ny = ty + dy; if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue; const v = d[ny * N + nx]; if (v < 0) continue;
    if (dx && dy && (L.grid[ty * N + nx] !== FLOOR || L.grid[ny * N + tx] !== FLOOR)) continue;
    const vv = v + (dx && dy ? 0.4 : 0); if (vv < bv) { bv = vv; best = [nx, ny]; }
  }
  return best ? [toW(best[0]), toW(best[1])] : null;
}
// can you see from a to b (walls block)?
export function sees(L, x0, z0, x1, z1) { const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.6); for (let i = 1; i < n; i++) { const t = i / n; if (!walkAt(L, x0 + (x1 - x0) * t, z0 + (z1 - z0) * t)) return false; } return true; }
