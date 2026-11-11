/**
 * The Area casts of the single elements. Each one is a single connected surface travelling
 * outward: a wall of columns set close enough to touch, whose top edge comes from noise that
 * wraps around the ring. Nothing here is a row of separate objects, because a row of separate
 * objects is what the eye counts ("a bunch of candles"). Pure in (time, seed).
 *
 * A nova is drawn in two passes (the user, 2026-11-11: the back of a nova covered its caster in its first frames):
 * `far`, the arc behind the centre plus everything on the floor, and `near`, the arc in front plus the flash and the
 * light. The view draws the far pass behind the bodies standing in front of the centre (vfx.ts novaDepth).
 *
 * The travelling wave is drawn round (x, y), which the view drags along after a caster who moves; what it leaves on
 * the floor (scorch, frost, wet) stays where it was cast, (mx, my).
 */
import * as K from './kit';
import * as X from './px';
import type { Ctx, Pt } from './px';
import { FY, TAU, clamp, easeOut, rand, seg } from './util';

export type NovaLight = (x: number, y: number, r: number, col: string, a: number, soft?: boolean) => void;
export type NovaPart = 'far' | 'near';
type Noise = (th: number, t: number) => number;
/** From tallest to shortest: each band is a height fraction of its column and a colour. */
type Bands = readonly (readonly [number, string])[];
interface Layer { rr: number; step: number; lean: number; bands: Bands; height: (th: number) => number; calm?: (th: number) => number; stripes?: boolean }
/** half: 0 for a whole ring; otherwise a directed burst, only the cone `aim` ± `half` (radians, on the ground). */
interface Nova { o: Ctx; g: Ctx; x: number; y: number; mx: number; my: number; r: number; e: number; t: number; sd: number; light: NovaLight; part: NovaPart; aim: number; half: number }

const EL = X.EL;
const DARK_SCORCH = '#160e10';

/** The angle between two directions, 0..π. */
const angDist = (a: number, b: number): number => Math.abs((((a - b) % TAU) + TAU * 1.5) % TAU - Math.PI);
/** How far angle th is inside a burst's cone: 1 through its middle, tapering to 0 at its sides (always 1 for a ring). */
const inCone = (n: Nova, th: number): number => (n.half ? clamp((n.half - angDist(th, n.aim)) / (n.half * 0.4), 0, 1) : 1);
/** A random angle (u in 0..1): round the ring, or across a burst's cone. */
const pick = (n: Nova, u: number): number => (n.half ? n.aim + (u * 2 - 1) * n.half : u * TAU);
/** Where a nova's light sits: its centre, or for a burst partway out along the cone. */
const lightAt = (n: Nova): [number, number] => (n.half ? [n.x + Math.cos(n.aim) * n.r * 0.5, n.y + Math.sin(n.aim) * n.r * 0.5 * FY] : [n.x, n.y]);

/** Noise around the ring, 0..1. Whole-number wave counts, so it joins up with itself at the seam. */
function ringNoise(sd: number, waves: readonly number[], speed: number, pointed: boolean): Noise {
  const phase = waves.map((_, i) => rand(i, 91, sd) * TAU);
  return (th, t) => {
    let v = 0, sum = 0;
    for (let i = 0; i < waves.length; i++) {
      const amp = 1 / (1 + i * 0.55), s = Math.sin(waves[i] * th + phase[i] + t * speed * (i % 2 ? -1 : 1) * (1 + i * 0.4));
      v += amp * (pointed ? 1 - Math.abs(s) : 0.5 + 0.5 * s); sum += amp;
    }
    return v / sum;
  };
}

/** Is angle th (on the ground, round the centre) on this pass's side: behind the centre for `far`, in front for `near`? */
const mine = (part: NovaPart, th: number): boolean => (Math.sin(th) < 0) === (part === 'far');

/** Half the ring, sorted far to near: side -1 is the arc behind the centre, side 1 the arc in front. */
function around(rr: number, step: number, side: -1 | 1, fn: (th: number, i: number) => void): void {
  const n = Math.max(8, Math.ceil((1.24 * rr) / step)); // a quarter of the ellipse's perimeter is about 1.24 r at FY 0.5
  for (let j = 0; j <= n; j++) {
    const a = (Math.PI / 2) * (side < 0 ? j / n : 1 - j / n), mid = side * (Math.PI / 2);
    fn(mid - a, j); fn(mid + a, j);
  }
}

/** Draws the layers of a wall on this pass's side, far to near, so the arc in front of the caster covers the arc behind. */
function walls(c: Ctx, x: number, y: number, part: NovaPart, layers: readonly Layer[], cn?: Nova): void {
  const side = part === 'far' ? -1 : 1;
  for (let l = 0; l < layers.length; l++) {
    const L = layers[side < 0 ? l : layers.length - 1 - l];
    if (L.rr < 1) continue;
    const w = L.stripes ? 1 : L.step + 1;
    around(L.rr, L.step, side, (th, i) => {
      if (L.stripes && i % 2) return;
      // a burst's wall dies down toward the sides of its cone rather than stopping square
      const k0 = cn ? inCone(cn, th) : 1;
      if (k0 <= 0) return;
      const h = L.height(th) * k0;
      if (h < 1) return;
      const cos = Math.cos(th), sin = Math.sin(th), bx = x + cos * L.rr, by = y + sin * L.rr * FY;
      // each band fills only down to the next one, so the leaning stack never sticks out past its neighbour
      const topOf = (k: number): number => {
        const f = L.bands[k][0], body = f < 1 && L.calm ? h * 0.62 + L.calm(th) * k0 * 0.38 : h;
        return by - body * f + sin * L.lean * FY * f;
      };
      let top = topOf(0);
      for (let k = 0; k < L.bands.length; k++) {
        const [f, col] = L.bands[k], next = k + 1 < L.bands.length ? Math.max(top, topOf(k + 1)) : by + 1;
        X.rect(c, bx + cos * L.lean * f * 0.5 - w / 2, top, w, next - top + 1, col);
        top = next;
      }
    });
  }
}

/**
 * A ragged ring on the ground (r0 = 0 fills it); wobble is a fraction of the radius, by angle. For a burst (cn with a
 * cone) only the cone's arc, thinning to nothing at its sides.
 */
function band(c: Ctx, x: number, y: number, r0: number, r1: number, col: string, a: number, wobble: (th: number) => number, cn?: Nova): void {
  if (a <= 0.02 || r1 <= r0) return;
  const pts: Pt[] = [], n = 64, half = cn?.half ?? 0, th0 = half ? cn!.aim - half : 0, span = half ? 2 * half : TAU;
  const at = (i: number): number => th0 + (span * i) / n;
  for (let i = 0; i <= n; i++) { const th = at(i), q = r1 * (1 + wobble(th)); pts.push([x + Math.cos(th) * q, y + Math.sin(th) * q * FY]); }
  if (half) for (let i = n; i >= 0; i--) { const th = at(i), q = (r1 - (r1 - r0) * inCone(cn!, th)) * (1 + wobble(th)); pts.push([x + Math.cos(th) * q, y + Math.sin(th) * q * FY]); }
  else if (r0 > 0.5) for (let i = n; i >= 0; i--) { const th = at(i), q = r0 * (1 + wobble(th)); pts.push([x + Math.cos(th) * q, y + Math.sin(th) * q * FY]); }
  X.poly(c, pts, col, a);
}

/**
 * A mark left on the floor as loose pixels, not an even dither (the user: the fire's scorch and the frost read as a
 * uniform grid). Each pixel of the ring r0..r1 has its own threshold from a hash and from patchy noise, so the mark
 * comes in clumps, thins out unevenly as `a` falls, and its edge is ragged.
 */
function speckle(c: Ctx, x: number, y: number, r0: number, r1: number, col: string, a0: number, sd: number, clump = 0.6, cn?: Nova): void {
  if (a0 <= 0.02 || r1 < 1) return;
  const ry = r1 * FY;
  for (let py = Math.floor(-ry); py <= Math.ceil(ry); py++) {
    const dy = py / FY;
    for (let px = Math.floor(-r1); px <= Math.ceil(r1); px++) {
      const d = Math.hypot(px, dy);
      if (d > r1 || d < r0) continue;
      let a = a0;
      if (cn?.half) { const k = inCone(cn, Math.atan2(dy, px)); if (k <= 0) continue; a *= k; }
      const gx = Math.round(x + px), gy = Math.round(y + py);
      // big soft clumps (value noise on a coarse grid) plus a per-pixel hash
      const cx = Math.floor(gx / 6), cy = Math.floor(gy / 4), fx = gx / 6 - cx, fy = gy / 4 - cy;
      const n00 = rand(cx, cy, sd), n10 = rand(cx + 1, cy, sd), n01 = rand(cx, cy + 1, sd), n11 = rand(cx + 1, cy + 1, sd);
      const clumpV = (n00 * (1 - fx) + n10 * fx) * (1 - fy) + (n01 * (1 - fx) + n11 * fx) * fy;
      const edge = 1 - Math.max(0, (d - r1 * 0.75) / (r1 * 0.25)); // thinner toward the rim
      if (rand(gx, gy, sd + 7) * (1 - clump) + clumpV * clump < a * edge) X.px(c, gx, gy, col);
    }
  }
}

/** A sheet going out goes out in patches that shrink closed: 1 while whole, tapering to 0 where it has burned away. */
const holdUp = (noise: number, life: number): number => clamp((life * 1.35 - noise) * 4, 0, 1);

// ---- fire --------------------------------------------------------------------------------------------
function fire(n: Nova): void {
  const { o, g, x, y, r, e, t, sd, light, part } = n, R = EL.fire;
  const q = e / 0.55, rr = 6 + (r - 6) * easeOut(Math.min(1, q)), life = 1 - seg(q, 0.72, 1.35), burn = 1 - seg(e, 1, 1.8);
  const edge = ringNoise(sd + 1, [5, 9, 14], 0, false), tear = ringNoise(sd + 2, [3, 7, 12], 0, false);
  const wobble = (th: number) => (edge(th, 0) - 0.5) * 0.14;
  if (part === 'far') {
    // scorched ground left where it was cast, in clumps that fade unevenly (only a drawing: nothing burns on the floor)
    if (burn > 0) speckle(g, n.mx, n.my, Math.min(rr * 0.25, r * 0.2), Math.min(r, rr * 1.02), DARK_SCORCH, 0.62 * burn, sd + 5, 0.6, n);
    // and a few embers glowing in it, going out one by one
    for (let i = 0; i < 22 && burn > 0; i++) {
      const th = pick(n, rand(i, 17, sd)), d = Math.sqrt(0.15 + rand(i, 18, sd) * 0.85) * Math.min(r, rr), out = 0.6 + rand(i, 19, sd) * 1.1;
      if (e > out || d > rr) continue;
      X.px(g, n.mx + Math.cos(th) * d, n.my + Math.sin(th) * d * FY, (Math.floor(t * 9) + i) % 5 ? R[3] : R[2]);
    }
    // the burning floor under the wave travels with the wave
    if (life > 0) {
      band(g, x, y, rr * 0.5, rr + 1, R[4], 0.6 * life * life, wobble, n);
      band(g, x, y, rr * 0.78, rr + 1, R[3], 0.65 * life * life, wobble, n);
    }
  }
  if (part === 'near' && e < 0.12) { const f0 = 1 - e / 0.12; X.glow(o, x, y - 6, 18 + r * 0.25, EL.fire[1], 0.85 * f0); X.ellipse(o, x, y - 5, 4 + 10 * f0, 3 + 7 * f0, '#ffffff', f0); }
  const [lx, ly] = lightAt(n);
  if (life > 0) {
    const peak = 0.85 * (15 + r * 0.16) * Math.min(1, rr / 22) * Math.min(1, q * 5) * Math.pow(life, 0.6);
    const tips = ringNoise(sd, [6, 11, 19, 31], 11, true), roll = ringNoise(sd + 3, [2, 4], 4, false);
    const crest = (th: number) => peak * (0.34 + 0.56 * tips(th, t) + 0.32 * roll(th, t)) * holdUp(tear(th, 0), life);
    const body = (th: number) => peak * (0.2 + 0.34 * tips(th + 1.3, t * 1.15)) * holdUp(tear(th + 0.6, 0), life);
    const wake = (th: number) => peak * (0.08 + 0.2 * tips(th + 2.4, t * 1.3)) * holdUp(tear(th + 1.2, 0), life * 0.8);
    const flame: Bands = [[1, R[4]], [0.82, R[3]], [0.58, R[2]], [0.32, R[1]]], low: Bands = [[1, R[3]], [0.66, R[2]], [0.3, R[1]]];
    const calm = (th: number) => peak * (0.62 + 0.3 * roll(th, t)) * holdUp(tear(th, 0), life);
    walls(o, x, y, part, [
      { rr, step: 1.5, lean: 9, bands: flame, height: crest, calm },
      { rr: rr * 0.85, step: 2, lean: 5, bands: low, height: body },
      { rr: rr * 0.68, step: 2, lean: 2, bands: low, height: wake },
    ], n);
  }
  // embers thrown off the crest as it passes
  for (let i = 0; i < 34 && e < 1.2; i++) {
    const born = rand(i, 10, sd) * 0.42, age = (e - born) / (0.4 + rand(i, 11, sd) * 0.45), th = pick(n, rand(i, 12, sd));
    if (age < 0 || age >= 1 || !mine(part, th)) continue;
    const d = (6 + (r - 6) * easeOut(Math.min(1, born / 0.55))) + 8 + 18 * age, lift = 6 + rand(i, 13, sd) * 16 + 34 * age - 22 * age * age;
    X.px(o, x + Math.cos(th) * d, y + Math.sin(th) * d * FY - lift, K.fireCol(0.15 + age * 0.8));
  }
  // smoke lifting off the scorch, thin and scattered
  for (let i = 0; i < 18 && e > 0.28; i++) {
    const th = pick(n, rand(i, 14, sd)), d = r * Math.sqrt(0.25 + rand(i, 15, sd) * 0.75), u = seg(e, 0.28 + rand(i, 16, sd) * 0.3, 1.75);
    if (u > 0 && u < 1 && mine(part, th)) K.puff(o, n.mx + Math.cos(th) * d, n.my + Math.sin(th) * d * FY - 10 - u * 22, 2 + u * 4, i % 2 ? '#4a4048' : '#2e282e', 0.55 * (1 - u));
  }
  if (part === 'near') light(lx, ly, r + 40, '#ff7a2a', 0.95 * (1 - seg(e, 0, 0.8)));
}

// ---- water -------------------------------------------------------------------------------------------
function water(n: Nova): void {
  const { o, g, x, y, r, e, t, sd, light, part } = n, R = EL.water;
  const q = e / 0.45, rr = 6 + (r - 6) * easeOut(Math.min(1, q)), life = 1 - seg(q, 0.7, 1.2);
  const edge = ringNoise(sd + 1, [4, 7, 13], 0, false), wobble = (th: number) => (edge(th, 0) - 0.5) * 0.1;
  const wet = 1 - seg(e, 0.45, 1.1);
  if (part === 'far') {
    speckle(g, n.mx, n.my, rr * 0.45, rr, R[3], 0.4 * wet, sd + 3, 0.45, n);
    if (life > 0) band(g, x, y, rr * 0.62, rr * 0.67, R[1], 0.32 * life, wobble, n); // a line of foam riding behind the crest
  }
  if (part === 'near' && e < 0.07) X.ellipse(o, x, y - 4, 9, 6, R[0], 1 - e / 0.07);
  if (life > 0) {
    const peak = 0.72 * (9 + r * 0.07) * Math.min(1, rr / 16) * Math.min(1, q * 6) * Math.pow(life, 0.8);
    const swell = ringNoise(sd, [3, 5, 9, 14], 8, false);
    const crest = (th: number) => peak * (0.7 + 0.75 * swell(th, t));
    const behind = (th: number) => peak * (0.2 + 0.32 * swell(th + 1.9, t * 0.8));
    const wave: Bands = [[1, R[0]], [0.86, R[1]], [0.66, R[2]], [0.36, R[3]], [0.14, R[4]]], low: Bands = [[1, R[1]], [0.7, R[2]], [0.3, R[3]]];
    walls(o, x, y, part, [{ rr, step: 1.5, lean: 6, bands: wave, height: crest }, { rr: rr * 0.82, step: 2, lean: 2, bands: low, height: behind }], n);
  }
  // spray flung off the crest
  for (let i = 0; i < 32 && e < 0.9; i++) {
    const born = rand(i, 20, sd) * 0.38, age = (e - born) / (0.28 + rand(i, 21, sd) * 0.25), th = pick(n, rand(i, 22, sd));
    if (age < 0 || age >= 1 || !mine(part, th)) continue;
    const d = (6 + (r - 6) * easeOut(Math.min(1, born / 0.45))) + 3 + 16 * age, up = 8 + rand(i, 23, sd) * 8, lift = up + 26 * age - 34 * age * age;
    if (lift > 0) X.px(o, x + Math.cos(th) * d, y + Math.sin(th) * d * FY - lift, i % 3 ? R[1] : R[0]);
  }
  if (part === 'near') light(...lightAt(n), r + 26, R[2], 0.6 * (1 - seg(e, 0, 0.5)));
}

// ---- cold --------------------------------------------------------------------------------------------
function cold(n: Nova): void {
  const { o, g, x, y, r, e, t, sd, light, part } = n, R = X.FROST;
  const q = e / 0.38, rr = 6 + (r - 6) * easeOut(Math.min(1, q)), life = 1 - seg(q, 0.8, 1.2), frost = 1 - seg(e, 0.6, 1.5);
  const teeth = ringNoise(sd, [13, 23, 37], 0, true), edge = ringNoise(sd + 1, [17, 29, 41], 0, true), crack = ringNoise(sd + 2, [4, 9, 15], 0, false);
  const jag = (th: number) => (edge(th, 0) - 0.5) * 0.12;
  if (part === 'far') {
    // hoarfrost left where it was cast: clumps of frost that melt unevenly, sprigs of crystal, glints that come and go
    const reach = Math.min(r, rr);
    speckle(g, n.mx, n.my, 0, reach, R[4], 0.5 * frost, sd + 9, 0.7, n);
    speckle(g, n.mx, n.my, reach * 0.35, reach, R[3], 0.42 * frost, sd + 11, 0.75, n);
    for (let i = 0; i < 26; i++) {
      const th = pick(n, rand(i, 34, sd)), d = Math.sqrt(rand(i, 35, sd)) * reach, melt = 0.5 + rand(i, 36, sd) * 1.0;
      if (e > melt) continue;
      const bx = n.mx + Math.cos(th) * d, by = n.my + Math.sin(th) * d * FY, a = rand(i, 37, sd) * TAU, L = 2 + rand(i, 38, sd) * 3;
      const ex = bx + Math.cos(a) * L, ey = by + Math.sin(a) * L * FY;
      X.line(g, bx, by, ex, ey, R[2]);
      X.px(g, (bx + ex) / 2 + Math.cos(a + 1.2) * 1.5, (by + ey) / 2 + Math.sin(a + 1.2), R[2]);
      if ((Math.floor(t * 7) + i) % 6 === 0) X.px(g, ex, ey, '#ffffff');
    }
    if (life > 0) band(g, x, y, rr - 3, rr + 1, R[0], 0.7 * life, jag, n);
  }
  if (part === 'near' && e < 0.07) X.ellipse(o, x, y - 4, 9, 6, R[0], 1 - e / 0.07);
  if (life > 0) {
    const peak = 0.75 * (12 + r * 0.14) * Math.min(1, rr / 18) * Math.min(1, q * 6);
    const crest = (th: number) => peak * (0.28 + 0.92 * teeth(th, 0) * teeth(th, 0)) * holdUp(crack(th, 0), life);
    const ice: Bands = [[1, R[0]], [0.76, R[1]], [0.5, R[2]], [0.22, R[3]]];
    walls(o, x, y, part, [{ rr, step: 1, lean: 4, bands: ice, height: crest }], n);
    if (part === 'near') band(o, x, y - 2, rr * 0.8, rr + 5, '#c4eefa', 0.22 * life, jag, n); // the cold air it pushes along the floor
  }
  // the wall shatters where it stops
  const shards = seg(q, 0.8, 1) * (1 - seg(e, 0.6, 1.0));
  for (let i = 0; i < 40 && shards > 0; i++) {
    const th = pick(n, rand(i, 31, sd));
    if (!mine(part, th)) continue;
    const age = seg(e, 0.3 + rand(i, 30, sd) * 0.1, 0.95), d = r + (rand(i, 32, sd) - 0.5) * 8 + 12 * age, lift = 3 + rand(i, 33, sd) * 16 + 12 * age - 26 * age * age;
    if (age > 0 && lift > 0) K.sq(o, x + Math.cos(th) * d, y + Math.sin(th) * d * FY - lift, i % 4 ? 1 : 2, i % 3 ? R[1] : R[0]);
  }
  if (part === 'near') light(...lightAt(n), r + 26, R[3], 0.6 * (1 - seg(e, 0, 0.5)));
}

// ---- life (the user: good as it is; only split into passes) ------------------------------------------
function life(n: Nova): void {
  const { o, g, x, y, r, e, t, sd, light, part } = n, R = X.LIFE;
  const q = e / 0.75, rr = 6 + (r - 6) * easeOut(Math.min(1, q)), fade = 1 - seg(q, 0.6, 1.25);
  const edge = ringNoise(sd + 1, [3, 5, 8], 0, false), wobble = (th: number) => (edge(th, 0) - 0.5) * 0.12;
  if (part === 'far') {
    band(g, x, y, rr * 0.3, rr, R[4], 0.42 * fade, wobble);
    band(g, x, y, rr * 0.72, rr + 1, R[3], 0.55 * fade, wobble);
  }
  if (part === 'near' && e < 0.1) X.glow(o, x, y - 6, 18, R[1], 0.8 * (1 - e / 0.1));
  if (fade > 0) {
    const peak = (24 + r * 0.12) * Math.min(1, rr / 20) * Math.min(1, q * 4) * fade;
    const veil = ringNoise(sd, [2, 3, 5, 8], 2.4, false);
    const height = (th: number) => peak * (0.35 + 0.8 * veil(th, t));
    // thin upright threads of light, brightest at the floor: a veil you can see through
    const threads: Bands = [[1, R[4]], [0.78, R[3]], [0.48, R[2]], [0.2, R[1]]];
    walls(o, x, y, part, [{ rr, step: 1, lean: 0, bands: threads, height, stripes: true }]);
  }
  // motes rise along the whole ring as it opens
  for (let i = 0; i < 46 && e < 1.25; i++) {
    const born = rand(i, 40, sd) * 0.6, age = (e - born) / (0.45 + rand(i, 41, sd) * 0.3), th = rand(i, 42, sd) * TAU;
    if (age < 0 || age >= 1 || !mine(part, th)) continue;
    const d = (6 + (r - 6) * easeOut(Math.min(1, born / 0.75))) * (0.75 + rand(i, 43, sd) * 0.3), s = Math.sin(t * 5 + i) * 1.5;
    X.px(o, x + Math.cos(th) * d + s, y + Math.sin(th) * d * FY - 4 - age * 30, age < 0.5 ? R[1] : R[3]);
  }
  if (part === 'near') light(x, y, r + 30, EL.life[2], 0.8 * (1 - seg(e, 0, 0.8)));
}

// ---- arcane: a pressure wave blown out from the caster -----------------------------------------------
/**
 * The user: more a blast outward from you, like a pressure wave, than something coming up from the ground. A ring of
 * compressed air at chest height races out, its leading edge white-hot and a darker band of rarefied air behind it;
 * speed lines streak outward; the floor only takes a faint ring as it passes over.
 */
function arcane(n: Nova): void {
  const { o, g, x, y, r, e, sd, light, part } = n, R = EL.arcane;
  const q = e / 0.3, rr = 4 + (r - 4) * (1 - Math.pow(1 - Math.min(1, q), 3)), fade = 1 - seg(q, 0.75, 1.25);
  const H = 7 + r * 0.04; // the wave's height over the floor, px
  const from = part === 'far' ? Math.PI : 0, to = part === 'far' ? TAU : Math.PI; // ring arcs: far is the top half on screen
  if (part === 'far' && fade > 0) {
    K.gring(g, x, y, rr, R[3], 0.55 * fade, 1);
    X.ring(g, x, y, rr * 0.92, rr * 0.92 * FY, R[4], 0.4 * fade);
  }
  if (part === 'near' && e < 0.06) { X.ellipse(o, x, y - H, 12, 9, '#ffffff', 1 - e / 0.06); X.glow(o, x, y - H, 20, R[1], 0.8); }
  if (fade > 0) {
    // the compressed air just behind the front: a hazy band, this pass's half of it
    const band0 = Math.max(0, rr - 9), pts: Pt[] = [];
    for (let i = 0; i <= 24; i++) { const th = from + ((to - from) * i) / 24; pts.push([x + Math.cos(th) * rr, y - H + Math.sin(th) * rr * FY * 1.1]); }
    for (let i = 24; i >= 0; i--) { const th = from + ((to - from) * i) / 24; pts.push([x + Math.cos(th) * band0, y - H + Math.sin(th) * band0 * FY * 1.1]); }
    X.poly(o, pts, R[2], 0.42 * fade);
    // the front: a squashed ring at chest height, thick and bright at its leading edge, thinning as it spreads
    const thick = Math.max(2, Math.round(5 * (1 - q * 0.5)));
    for (let k = 0; k < thick; k++) {
      const rk = rr - k, col = k === 0 ? '#ffffff' : k === 1 ? R[1] : R[2];
      X.ring(o, x, y - H, rk, rk * FY * 1.1, col, fade * (1 - k * 0.12), from, to);
    }
    // the trough behind it: a dim band, the air pulled thin
    const tr = rr - thick - 3;
    if (tr > 3) X.ring(o, x, y - H, tr, tr * FY * 1.1, R[4], 0.55 * fade, from, to);
    // a faint second ring, the echo of the blast, a little behind
    const r2 = rr * 0.7;
    if (r2 > 4) X.ring(o, x, y - H + 1, r2, r2 * FY * 1.1, R[2], 0.45 * fade, from, to);
  }
  // speed lines: short streaks thrown outward along the ring, longest at the start
  for (let i = 0; i < 40 && e < 0.5; i++) {
    const th = rand(i, 55, sd) * TAU;
    if (!mine(part, th)) continue;
    const born = rand(i, 56, sd) * 0.1, age = (e - born) / (0.2 + rand(i, 57, sd) * 0.15);
    if (age < 0 || age >= 1) continue;
    const d = rr * (0.7 + 0.35 * rand(i, 58, sd)), L = 3 + (1 - age) * 7, c = Math.cos(th), s = Math.sin(th) * FY;
    const hh = H * (0.5 + rand(i, 59, sd));
    X.line(o, x + c * (d - L), y + s * (d - L) - hh, x + c * d, y + s * d - hh, age < 0.5 ? R[1] : R[2]);
  }
  if (part === 'near') light(x, y, r + 30, R[2], 0.85 * (1 - seg(e, 0, 0.35)));
}

// ---- the directed bursts that aren't a nova cut to a cone ------------------------------------------------

/** An arc of radius rr round (x, y) across the cone (half-width hk), on this pass's side only, dimming toward its ends. */
function coneArc(c: Ctx, n: Nova, x: number, y: number, rr: number, fy: number, col: string, a: number, hk: number): void {
  if (a <= 0.02 || rr < 1) return;
  const steps = Math.max(6, Math.ceil(rr * hk * 0.5)), d = (2 * hk) / steps;
  for (let i = 0; i < steps; i++) {
    const th = n.aim - hk + d * i, mid = th + d / 2;
    if (!mine(n.part, mid)) continue;
    // solid through the middle of the cone; only its ends thin out
    const w = clamp((hk - angDist(mid, n.aim)) / (hk * 0.4), 0, 1), aa = a * (w > 0.8 ? 1 : w);
    if (aa > 0) X.ring(c, x, y, rr, rr * fy, col, aa >= 0.5 ? 1 : aa * 2, th, th + d);
  }
}

/**
 * Arcane burst (the user, 2026-11-11: like the nova but directed, more a burst than a wave: "forward ripples of
 * arcane"). Ripples of pressure leave the staff one after another, each an arc of the cone at chest height racing out
 * and thinning, a haze behind its white edge and a faint arc on the floor under it; speed lines streak along the cone.
 */
function arcaneBurst(n: Nova): void {
  const { o, g, x, y, r, e, sd, light, part, aim, half } = n, R = EL.arcane, H = 8, ax = Math.cos(aim), ay = Math.sin(aim) * FY;
  if (part === 'near' && e < 0.08) {
    const f0 = 1 - e / 0.08, hx = x + ax * 6, hy = y - H + ay * 6;
    X.glow(o, hx, hy, 18, R[1], 0.85 * f0); X.ellipse(o, hx, hy, 3 + 6 * f0, 2 + 4 * f0, '#ffffff', f0);
  }
  let lead = 0;
  for (let k = 0; k < 4; k++) {
    const q = (e - k * 0.075) / 0.34;
    if (q <= 0 || q >= 1) continue;
    const rr = 5 + (r + 2) * (1 - Math.pow(1 - q, 2.2)), fade = Math.pow(1 - q, 0.7) * (1 - k * 0.14), hk = half * (0.7 + 0.3 * q);
    lead = Math.max(lead, rr);
    if (part === 'far') { coneArc(g, n, x, y, rr, FY, R[3], 0.8 * fade, hk); coneArc(g, n, x, y, rr - 1, FY, R[4], 0.6 * fade, hk); }
    // the body of squeezed air behind the edge, drawn with whichever half the cone points into
    if (mine(part, aim)) {
      band(o, x, y - H, Math.max(0, rr - 10), rr, R[3], 0.45 * fade, () => 0, { ...n, half: hk });
      band(o, x, y - H, Math.max(0, rr - 5), rr, R[2], 0.6 * fade, () => 0, { ...n, half: hk });
    }
    // its edge: white, then pink, then magenta, thinning as it spreads
    const thick = Math.max(2, Math.round(4.5 * (1 - q)));
    for (let j = 0; j <= thick; j++) coneArc(o, n, x, y - H, rr - j, FY * 1.1, j === 0 ? '#ffffff' : j <= 1 ? R[1] : R[2], fade * (1 - j * 0.1), hk);
  }
  // speed lines streaking out along the cone
  for (let i = 0; i < 26 && e < 0.55; i++) {
    const th = pick(n, rand(i, 55, sd)), born = rand(i, 56, sd) * 0.25, age = (e - born) / (0.16 + rand(i, 57, sd) * 0.14);
    if (age < 0 || age >= 1 || !mine(part, th) || inCone(n, th) < 0.3) continue;
    const d = 6 + (r - 2) * (0.15 + 0.85 * age), L = 3 + (1 - age) * 7, c = Math.cos(th), s = Math.sin(th) * FY, hh = H * (0.4 + rand(i, 59, sd) * 1.1);
    X.line(o, x + c * (d - L), y + s * (d - L) - hh, x + c * d, y + s * d - hh, age < 0.5 ? R[1] : R[2]);
  }
  if (part === 'near') light(x + ax * lead * 0.8, y + ay * lead * 0.8, 46, R[2], 0.85 * (1 - seg(e, 0, 0.45)));
}

/** A crack torn through the floor along direction a, from d0 to d1 out from the centre: a dark zigzag, a lit lip. */
function fissure(c: Ctx, x: number, y: number, a: number, d0: number, d1: number, sd: number, alpha: number): void {
  if (alpha <= 0.05 || d1 <= d0 + 1) return;
  const ca = Math.cos(a), sa = Math.sin(a), at = (d: number, off: number): Pt => [x + ca * d - sa * off, y + (sa * d + ca * off) * FY];
  let prev = at(d0, 0);
  for (let d = d0 + 3, i = 0; d <= d1; d += 3, i++) {
    const off = (rand(i, 5, sd) - 0.5) * 3.2, cur = at(d, off);
    if (rand(i, 6, sd) < alpha) {
      const wide = d < d0 + (d1 - d0) * 0.6 ? 3 : 2;
      X.line(c, prev[0], prev[1] - 1, cur[0], cur[1] - 1, X.EARTH[0], 1); // the lit lip on the far side
      X.line(c, prev[0], prev[1], cur[0], cur[1], '#120c08', wide);
    }
    prev = cur;
  }
}

/**
 * Earth burst (the user, 2026-11-11: "a small directed earthquake propagating through the ground"). A front of heaving
 * floor rolls out across the cone at an even pace; slabs of floor punch up as it reaches them and drop back; a fissure
 * tears open behind it along the aim, with branches; dust and grit are thrown up along the front.
 */
function earthBurst(n: Nova): void {
  const { o, g, x, y, r, e, sd, part, aim, half } = n, R = X.EARTH, T = 0.45;
  const reachAt = (s: number) => 4 + (r - 4) * clamp(s / T, 0, 1), front = reachAt(e), live = 1 - seg(e, T, T + 0.25), stay = 1 - seg(e, 0.9, 1.4);
  const flat = () => 0;
  if (part === 'far') {
    // the bulge under the front: a shadowed trough behind a lit crest (under the cracks)
    if (live > 0) { band(g, x, y, Math.max(0, front - 8), front - 2, R[5], 0.45 * live, flat, n); band(g, x, y, front - 2, front + 1, R[2], 0.6 * live, flat, n); }
    fissure(g, x, y, aim, 4, front, sd, stay);
    for (let b = 0; b < 3; b++) {
      const from = r * (0.25 + 0.22 * b), side = b % 2 ? 1 : -1, a = aim + side * half * (0.35 + 0.25 * rand(b, 7, sd));
      if (front > from) fissure(g, x + Math.cos(aim) * from, y + Math.sin(aim) * from * FY, a, 0, Math.min(front - from, r * 0.45), sd + 11 * (b + 1), stay);
    }
  }
  // slabs of floor across the cone, each punched up as the front reaches it, then dropping back
  for (let i = 0; i < 24; i++) {
    const th = pick(n, rand(i, 61, sd)), d = (0.18 + 0.82 * Math.sqrt(rand(i, 62, sd))) * r;
    if (!mine(part, th) || inCone(n, th) < 0.3) continue;
    const hit = (T * (d - 4)) / (r - 4), age = (e - hit) / (0.35 + rand(i, 63, sd) * 0.2);
    if (age < 0 || age >= 1) continue;
    const bx = x + Math.cos(th) * d, by = y + Math.sin(th) * d * FY, lift = Math.sin(Math.PI * Math.min(1, age * 1.3)) * (5 + rand(i, 64, sd) * 6) * (1 - age * 0.4);
    const w = 4 + Math.round(rand(i, 65, sd) * 4), wy = Math.max(1, Math.round(w * FY)), sk = Math.cos(aim) * 1.5 * lift * 0.3;
    if (lift < 0.6) continue;
    X.ellipse(g, bx, by + 1, w * 0.6, wy * 0.6, '#120c08'); // the hole it came out of
    const top: Pt[] = [[bx - w / 2, by - lift], [bx + w / 2, by - lift], [bx + w / 2 + sk, by - lift - wy], [bx - w / 2 + sk, by - lift - wy]];
    X.rect(o, bx - w / 2 - 1, by - lift - wy - 1, w + 2 + Math.abs(sk), lift + wy + 3, '#1a120c'); // a dark outline, so the chunk reads against the floor
    X.rect(o, bx - w / 2, by - lift, w, lift + 1, i % 2 ? R[3] : R[4]); // its broken face
    X.poly(o, top, i % 3 ? R[1] : R[2]); // its top, the floor's own surface
    X.line(o, top[3][0], top[3][1], top[2][0], top[2][1], R[0]); // the lit far edge
  }
  // dust thrown up along the front
  if (live > 0) for (let i = 0; i < 14; i++) {
    const th = aim - half + (2 * half * (i + 0.5 + (rand(i, 71, sd) - 0.5) * 0.6)) / 14, k = inCone(n, th);
    if (k <= 0 || !mine(part, th)) continue;
    const q = clamp(e / T, 0, 1);
    K.puff(o, x + Math.cos(th) * front, y + Math.sin(th) * front * FY - 3 - q * 6, 2 + q * 4, i % 2 ? '#9a8a76' : '#6a5a4a', 0.6 * live * k);
  }
  // grit and stones flung up where the front passes
  for (let i = 0; i < 22; i++) {
    const th = pick(n, rand(i, 81, sd)), born = rand(i, 82, sd) * T, age = (e - born) / (0.35 + rand(i, 83, sd) * 0.2);
    if (age < 0 || age >= 1 || !mine(part, th) || inCone(n, th) < 0.3) continue;
    const d = reachAt(born) + 6 * age, z = (10 + rand(i, 84, sd) * 14) * age - 26 * age * age + 1;
    if (z > 0) K.sq(o, x + Math.cos(th) * d, y + Math.sin(th) * d * FY - z, i % 4 ? 1 : 2, R[i % 3]);
  }
}

const NOVAS: Partial<Record<number, (n: Nova) => void>> = { 1: water, 2: life, 4: cold, 6: arcane, 8: fire };
/** The Weapon cast with elements (the imbued burst), directed: the novas cut to a cone, and arcane's and earth's own. */
const BURSTS: Partial<Record<number, (n: Nova) => void>> = { 1: water, 4: cold, 6: arcaneBurst, 8: fire, 9: earthBurst };
/** How long each burst plays, s. */
export const BURST_LIFE: Partial<Record<number, number>> = { 1: 1.2, 4: 1.4, 6: 0.75, 8: 1.8, 9: 1.4 };
/** Has element `look` a burst of its own here? */
export const hasBurst = (look: number): boolean => !!BURSTS[look];
/** Draws one pass of element `look`'s burst from (x, y) along the cone aim ± half (radians on the ground), out to r px. */
export function drawBurst(o: Ctx, g: Ctx, look: number, x: number, y: number, r: number, e: number, t: number, sd: number, light: NovaLight, part: NovaPart, aim: number, half: number): boolean {
  const draw = BURSTS[look];
  if (!draw) return false;
  draw({ o, g, x, y, mx: x, my: y, r, e, t, sd, light, part, aim, half });
  return true;
}

/**
 * The nova radius every timing in this file is tuned for, px (SHAPES.novaRadius, 3 u). A bigger ring plays slower in
 * proportion, so its wave travels at the same speed whatever its size (the user, 2026-11-11: a big nova raced out,
 * because every nova took the same time to reach its edge). A smaller one plays faster, down to a floor.
 */
export const NOVA_REF = 3 * 16;
/** How much slower than the tuned timings a nova of radius r px plays. */
export const novaStretch = (r: number): number => clamp(r / NOVA_REF, 0.7, 3);

/** Has element `look` a nova of its own here? */
export const hasNova = (look: number): boolean => !!NOVAS[look];

/**
 * Draws one pass of the Area cast of element `look`, e seconds in: the wave round (x, y), the marks it leaves round
 * (mx, my). False if that element has no nova of its own.
 */
export function drawNova(o: Ctx, g: Ctx, look: number, x: number, y: number, r: number, e: number, t: number, sd: number, light: NovaLight, part: NovaPart, mx = x, my = y): boolean {
  const draw = NOVAS[look];
  if (!draw) return false;
  draw({ o, g, x, y, mx, my, r, e: e / novaStretch(r), t, sd, light, part, aim: 0, half: 0 });
  return true;
}
