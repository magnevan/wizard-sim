/**
 * Kerbs as blocks (2026-11-24, docs/explorations/2026-11-24-road-stones.md): a scene's kerb pieces are joined into
 * lines and each line is laid as one row of near-equal blocks, so the blocks run on across pieces.
 *
 * Joints cross the line square to it, and on the bisector where it turns, so a block on a bend is a wedge and the two
 * blocks at a corner are mitred to each other. Each block is that four-sided cut drawn in by half a joint, its corners
 * rounded, with a bevelled top. The blocks wear a world-mapped stone (kit-render.ts kerbMat), so their shape here only
 * carries each block's tone in its vertex colours.
 */
import * as THREE from 'three';

type P2 = [number, number];

function rng(seed: number): () => number {
  let a = (seed | 0) || 1;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** A seed from a place (u), so a block stays the same block when the scene is rebuilt. */
const seedAt = (x: number, y: number) => (Math.round(x * 64) * 73856093) ^ (Math.round(y * 64) * 19349663);

class Buf {
  pos: number[] = []; nrm: number[] = []; col: number[] = [];
  /** a corner: place [x, height, z], normal, colour */
  v(p: number[], n: number[], c: number[]) { this.pos.push(p[0], p[1], p[2]); this.nrm.push(n[0], n[1], n[2]); this.col.push(c[0], c[1], c[2]); }
  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    return g;
  }
}

/** How a row's blocks are made: sizes in u. */
type Lay = {
  mean: number; vary: number;     // a block's length along the row, and how far each strays from it (a share)
  gap: number;                    // the joint between blocks
  y0: number; y1: number; lift: number;   // from y0 up to y1, each block up to `lift` higher
  bevel: number;                  // the radius the top's edge is rounded over with
  round: number;                  // how far corners are rounded: a share of the block's shorter side
  mitre: number;                  // the share of that the two corners on a mitred joint get (rounder leaves a notch)
  bed: number; mortar: number[];  // the mortar bed's top, and its colour (a tint on the stone)
  tone: number;                   // how far a block's tone strays
};
const norm = (x: number, y: number): P2 => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };
const ARC = 8;                    // points on each rounded corner (seen from above)
const EDGE = 5;                   // steps in the rounded edge where the top turns down into the sides

const area = (p: P2[]) => p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a[0] * b[1] - b[0] * a[1]; }, 0) / 2;

/** A plain prism on a four-sided outline (u, any winding) from y0 up to y1, all one colour: the mortar bed under a block. */
function prism(B: Buf, quad: P2[], y0: number, y1: number, c: number[]) {
  const q = area(quad) > 0 ? [...quad].reverse() : quad;
  const up = [0, 1, 0];
  B.v([q[0][0], y1, q[0][1]], up, c); B.v([q[1][0], y1, q[1][1]], up, c); B.v([q[2][0], y1, q[2][1]], up, c);
  B.v([q[0][0], y1, q[0][1]], up, c); B.v([q[2][0], y1, q[2][1]], up, c); B.v([q[3][0], y1, q[3][1]], up, c);
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4], n = norm(-(b[1] - a[1]), b[0] - a[0]), nn = [n[0], 0, n[1]];
    const A = [a[0], y1, a[1]], Bt = [b[0], y1, b[1]], a0 = [a[0], y0, a[1]], b0 = [b[0], y0, b[1]];
    B.v(A, nn, c); B.v(a0, nn, c); B.v(b0, nn, c); B.v(A, nn, c); B.v(b0, nn, c); B.v(Bt, nn, c);
  }
}

/**
 * One block from its four-sided cut (u, any winding): drawn in by half a joint, corners rounded (each corner's share of
 * L.round scaled by roundAt, matching the cut's order), raised from y0 to y1 with a bevelled top.
 */
function block(B: Buf, quad: P2[], roundAt: number[], L: Lay, r: () => number) {
  let q = quad, ra = roundAt;
  if (area(q) > 0) { q = [...q].reverse(); ra = [...ra].reverse(); }   // (negative: counter-clockwise seen from above in three's x, z)
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
  // the outline: each corner a circular arc tangent to both its edges, nearly the same radius on every corner
  const side = c.map((a, i) => Math.hypot(c[(i + 1) % 4][0] - a[0], c[(i + 1) % 4][1] - a[1])), short = Math.min(...side);
  const o: P2[] = [];
  for (let i = 0; i < 4; i++) {
    const p = c[(i + 3) % 4], a = c[i], n = c[(i + 1) % 4];
    const dp = norm(p[0] - a[0], p[1] - a[1]), dn = norm(n[0] - a[0], n[1] - a[1]);
    const half = Math.acos(Math.max(-1, Math.min(1, dp[0] * dn[0] + dp[1] * dn[1]))) / 2;   // half the corner's angle
    const rad = short * L.round * ra[i] * (0.85 + 0.3 * r());
    // how far back along each edge the arc starts: capped so two arcs on one edge never cross
    const back = Math.max(Math.min(rad / Math.tan(half), Math.min(side[i], side[(i + 3) % 4]) * 0.45), 1e-4);
    const R = back * Math.tan(half);
    const s: P2 = [a[0] + dp[0] * back, a[1] + dp[1] * back];
    const bis = norm(dp[0] + dn[0], dp[1] + dn[1]), dc = R / Math.sin(half);
    const ctr: P2 = [a[0] + bis[0] * dc, a[1] + bis[1] * dc];
    const a0 = Math.atan2(s[1] - ctr[1], s[0] - ctr[0]);
    const e: P2 = [a[0] + dn[0] * back, a[1] + dn[1] * back];
    let sweep = Math.atan2(e[1] - ctr[1], e[0] - ctr[0]) - a0;
    while (sweep > Math.PI) sweep -= 2 * Math.PI;
    while (sweep < -Math.PI) sweep += 2 * Math.PI;
    for (let k = 0; k <= ARC; k++) { const t = a0 + sweep * (k / ARC); o.push([ctr[0] + Math.cos(t) * R, ctr[1] + Math.sin(t) * R]); }
  }
  const N = o.length;
  const on = o.map((p, i) => { const a = out(o[(i + N - 1) % N], p), b = out(p, o[(i + 1) % N]); return norm(a[0] + b[0], a[1] + b[1]); });
  const cx = o.reduce((s, p) => s + p[0], 0) / N, cy = o.reduce((s, p) => s + p[1], 0) / N;
  const l = 1 + (r() - 0.5) * 2 * L.tone, wm = (r() - 0.5) * L.tone, tint = [l * (1 + wm), l, l * (1 - wm)], dark = tint.map((x) => x * 0.85);
  const y1 = L.y1 + r() * L.lift, e = Math.min(L.bevel, short * 0.35, (y1 - L.y0) * 0.5);
  // the edge is rounded over all round: a quarter circle of radius e from the top (inset e) down to the side (inset 0,
  // e below the top), in EDGE steps with smooth normals. The inset is measured square to the edges, so it stays even at corners.
  const reach = o.map((p, i) => 1 / Math.max(on[i][0] * out(o[(i + N - 1) % N], p)[0] + on[i][1] * out(o[(i + N - 1) % N], p)[1], 0.5));
  const P3 = (p: P2, y: number) => [p[0], y, p[1]];
  const ring = (th: number, c: number[]): V[] => o.map((p, i) => {
    const d = e * (1 - Math.sin(th)) * reach[i];
    return [P3([p[0] - on[i][0] * d, p[1] - on[i][1] * d], y1 - e + e * Math.cos(th)), [on[i][0] * Math.sin(th), Math.cos(th), on[i][1] * Math.sin(th)], c];
  });
  type V = [number[], number[], number[]];
  const rings: V[][] = [];
  for (let k = 0; k <= EDGE; k++) rings.push(ring((k / EDGE) * Math.PI / 2, tint));
  rings.push(o.map((p, i) => [P3(p, L.y0), [on[i][0], 0, on[i][1]], dark]));   // the foot
  const cen: V = [[cx, y1, cy], [0, 1, 0], tint];
  const quadOf = (a: V[], b: V[]) => { for (const k of [0, 1, 2, 0, 2, 3]) B.v(...(k === 0 ? a[0] : k === 1 ? b[0] : k === 2 ? b[1] : a[1])); };
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    B.v(...cen); B.v(...rings[0][i]); B.v(...rings[0][j]);
    for (let k = 0; k + 1 < rings.length; k++) quadOf([rings[k][i], rings[k][j]], [rings[k + 1][i], rings[k + 1][j]]);
  }
}

/**
 * A row of blocks along a line (u; closed when its ends meet): each block reaches from `o0` to `o1` across the line
 * (to the line's left, seen along it, is positive). Joints cross the line square to it; where the line turns by more
 * than a few degrees a joint lies on the corner's bisector, so blocks are cut to the turn.
 */
function layRow(B: Buf, line: number[][], o0: number, o1: number, L: Lay, seed: number) {
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
  // walk from joint to joint that must be; between two, cut the stretch into blocks
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
      // a block pinched to a point by a sharp inside turn is left out: the ground under the row shows there
      // under it, the bed of mortar: the whole cut, just behind the block's faces, running on through joints and mitres
      const ib = L.gap / 2 + 0.012;
      prism(B, [[pa[0] + na[0] * (o0 + ib), pa[1] + na[1] * (o0 + ib)], [pb[0] + nb[0] * (o0 + ib), pb[1] + nb[1] * (o0 + ib)], [pb[0] + nb[0] * (o1 - ib), pb[1] + nb[1] * (o1 - ib)], [pa[0] + na[0] * (o1 - ib), pa[1] + na[1] * (o1 - ib)]], L.y0, L.bed, L.mortar);
      const lenOf = (a: P2, b: P2) => Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (Math.min(lenOf(quad[0], quad[1]), lenOf(quad[3], quad[2])) < 0.3 * Math.max(lenOf(quad[0], quad[1]), lenOf(quad[3], quad[2]))) continue;
      // the corners on a turn's mitre are barely rounded, so the two blocks there close up
      const ma = k === 0 && turn[i] > 0.12 ? L.mitre : 1, mb = k + 2 === cut.length && turn[j] > 0.12 ? L.mitre : 1;
      block(B, quad, [ma, mb, mb, ma], L, r);
    }
    i = j;
  }
}

const KERB_OUT = 0.05;         // u: how far a kerb block stands out past the edge, over the road
export const KERB_W = 0.32;   // u: a kerb's width, back from the edge onto the upper floor
export const KERB_EDGE = 0.09; // u: the radius a block's top edges are rounded over with
export const KERB_ROUND = 0.15; // how round a block's corners are seen from above: a share of its width
/** A kerb piece as the renderer needs it: its edge from (x, y) to (x2, y2) (u), the upper floor (h, m) on its left. */
export type KerbSeg = { x: number; y: number; x2: number; y2: number; h: number; low: number };
/**
 * A scene's kerbs as blocks: the pieces are joined end to end into their lines (same heights), and each line is laid as
 * one row of blocks about a u long, from the lower floor up to the upper and a hair proud of it, so the blocks run on
 * across pieces and are mitred where the kerb turns.
 */
export function kerbRows(segs: KerbSeg[], yOf: (m: number) => number, width = KERB_W, round = KERB_ROUND): THREE.BufferGeometry {
  const B = new Buf(), key = (x: number, y: number, s: KerbSeg) => `${Math.round(x * 100)},${Math.round(y * 100)},${s.h},${s.low}`;
  const from = new Map<string, KerbSeg>(), ends = new Set<string>();
  for (const s of segs) { from.set(key(s.x, s.y, s), s); ends.add(key(s.x2, s.y2, s)); }
  const used = new Set<KerbSeg>();
  const chain = (s0: KerbSeg) => {
    const line = [[s0.x, s0.y]]; let s: KerbSeg | undefined = s0;
    while (s && !used.has(s)) { used.add(s); line.push([s.x2, s.y2]); s = from.get(key(s.x2, s.y2, s)); }
    const y = yOf(s0.h);
    // regular blocks, as a kerb is cut: equal lengths along each straight run, straight sides, rounded corners
    // (they stand a little out over the road, in front of the floor's own side, which would otherwise hide their faces)
    layRow(B, line, -KERB_OUT, width, { mean: 0.95, vary: 0.04, gap: 0.04, y0: yOf(s0.low) - 0.1, y1: y + 0.025, lift: 0.008, bevel: KERB_EDGE, round, mitre: 0.25, tone: 0.06, bed: y + 0.008, mortar: [0.62, 0.56, 0.5] }, seedAt(s0.x, s0.y));
  };
  for (const s of segs) if (!ends.has(key(s.x, s.y, s))) chain(s);     // open lines, from their starts
  for (const s of segs) if (!used.has(s)) chain(s);                    // then the rings
  return B.geometry();
}
