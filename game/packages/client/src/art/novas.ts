/**
 * The Area casts of the single elements. Each one is a single connected surface travelling
 * outward: a wall of columns set close enough to touch, whose top edge comes from noise that
 * wraps around the ring. Nothing here is a row of separate objects, because a row of separate
 * objects is what the eye counts ("a bunch of candles"). Pure in (time, seed).
 */
import * as K from './kit';
import * as X from './px';
import type { Ctx, Pt } from './px';
import { FY, TAU, clamp, easeOut, rand, seg } from './util';

export type NovaLight = (x: number, y: number, r: number, col: string, a: number, soft?: boolean) => void;
type Noise = (th: number, t: number) => number;
/** From tallest to shortest: each band is a height fraction of its column and a colour. */
type Bands = readonly (readonly [number, string])[];
interface Layer { rr: number; step: number; lean: number; bands: Bands; height: (th: number) => number; calm?: (th: number) => number; stripes?: boolean }

const EL = X.EL;
const DARK_SCORCH = '#160e10';

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

/** Half the ring, sorted far to near: side -1 is the arc behind the centre, side 1 the arc in front. */
function around(rr: number, step: number, side: -1 | 1, fn: (th: number, i: number) => void): void {
  const n = Math.max(8, Math.ceil((1.24 * rr) / step)); // a quarter of the ellipse's perimeter is about 1.24 r at FY 0.5
  for (let j = 0; j <= n; j++) {
    const a = (Math.PI / 2) * (side < 0 ? j / n : 1 - j / n), mid = side * (Math.PI / 2);
    fn(mid - a, j); fn(mid + a, j);
  }
}

/** Draws the layers of a wall, far to near, so the arc in front of the caster covers the arc behind. Outer layers come first. */
function walls(c: Ctx, x: number, y: number, side: -1 | 1, layers: readonly Layer[]): void {
  for (let l = 0; l < layers.length; l++) {
    const L = layers[side < 0 ? l : layers.length - 1 - l];
    if (L.rr < 1) continue;
    const w = L.stripes ? 1 : L.step + 1;
    around(L.rr, L.step, side, (th, i) => {
      if (L.stripes && i % 2) return;
      const h = L.height(th);
      if (h < 1) return;
      const cos = Math.cos(th), sin = Math.sin(th), bx = x + cos * L.rr, by = y + sin * L.rr * FY;
      // each band fills only down to the next one, so the leaning stack never sticks out past its neighbour
      const topOf = (k: number): number => {
        const f = L.bands[k][0], body = f < 1 && L.calm ? h * 0.62 + L.calm(th) * 0.38 : h;
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

/** A ragged ring on the ground (r0 = 0 fills it); wobble is a fraction of the radius, by angle. */
function band(c: Ctx, x: number, y: number, r0: number, r1: number, col: string, a: number, wobble: (th: number) => number, n = 64): void {
  if (a <= 0.02 || r1 <= r0) return;
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) { const th = (i / n) * TAU, q = r1 * (1 + wobble(th)); pts.push([x + Math.cos(th) * q, y + Math.sin(th) * q * FY]); }
  if (r0 > 0.5) for (let i = n; i >= 0; i--) { const th = (i / n) * TAU, q = r0 * (1 + wobble(th)); pts.push([x + Math.cos(th) * q, y + Math.sin(th) * q * FY]); }
  X.poly(c, pts, col, a);
}

/** A sheet going out goes out in patches that shrink closed: 1 while whole, tapering to 0 where it has burned away. */
const holdUp = (noise: number, life: number): number => clamp((life * 1.35 - noise) * 4, 0, 1);

function fire(o: Ctx, g: Ctx, x: number, y: number, r: number, e: number, t: number, sd: number, light: NovaLight): void {
  const R = EL.fire, q = e / 0.55, rr = 6 + (r - 6) * easeOut(Math.min(1, q)), life = 1 - seg(q, 0.72, 1.35), burn = 1 - seg(e, 1, 1.8);
  const edge = ringNoise(sd + 1, [5, 9, 14], 0, false), tear = ringNoise(sd + 2, [3, 7, 12], 0, false);
  const wobble = (th: number) => (edge(th, 0) - 0.5) * 0.14;
  // scorched ground follows behind the wave and stays a moment (only a drawing: nothing burns on the floor)
  if (burn > 0) band(g, x, y, Math.min(rr * 0.3, r * 0.22), Math.min(r, rr * 1.02), DARK_SCORCH, 0.5 * burn, wobble);
  if (life > 0) {
    band(g, x, y, rr * 0.5, rr + 1, R[4], 0.75 * life * life, wobble);
    band(g, x, y, rr * 0.76, rr + 1, R[3], 0.8 * life * life, wobble);
  }
  if (e < 0.14) { const f0 = 1 - e / 0.14; X.glow(o, x, y - 6, 22 + r * 0.3, EL.fire[1], 0.95 * f0); X.ellipse(o, x, y - 5, 5 + 12 * f0, 3 + 8 * f0, '#ffffff', f0); }
  if (life > 0) {
    const peak = (15 + r * 0.16) * Math.min(1, rr / 22) * Math.min(1, q * 5) * Math.pow(life, 0.6);
    const tips = ringNoise(sd, [6, 11, 19, 31], 11, true), roll = ringNoise(sd + 3, [2, 4], 4, false);
    const crest = (th: number) => peak * (0.34 + 0.56 * tips(th, t) + 0.32 * roll(th, t)) * holdUp(tear(th, 0), life);
    const body = (th: number) => peak * (0.2 + 0.34 * tips(th + 1.3, t * 1.15)) * holdUp(tear(th + 0.6, 0), life);
    const wake = (th: number) => peak * (0.08 + 0.2 * tips(th + 2.4, t * 1.3)) * holdUp(tear(th + 1.2, 0), life * 0.8);
    const flame: Bands = [[1, R[4]], [0.82, R[3]], [0.58, R[2]], [0.32, R[1]]], low: Bands = [[1, R[3]], [0.66, R[2]], [0.3, R[1]]];
    const calm = (th: number) => peak * (0.62 + 0.3 * roll(th, t)) * holdUp(tear(th, 0), life);
    const layers: Layer[] = [
      { rr, step: 1.5, lean: 9, bands: flame, height: crest, calm },
      { rr: rr * 0.85, step: 2, lean: 5, bands: low, height: body },
      { rr: rr * 0.68, step: 2, lean: 2, bands: low, height: wake },
    ];
    walls(o, x, y, -1, layers);
    walls(o, x, y, 1, layers);
  }
  // embers thrown off the crest as it passes
  for (let i = 0; i < 46 && e < 1.2; i++) {
    const born = rand(i, 10, sd) * 0.42, age = (e - born) / (0.4 + rand(i, 11, sd) * 0.45);
    if (age < 0 || age >= 1) continue;
    const th = rand(i, 12, sd) * TAU, d = (6 + (r - 6) * easeOut(Math.min(1, born / 0.55))) + 8 + 18 * age, lift = 6 + rand(i, 13, sd) * 16 + 34 * age - 22 * age * age;
    X.px(o, x + Math.cos(th) * d, y + Math.sin(th) * d * FY - lift, K.fireCol(0.15 + age * 0.8));
  }
  // smoke lifting off the wake, thin and scattered
  for (let i = 0; i < 18 && e > 0.28; i++) {
    const th = rand(i, 14, sd) * TAU, d = r * Math.sqrt(0.25 + rand(i, 15, sd) * 0.75), u = seg(e, 0.28 + rand(i, 16, sd) * 0.3, 1.75);
    if (u > 0 && u < 1) K.puff(o, x + Math.cos(th) * d, y + Math.sin(th) * d * FY - 10 - u * 22, 2 + u * 4, i % 2 ? '#4a4048' : '#2e282e', 0.55 * (1 - u));
  }
  light(x, y, r + 44, '#ff7a2a', 1.15 * (1 - seg(e, 0, 0.85)));
}

function water(o: Ctx, g: Ctx, x: number, y: number, r: number, e: number, t: number, sd: number, light: NovaLight): void {
  const R = EL.water, q = e / 0.62, rr = 6 + (r - 6) * easeOut(Math.min(1, q)), life = 1 - seg(q, 0.7, 1.25);
  const edge = ringNoise(sd + 1, [4, 7, 13], 0, false), wobble = (th: number) => (edge(th, 0) - 0.5) * 0.1;
  const wet = 1 - seg(e, 0.55, 1.25);
  band(g, x, y, rr * 0.45, rr, R[3], 0.32 * wet, wobble);
  band(g, x, y, rr * 0.62, rr * 0.67, R[1], 0.42 * wet, wobble); // a line of foam left behind
  if (e < 0.08) X.ellipse(o, x, y - 4, 10, 7, R[0], 1 - e / 0.08);
  if (life > 0) {
    const peak = (9 + r * 0.07) * Math.min(1, rr / 16) * Math.min(1, q * 6) * Math.pow(life, 0.8);
    const swell = ringNoise(sd, [3, 5, 9, 14], 6, false);
    const crest = (th: number) => peak * (0.7 + 0.75 * swell(th, t));
    const behind = (th: number) => peak * (0.2 + 0.32 * swell(th + 1.9, t * 0.8));
    const wave: Bands = [[1, R[0]], [0.86, R[1]], [0.66, R[2]], [0.36, R[3]], [0.14, R[4]]], low: Bands = [[1, R[1]], [0.7, R[2]], [0.3, R[3]]];
    const layers: Layer[] = [{ rr, step: 1.5, lean: 6, bands: wave, height: crest }, { rr: rr * 0.82, step: 2, lean: 2, bands: low, height: behind }];
    walls(o, x, y, -1, layers);
    walls(o, x, y, 1, layers);
  }
  // spray flung off the crest
  for (let i = 0; i < 54 && e < 1.1; i++) {
    const born = rand(i, 20, sd) * 0.5, age = (e - born) / (0.32 + rand(i, 21, sd) * 0.3);
    if (age < 0 || age >= 1) continue;
    const th = rand(i, 22, sd) * TAU, d = (6 + (r - 6) * easeOut(Math.min(1, born / 0.62))) + 3 + 16 * age, up = 8 + rand(i, 23, sd) * 8, lift = up + 26 * age - 34 * age * age;
    if (lift > 0) X.px(o, x + Math.cos(th) * d, y + Math.sin(th) * d * FY - lift, i % 3 ? R[1] : R[0]);
  }
  light(x, y, r + 30, R[2], 0.8 * (1 - seg(e, 0, 0.6)));
}

function cold(o: Ctx, g: Ctx, x: number, y: number, r: number, e: number, _t: number, sd: number, light: NovaLight): void {
  const R = X.FROST, q = e / 0.5, rr = 6 + (r - 6) * easeOut(Math.min(1, q)), life = 1 - seg(q, 0.8, 1.2), frost = 1 - seg(e, 0.7, 1.3);
  const teeth = ringNoise(sd, [13, 23, 37], 0, true), edge = ringNoise(sd + 1, [17, 29, 41], 0, true), crack = ringNoise(sd + 2, [4, 9, 15], 0, false);
  const jag = (th: number) => (edge(th, 0) - 0.5) * 0.12;
  // hoarfrost spreads over the floor behind the front, with a white rim
  band(g, x, y, 0, rr, R[4], 0.3 * frost, jag);
  band(g, x, y, rr * 0.55, rr, R[3], 0.3 * frost, jag);
  if (life > 0) band(g, x, y, rr - 3, rr + 1, R[0], 0.85 * life, jag);
  if (e < 0.08) X.ellipse(o, x, y - 4, 10, 7, R[0], 1 - e / 0.08);
  if (life > 0) {
    const peak = (12 + r * 0.14) * Math.min(1, rr / 18) * Math.min(1, q * 6);
    const crest = (th: number) => peak * (0.28 + 0.92 * teeth(th, 0) * teeth(th, 0)) * holdUp(crack(th, 0), life);
    const ice: Bands = [[1, R[0]], [0.76, R[1]], [0.5, R[2]], [0.22, R[3]]];
    const layers: Layer[] = [{ rr, step: 1, lean: 4, bands: ice, height: crest }];
    walls(o, x, y, -1, layers);
    walls(o, x, y, 1, layers);
    band(o, x, y - 2, rr * 0.8, rr + 5, '#c4eefa', 0.3 * life, jag); // the cold air it pushes along the floor
  }
  // the wall shatters where it stops
  const shards = seg(q, 0.8, 1) * (1 - seg(e, 0.78, 1.25));
  for (let i = 0; i < 64 && shards > 0; i++) {
    const age = seg(e, 0.4 + rand(i, 30, sd) * 0.12, 1.2), th = rand(i, 31, sd) * TAU, d = r + (rand(i, 32, sd) - 0.5) * 8 + 12 * age, lift = 3 + rand(i, 33, sd) * 16 + 12 * age - 26 * age * age;
    if (age > 0 && lift > 0) K.sq(o, x + Math.cos(th) * d, y + Math.sin(th) * d * FY - lift, i % 4 ? 1 : 2, i % 3 ? R[1] : R[0]);
  }
  light(x, y, r + 30, R[3], 0.8 * (1 - seg(e, 0, 0.6)));
}

function life(o: Ctx, g: Ctx, x: number, y: number, r: number, e: number, t: number, sd: number, light: NovaLight): void {
  const R = X.LIFE, q = e / 0.75, rr = 6 + (r - 6) * easeOut(Math.min(1, q)), fade = 1 - seg(q, 0.6, 1.25);
  const edge = ringNoise(sd + 1, [3, 5, 8], 0, false), wobble = (th: number) => (edge(th, 0) - 0.5) * 0.12;
  band(g, x, y, rr * 0.3, rr, R[4], 0.42 * fade, wobble);
  band(g, x, y, rr * 0.72, rr + 1, R[3], 0.55 * fade, wobble);
  if (e < 0.1) X.glow(o, x, y - 6, 18, R[1], 0.8 * (1 - e / 0.1));
  if (fade > 0) {
    const peak = (24 + r * 0.12) * Math.min(1, rr / 20) * Math.min(1, q * 4) * fade;
    const veil = ringNoise(sd, [2, 3, 5, 8], 2.4, false);
    const height = (th: number) => peak * (0.35 + 0.8 * veil(th, t));
    // thin upright threads of light, brightest at the floor: a veil you can see through
    const threads: Bands = [[1, R[4]], [0.78, R[3]], [0.48, R[2]], [0.2, R[1]]];
    const layers: Layer[] = [{ rr, step: 1, lean: 0, bands: threads, height, stripes: true }];
    walls(o, x, y, -1, layers);
    walls(o, x, y, 1, layers);
  }
  // motes rise along the whole ring as it opens
  for (let i = 0; i < 46 && e < 1.25; i++) {
    const born = rand(i, 40, sd) * 0.6, age = (e - born) / (0.45 + rand(i, 41, sd) * 0.3);
    if (age < 0 || age >= 1) continue;
    const th = rand(i, 42, sd) * TAU, d = (6 + (r - 6) * easeOut(Math.min(1, born / 0.75))) * (0.75 + rand(i, 43, sd) * 0.3), s = Math.sin(t * 5 + i) * 1.5;
    X.px(o, x + Math.cos(th) * d + s, y + Math.sin(th) * d * FY - 4 - age * 30, age < 0.5 ? R[1] : R[3]);
  }
  light(x, y, r + 30, EL.life[2], 0.8 * (1 - seg(e, 0, 0.8)));
}

function arcane(o: Ctx, g: Ctx, x: number, y: number, r: number, e: number, t: number, sd: number, light: NovaLight): void {
  const R = EL.arcane, q = e / 0.42, rr = 5 + (r - 5) * easeOut(Math.min(1, q)), fade = 1 - seg(q, 0.85, 1.3), none = () => 0;
  if (fade > 0) {
    band(g, x, y, rr * 0.82, rr, R[5], 0.65 * fade, none);
    K.gring(g, x, y, rr * 0.8, R[3], fade * 0.8, 1);
    K.gring(g, x, y, rr + 1, R[2], fade, 2);
  }
  if (e < 0.07) X.ellipse(o, x, y - 4, 11, 8, '#ffffff', 1 - e / 0.07);
  if (fade > 0) {
    const peak = (9 + r * 0.05) * Math.min(1, rr / 14) * Math.min(1, q * 7) * Math.pow(fade, 0.5);
    const fizz = ringNoise(sd + 1, [29, 43], 34, false), s = rand(1, 50, sd) * TAU;
    const height = (th: number) => {
      const pulse = Math.pow(0.5 + 0.5 * Math.sin(7 * th + s + t * 22), 3); // knots running round the ring
      return peak * (0.72 + 0.16 * fizz(th, t) + 0.34 * pulse);
    };
    const hard: Bands = [[1, R[4]], [0.86, R[3]], [0.62, R[2]], [0.3, R[0]]];
    const layers: Layer[] = [{ rr, step: 1.5, lean: 0, bands: hard, height }];
    walls(o, x, y, -1, layers);
    walls(o, x, y, 1, layers);
  }
  // scraps torn off the wall, flung up and gone fast
  for (let i = 0; i < 36 && e < 0.8; i++) {
    const born = rand(i, 51, sd) * 0.34, age = (e - born) / (0.18 + rand(i, 52, sd) * 0.2);
    if (age < 0 || age >= 1) continue;
    const th = rand(i, 53, sd) * TAU, d = (5 + (r - 5) * easeOut(Math.min(1, born / 0.42))) + 10 * age;
    X.px(o, x + Math.cos(th) * d, y + Math.sin(th) * d * FY - 6 - rand(i, 54, sd) * 8 - 18 * age, i % 2 ? R[1] : R[2]);
  }
  light(x, y, r + 30, R[2], 0.85 * (1 - seg(e, 0, 0.5)));
}

const NOVAS: Partial<Record<number, typeof fire>> = { 1: water, 2: life, 4: cold, 6: arcane, 8: fire, 10: cold }; // 10: Ice rings with Cold's nova for now (its own is open)

/** Draws the Area cast of element `look` e seconds in. False if that element has no nova of its own. */
export function drawNova(o: Ctx, g: Ctx, look: number, x: number, y: number, r: number, e: number, t: number, sd: number, light: NovaLight): boolean {
  const draw = NOVAS[look];
  if (!draw) return false;
  draw(o, g, x, y, r, e, t, sd, light);
  return true;
}
