/**
 * Laid stones (2026-11-24, docs/explorations/2026-11-24-road-stones.md): kerbs and the courses of a road drawn stone by
 * stone, so paving follows the road's edge as laid paving does. Code decides where each stone lies and builds its plain
 * shape; what it looks like is painted: its top is one stone of a Codex sheet (tools/kit/stones.py cuts a sheet into
 * an atlas of equal cells, textures/stones-<name>.png, listed in stones.json).
 *
 * A row is laid along a line: joints cross it square to the line, and on the bisector where it turns, so a stone on a
 * bend is a wedge and the two stones at a corner are mitred to each other. Each stone is then that four-sided cut with
 * its corners rounded (each by its own amount), its long edges a little out of true, a pillowed top, and sides that
 * wear the painting folded down over the edge.
 * kit-render.ts calls kerbRows for a scene's kerb pieces and courseStones for its `courses` (compile.py).
 */
import * as THREE from 'three';

/** An atlas of painted stones: cols x rows equal cells, the first n filled (reading order). */
export type StoneSheet = { cols: number; rows: number; n: number };
/** One course of a road: lines (u) a row of stones is laid along, `w` u wide, on the road at `h` m. */
export type Course = { mat: string; h: number; w: number; row: number; lines: number[][][] };
type P2 = [number, number];

function rng(seed: number): () => number {
  let a = (seed | 0) || 1;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** A seed from a place (u), so a stone stays the same stone when the scene is rebuilt. */
export const seedAt = (x: number, y: number, k = 0) => (Math.round(x * 64) * 73856093) ^ (Math.round(y * 64) * 19349663) ^ (k * 83492791);

class Buf {
  pos: number[] = []; nrm: number[] = []; uv: number[] = []; col: number[] = [];
  /** a corner: place [x, height, z], normal, uv, colour */
  v(p: number[], n: number[], t: number[], c: number[]) { this.pos.push(p[0], p[1], p[2]); this.nrm.push(n[0], n[1], n[2]); this.uv.push(t[0], t[1]); this.col.push(c[0], c[1], c[2]); }
  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    return g;
  }
}

/** How a row's stones are made: sizes in u. */
type Lay = {
  mean: number; vary: number;     // a stone's length along the row, and how far each strays from it (a share)
  gap: number;                    // the joint between stones
  y0: number; y1: number; lift: number;   // from y0 up to y1, each stone up to `lift` higher
  bevel: number;                  // how far the top's edge is rounded over
  round: number;                  // how far corners are rounded: a share of the stone's shorter side
  wobble: number;                 // how far a long edge strays from straight
  tone: number;                   // how far a stone's tone strays from its picture
};
const norm = (x: number, y: number): P2 => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };

/**
 * One stone from its four-sided cut (u, any winding): the cut drawn in by half a joint, corners rounded, long edges a
 * little out of true, raised from y0 to y1 with a pillowed top. Its top wears one cell of the sheet, laid along `ax`;
 * its sides wear the same picture folded down over the edge.
 */
function stone(B: Buf, quad: P2[], ax: P2, L: Lay, sheet: StoneSheet, r: () => number) {
  let q = quad;
  const area = (p: P2[]) => p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a[0] * b[1] - b[0] * a[1]; }, 0) / 2;
  if (area(q) > 0) q = [...q].reverse();            // (negative: counter-clockwise seen from above in three's x, z)
  const out = (a: P2, b: P2): P2 => norm(-(b[1] - a[1]), b[0] - a[0]);   // an edge's outward side
  // draw each edge in by half a joint
  const moved = q.map((a, i) => { const b = q[(i + 1) % 4], n = out(a, b); return [[a[0] - n[0] * L.gap / 2, a[1] - n[1] * L.gap / 2], [b[0] - a[0], b[1] - a[1]]] as [P2, P2]; });
  const meet = ([p, d]: [P2, P2], [p2, d2]: [P2, P2]): P2 | null => {
    const den = d[0] * d2[1] - d[1] * d2[0]; if (Math.abs(den) < 1e-9) return null;
    const t = ((p2[0] - p[0]) * d2[1] - (p2[1] - p[1]) * d2[0]) / den; return [p[0] + d[0] * t, p[1] + d[1] * t];
  };
  const c: P2[] = [];
  for (let i = 0; i < 4; i++) { const m = meet(moved[(i + 3) % 4], moved[i]); if (!m) return; c.push(m); }
  if (area(c) > -0.004) return;                      // cut away to nothing (a tight inside bend)
  if (c.some((p, i) => Math.hypot(p[0] - q[i][0], p[1] - q[i][1]) > 0.2)) return;   // a sliver whose corners ran away when drawn in
  // the outline: each corner rounded by its own amount, each long edge with a point a little out of true
  const side = c.map((a, i) => Math.hypot(c[(i + 1) % 4][0] - a[0], c[(i + 1) % 4][1] - a[1])), short = Math.min(...side);
  const o: P2[] = [];
  for (let i = 0; i < 4; i++) {
    const p = c[(i + 3) % 4], a = c[i], n = c[(i + 1) % 4];
    const rad = Math.min(short * L.round * (0.5 + r()), short * 0.45);
    const dp = norm(p[0] - a[0], p[1] - a[1]), dn = norm(n[0] - a[0], n[1] - a[1]);
    const s: P2 = [a[0] + dp[0] * rad, a[1] + dp[1] * rad], e: P2 = [a[0] + dn[0] * rad, a[1] + dn[1] * rad];
    for (const t of [0, 0.3, 0.7, 1]) o.push([(1 - t) * (1 - t) * s[0] + 2 * t * (1 - t) * a[0] + t * t * e[0], (1 - t) * (1 - t) * s[1] + 2 * t * (1 - t) * a[1] + t * t * e[1]]);
    if (side[i] > 0.3) {
      const w = L.wobble * (r() * 1.6 - 0.6), en = out(a, n), k = 0.35 + r() * 0.3;
      o.push([a[0] + (n[0] - a[0]) * k + en[0] * w, a[1] + (n[1] - a[1]) * k + en[1] * w]);
    }
  }
  const N = o.length;
  const on = o.map((p, i) => { const a = out(o[(i + N - 1) % N], p), b = out(p, o[(i + 1) % N]); return norm(a[0] + b[0], a[1] + b[1]); });
  // its picture: one cell, laid along ax
  const cx = o.reduce((s, p) => s + p[0], 0) / N, cy = o.reduce((s, p) => s + p[1], 0) / N;
  const loc = (p: P2): P2 => [(p[0] - cx) * ax[0] + (p[1] - cy) * ax[1], -(p[0] - cx) * ax[1] + (p[1] - cy) * ax[0]];
  const ha = Math.max(...o.map((p) => Math.abs(loc(p)[0]))), hb = Math.max(...o.map((p) => Math.abs(loc(p)[1])));
  const cell = Math.floor(r() * sheet.n), flip = Math.floor(r() * 4), col = cell % sheet.cols, row = Math.floor(cell / sheet.cols), m = 0.05;
  let u0 = (col + m) / sheet.cols, u1 = (col + 1 - m) / sheet.cols, v0 = 1 - (row + 1 - m) / sheet.rows, v1 = 1 - (row + m) / sheet.rows;
  if (flip & 1) [u0, u1] = [u1, u0];
  if (flip & 2) [v0, v1] = [v1, v0];
  const cl = (x: number) => Math.max(-1, Math.min(1, x));
  const uvOf = (p: P2) => { const l = loc(p); return [u0 + (u1 - u0) * (cl(l[0] / ha) * 0.5 + 0.5), v0 + (v1 - v0) * (cl(l[1] / hb) * 0.5 + 0.5)]; };
  const l = 1 + (r() - 0.5) * 2 * L.tone, wm = (r() - 0.5) * L.tone, tint = [l * (1 + wm), l, l * (1 - wm)], dark = tint.map((x) => x * 0.72);
  const y1 = L.y1 + r() * L.lift, e = Math.min(L.bevel, short * 0.3), deep = y1 - e * 0.7 - L.y0;
  const inPt = (i: number, d: number): P2 => [o[i][0] - on[i][0] * d, o[i][1] - on[i][1] * d];
  // rings: the top's edge, the rim where the top turns over, the foot. Normals lean out over the rim, so the top reads pillowed.
  const top = o.map((_, i) => inPt(i, e)), up = [0, 1, 0];
  const P3 = (p: P2, y: number) => [p[0], y, p[1]];
  const nTop = on.map((n) => { const v = new THREE.Vector3(n[0] * 0.25, 1, n[1] * 0.25).normalize(); return [v.x, v.y, v.z]; });
  const nRim = on.map((n) => { const v = new THREE.Vector3(n[0], 0.9, n[1]).normalize(); return [v.x, v.y, v.z]; });
  const nSide = on.map((n) => [n[0], 0, n[1]]);
  const tTop = top.map(uvOf), tRim = o.map(uvOf), tFoot = o.map((_, i) => uvOf(inPt(i, Math.min(deep, hb * 1.2))));   // the foot: the picture folded in
  const cen = [cx, y1, cy], tCen = uvOf([cx, cy]);
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    B.v(cen, up, tCen, tint); B.v(P3(top[i], y1), nTop[i], tTop[i], tint); B.v(P3(top[j], y1), nTop[j], tTop[j], tint);
    const quadOf = (a: number[][][], b: number[][][]) => { for (const k of [0, 1, 2, 0, 2, 3]) { const s = k === 0 ? a[0] : k === 1 ? b[0] : k === 2 ? b[1] : a[1]; B.v(s[0], s[1], s[2], s[3]); } };
    const yr = y1 - e * 0.7;
    quadOf([[P3(top[i], y1), nTop[i], tTop[i], tint], [P3(top[j], y1), nTop[j], tTop[j], tint]], [[P3(o[i], yr), nRim[i], tRim[i], tint], [P3(o[j], yr), nRim[j], tRim[j], tint]]);
    quadOf([[P3(o[i], yr), nRim[i], tRim[i], tint], [P3(o[j], yr), nRim[j], tRim[j], tint]], [[P3(o[i], L.y0), nSide[i], tFoot[i], dark], [P3(o[j], L.y0), nSide[j], tFoot[j], dark]]);
  }
}

/**
 * A row of stones along a line (u; closed when its ends meet): each stone reaches from `o0` to `o1` across the line
 * (to the line's left, seen along it, is positive). Joints cross the line square to it; where the line turns by more
 * than a few degrees a joint lies on the corner's bisector, so stones are cut to the turn.
 */
function layRow(B: Buf, line: number[][], o0: number, o1: number, L: Lay, sheet: StoneSheet, seed: number) {
  let pts = line.map((p) => [p[0], p[1]] as P2).filter((p, i, a) => i === 0 || Math.hypot(p[0] - a[i - 1][0], p[1] - a[i - 1][1]) > 1e-4);
  const closed = pts.length > 3 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 1e-3;
  if (closed) pts = pts.slice(0, -1);
  const n = pts.length; if (n < 2) return;
  const r = rng(seed);
  const segs = closed ? n : n - 1;
  const dir = (i: number): P2 => norm(pts[(i + 1) % n][0] - pts[i][0], pts[(i + 1) % n][1] - pts[i][1]);   // segment i's direction
  const left = (d: P2): P2 => [d[1], -d[0]];        // (the line's left in the scene's x, y: y runs south)
  // every vertex: how sharply the line turns there, and its joint (the bisector, lengthened so the row keeps its width)
  const turn: number[] = [], jn: P2[] = [];
  for (let i = 0; i < n; i++) {
    const a = !closed && i === 0 ? dir(0) : dir((i + n - 1) % n), b = !closed && i === n - 1 ? dir(n - 2) : dir(i % segs);
    const cos = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1]));
    turn.push(Math.acos(cos));
    const bis = norm(left(a)[0] + left(b)[0], left(a)[1] + left(b)[1]), k = Math.min(1 / Math.max(Math.cos(turn[i] / 2), 0.1), 1.5);
    jn.push([bis[0] * k, bis[1] * k]);
  }
  const must = (i: number) => (!closed && (i === 0 || i === n - 1)) || turn[i] > 0.12;
  let first = 0;
  if (closed) { first = turn.findIndex((_, i) => must(i)); if (first < 0) first = 0; }
  // walk from joint to joint that must be; between two, cut the stretch into stones
  const total = closed ? n : n - 1;
  let i = first, done = 0;
  while (done < total) {
    let j = i, len = 0; const acc = [0];
    do { len += Math.hypot(pts[(j + 1) % n][0] - pts[j][0], pts[(j + 1) % n][1] - pts[j][1]); acc.push(len); j = (j + 1) % n; done++; } while (done < total && !must(j));
    const span = acc.length - 1;                   // segments in this stretch, from vertex i
    const at = (s: number): [P2, P2] => {          // the joint s along the stretch: its place and its direction across
      if (s <= 1e-4) return [pts[i], jn[i]];
      if (s >= len - 1e-4) return [pts[j], jn[j]];
      let k = 1; while (k < span && acc[k] < s) k++;
      const a = (i + k - 1) % n, b = (i + k) % n, t = (s - acc[k - 1]) / (acc[k] - acc[k - 1]);
      // within a stretch the line only bends gently: lean the joint between the two vertices' own
      const na: P2 = k === 1 ? left(dir(a)) : jn[a], nb: P2 = k === span ? left(dir(a)) : jn[b];
      const nn = norm(na[0] + (nb[0] - na[0]) * t, na[1] + (nb[1] - na[1]) * t);
      return [[pts[a][0] + (pts[b][0] - pts[a][0]) * t, pts[a][1] + (pts[b][1] - pts[a][1]) * t], nn];
    };
    const count = Math.max(1, Math.round(len / L.mean)), cut = [0];
    for (let k = 1; k < count; k++) cut.push((k + (r() - 0.5) * 2 * L.vary) * (len / count));
    cut.push(len);
    for (let k = 0; k + 1 < cut.length; k++) {
      const [pa, na] = at(cut[k]), [pb, nb] = at(cut[k + 1]);
      const quad: P2[] = [[pa[0] + na[0] * o0, pa[1] + na[1] * o0], [pb[0] + nb[0] * o0, pb[1] + nb[1] * o0], [pb[0] + nb[0] * o1, pb[1] + nb[1] * o1], [pa[0] + na[0] * o1, pa[1] + na[1] * o1]];
      // a stone pinched to a point by a sharp inside turn is left out: the ground under the row shows there
      const lenOf = (a: P2, b: P2) => Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (Math.min(lenOf(quad[0], quad[1]), lenOf(quad[3], quad[2])) < 0.3 * Math.max(lenOf(quad[0], quad[1]), lenOf(quad[3], quad[2]))) continue;
      stone(B, quad, norm(pb[0] - pa[0], pb[1] - pa[1]), L, sheet, r);
    }
    i = j;
  }
}

/** The material laid stones wear: the sheet's atlas, each stone's tone in its vertices. */
export function stoneMaterial(atlas: THREE.Texture): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ map: atlas, vertexColors: true, roughness: 0.9 });
}

const KERB_OUT = 0.05;         // u: how far a kerb block stands out past the edge, over the road
export const KERB_W = 0.32;   // u: a kerb's width, back from the edge onto the upper floor
/** A kerb piece as the renderer needs it: its edge from (x, y) to (x2, y2) (u), the upper floor (h, m) on its left. */
export type KerbSeg = { x: number; y: number; x2: number; y2: number; h: number; low: number };
/**
 * A scene's kerbs as stones: the pieces are joined end to end into their lines (same heights), and each line is laid as
 * one row of blocks about a u long, from the lower floor up to the upper and a hair proud of it, so the blocks run on
 * across pieces and are mitred where the kerb turns.
 */
export function kerbRows(segs: KerbSeg[], yOf: (m: number) => number, width = KERB_W, round = 0.24): THREE.BufferGeometry {
  const sheet: StoneSheet = { cols: 1, rows: 1, n: 1 };   // (kerb blocks wear a world-mapped stone, not a sheet: their uvs go unused)
  const B = new Buf(), key = (x: number, y: number, s: KerbSeg) => `${Math.round(x * 100)},${Math.round(y * 100)},${s.h},${s.low}`;
  const from = new Map<string, KerbSeg>(), ends = new Set<string>();
  for (const s of segs) { from.set(key(s.x, s.y, s), s); ends.add(key(s.x2, s.y2, s)); }
  const used = new Set<KerbSeg>();
  const chain = (s0: KerbSeg) => {
    const line = [[s0.x, s0.y]]; let s: KerbSeg | undefined = s0;
    while (s && !used.has(s)) { used.add(s); line.push([s.x2, s.y2]); s = from.get(key(s.x2, s.y2, s)); }
    const y = yOf(s0.h);
    // regular blocks, as a kerb is cut: equal lengths along each straight run, straight sides, corners rounded a little
    // (they stand a little out over the road, in front of the floor's own side, which would otherwise hide their faces)
    layRow(B, line, -KERB_OUT, width, { mean: 0.95, vary: 0.04, gap: 0.04, y0: yOf(s0.low) - 0.1, y1: y + 0.025, lift: 0.008, bevel: 0.06, round, wobble: 0, tone: 0.06 }, sheet, seedAt(s0.x, s0.y));
  };
  for (const s of segs) if (!ends.has(key(s.x, s.y, s))) chain(s);     // open lines, from their starts
  for (const s of segs) if (!used.has(s)) chain(s);                    // then the rings
  return B.geometry();
}

/**
 * A road's courses as stones: along each line a row of setts `w` wide, about 1.4 w long, a hair above the road.
 */
export function courseStones(courses: Course[], yOf: (m: number) => number, sheet: StoneSheet): THREE.BufferGeometry {
  const B = new Buf();
  for (const c of courses) {
    const y = yOf(c.h);
    for (const line of c.lines) layRow(B, line, -c.w / 2, c.w / 2, { mean: c.w * 1.4, vary: 0.25, gap: 0.035, y0: y - 0.05, y1: y + 0.03, lift: 0.012, bevel: 0.04, round: 0.3, wobble: 0.012, tone: 0.08 }, sheet, seedAt(line[0][0], line[0][1], c.row + 1));
  }
  return B.geometry();
}
