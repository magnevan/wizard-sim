/**
 * A defence's flamethrower, drawn as one stream of fire (the user, 2026-11-10: redesign it rather than adapt the cone).
 *
 * Every particle has a spot on the ground and a height over it, so the jet is a body in the scene rather than a
 * picture on top: it leaves the nozzle high on the tower, runs out over the wall and comes down toward chest height
 * where it ends. A particle is born white at the nozzle, slows, widens and cools through yellow, orange and red, and
 * what's left rises as smoke all along the far two thirds, not only where it lands. There's no solid core line and
 * no separate impact sprite: the dense end of the stream is the billow.
 *
 * It's drawn in bands of depth along the ground, each through `behind`, so the wall and the gate's pillars hide the
 * part of the jet that has passed behind them. Pure functions of time, like the other effects.
 */
import * as X from './px';
import type { Ctx, Pt } from './px';
import { puff } from './kit';
import { FY, emit, rand, seg } from './util';

/** Hottest to coolest. The last two are the flame going out. */
const HEAT = ['#fffbe8', '#fff4c0', '#ffd860', '#ff9a30', '#ff5a20', '#d8401c', '#9a2a1c'];
const SMOKE = ['#4e4648', '#666064', '#7e787a'];
const EMBER = ['#fff4c0', '#ffd860', '#ff9a30'];

export interface Jet {
  /** The nozzle, on the screen. */
  nozzle: Pt;
  /** The ground under the nozzle (the tower's spot) and where the jet ends on the ground, field px. */
  from: Pt; to: Pt;
  /**
   * The way the barrel points, as drawn (swivel to nozzle). The barrel is level, so this is also its direction on the
   * ground in field px: the jet leaves that way, and bends toward `to` if that's elsewhere.
   */
  barrel: Pt;
  /** Height of the jet's end over the ground, px. */
  endH: number;
  /**
   * Where a ground spot (field px) is against the wall: on the near side the jet is in front of everything near its
   * tower; just past the line it's over the wall's top, so only taller things (the gate's pillars) hide it.
   */
  side: (x: number, y: number) => 'near' | 'over' | 'far';
  /** Ground y that sorts just in front of the tower, for the part of the jet before the wall. */
  frontY: number;
  t0: number;
  seed: number;
}

interface P { s: number; gx: number; gy: number; x: number; y: number; r: number; col: string; a: number; smoke: boolean; ember: boolean }

/** How long a flame particle lives at most, s. Each lives 75 to 100% of it. */
const LIFE = 0.62;
/** Bands of depth the jet is cut into for hiding. */
const BANDS = 7;

/** A filled pixel disc (no anti-aliasing). */
function disc(c: Ctx, x: number, y: number, r: number, col: string): void {
  if (r < 0.9) { X.px(c, x, y, col); return; }
  const cx = Math.round(x), cy = Math.round(y), R = Math.round(r);
  for (let dy = -R; dy <= R; dy++) {
    const hw = Math.floor(Math.sqrt(Math.max(0, r * r - dy * dy)) + 0.35);
    if (hw >= 0) X.rect(c, cx - hw, cy + dy, hw * 2 + 1, 1, col);
  }
}

/** The jet's particles this frame, back to front within each band. */
function particles(j: Jet, t: number): P[] {
  const [fx, fy] = j.from, [tx, ty] = j.to, sd = j.seed;
  const h0 = fy - j.nozzle[1], nx0 = j.nozzle[0] - fx; // the nozzle is above (and a little across from) the tower's spot
  // across the jet, on the ground: the ground direction with the squash taken out, turned a quarter, squashed back
  const gdx = tx - fx, gdy = (ty - fy) / FY, gl = Math.hypot(gdx, gdy) || 1, px = -gdy / gl, py = (gdx / gl) * FY;
  const on = seg(t, j.t0, j.t0 + 0.08);
  const out: P[] = [];
  // The path on the ground is a curve from under the nozzle to `to`, leaving along the barrel: where the sim's spray
  // lands can be off the barrel's line (it fires from the muzzle, past the wall), and this bends the jet there
  // smoothly. The barrel's length on the ground (without the squash) sets how hard it holds the barrel's line.
  const ax0 = fx + nx0, ay0 = fy, bl = Math.hypot(j.barrel[0], j.barrel[1] / FY) || 1, span = Math.hypot(tx - ax0, (ty - ay0) / FY);
  const cx = ax0 + (j.barrel[0] / bl) * span * 0.5, cy = ay0 + (j.barrel[1] / bl) * span * 0.5;
  const at = (s: number, l: number, h: number): [number, number, number, number] => {
    const k = Math.min(1, s), e = s - k, m = 1 - k;
    // past the end it carries on along the curve's last direction
    const gxp = m * m * ax0 + 2 * k * m * cx + k * k * tx + e * 2 * (tx - cx) + px * l;
    const gyp = m * m * ay0 + 2 * k * m * cy + k * k * ty + e * 2 * (ty - cy) + py * l;
    return [gxp, gyp, gxp, gyp - h];
  };
  // It leaves the barrel level and comes down to chest height as it goes, as a burning liquid would.
  const axisH = (s: number) => { const k = Math.min(1, s); return h0 + (j.endH - h0) * k * k; };
  const width = (s: number) => 1.4 + 15 * Math.pow(Math.min(1.1, s), 0.85);

  // the core: a dense, hot stream over the first third, so the jet is solid where it leaves the nozzle
  for (const q of emit(t, 900, 0.16, (i, age, ts) => (ts < j.t0 ? null : { i, age }))) {
    const i = q.i, a = q.age, s = a * 0.36 * Math.max(0.15, on);
    const l = (rand(i, 31, sd) * 2 - 1) * (0.6 + s * 6);
    const [gxp, gyp, x, y] = at(s, l, axisH(s) + Math.sin(i * 1.7 + t * 40) * 0.6);
    const heat = a * 0.42 + rand(i, 32, sd) * 0.12;
    out.push({ s, gx: gxp, gy: gyp, x, y, r: 0.6 + s * 2.2, col: HEAT[Math.min(HEAT.length - 1, Math.floor(heat * HEAT.length))], a: heat, smoke: false, ember: false });
  }

  // flame: born at the nozzle, slowing as it goes, so it bunches and billows at the far end
  for (const q of emit(t, 560, LIFE, (i, age, ts) => (ts < j.t0 ? null : { i, age }))) {
    const i = q.i, life = 0.75 + 0.25 * rand(i, 1, sd), a = q.age / life;
    if (a >= 1) continue;
    const reach = 0.86 + 0.24 * rand(i, 2, sd), s = (1 - Math.pow(1 - a, 1.8)) * reach * Math.max(0.15, on);
    const side = rand(i, 3, sd) * 2 - 1, l = side * Math.abs(side) ** 0.3 * width(s) + Math.sin(a * 11 + i * 0.7) * 2.2 * s;
    const h = axisH(s) + a * a * 14 + Math.sin(a * 9 + i * 1.3) * 1.6 * s;
    const [gxp, gyp, x, y] = at(s, l, h);
    const edge = Math.abs(side); // the outside of the stream cools first
    const heat = a * (0.85 + 0.3 * rand(i, 4, sd)) + edge * 0.25 * s;
    const k = Math.min(HEAT.length - 1, Math.floor(heat * HEAT.length));
    let r = 0.5 + s * 2.6 * (0.6 + 0.6 * rand(i, 5, sd));
    if (a > 0.78) r *= 1 - (a - 0.78) * 2.2;
    out.push({ s, gx: gxp, gy: gyp, x, y, r, col: HEAT[k], a: heat, smoke: false, ember: false });
  }

  // smoke: rises off the stream all along its far two thirds, thickest at the end
  for (const q of emit(t, 58, 1.5, (i, age, ts) => (ts < j.t0 + 0.12 ? null : { i, age, ts }))) {
    const i = q.i, a = q.age, sb = 0.28 + 0.8 * Math.sqrt(rand(i, 11, sd));
    if (sb * Math.max(0.15, seg(q.ts, j.t0, j.t0 + 0.3)) > 1.1) continue;
    const side = rand(i, 12, sd) * 2 - 1, s = sb + a * 0.12, l = side * width(sb) * (0.7 + a * 0.5);
    const h = axisH(sb) + 4 + a * 34 + Math.sin(a * 5 + i) * 2;
    const [gxp, gyp, x, y] = at(s, l, h);
    const col = SMOKE[a < 0.3 ? 0 : a < 0.65 ? 1 : 2];
    out.push({ s, gx: gxp + a * 5, gy: gyp, x: x + a * 5, y, r: 1.4 + sb * 1.2 + a * 3.5, col, a: 0.54 - 0.3 * a, // always a checker: smoke you see the ground through
      smoke: true, ember: false });
  }

  // embers: a few sparks that carry past the flame and fall
  for (const q of emit(t, 34, 0.9, (i, age, ts) => (ts < j.t0 ? null : { i, age }))) {
    const i = q.i, a = q.age, s = (1 - Math.pow(1 - a, 1.5)) * (0.95 + 0.35 * rand(i, 21, sd));
    const side = rand(i, 22, sd) * 2 - 1, l = side * width(s) * 1.1;
    const h = axisH(s) + Math.sin(a * Math.PI) * 10 - a * a * 18;
    const [gxp, gyp, x, y] = at(s, l, Math.max(0, h));
    if ((i + Math.floor(t * 18)) % 5 === 0) continue; // a flicker
    out.push({ s, gx: gxp, gy: gyp, x, y, r: 0, col: EMBER[i % 3], a, smoke: false, ember: true });
  }
  return out;
}

/** Draws the jet through `behind`, band by band, so whatever stands in front of a stretch of it hides that stretch. */
export function flameJet(o: Ctx, j: Jet, t: number, behind: ((ax: number, ay: number, R: number, draw: (o: Ctx) => void, spread?: boolean, overWalls?: boolean) => void) | null): void {
  const ps = particles(j, t);
  const band = (p: P) => Math.max(0, Math.min(BANDS - 1, Math.floor((p.s / 1.15) * BANDS)));
  const groups: P[][] = Array.from({ length: BANDS }, () => []);
  for (const p of ps) groups[band(p)].push(p);
  const drawGroup = (c: Ctx, g: P[]) => {
    for (const p of g) if (p.smoke) puff(c, p.x, p.y, p.r, p.col, p.a);
    // cooler first, so the hot middle shows on top
    const fl = g.filter((p) => !p.smoke).sort((a, b) => b.a - a.a);
    for (const p of fl) p.ember ? X.px(c, p.x, p.y, p.col) : disc(c, p.x, p.y, p.r, p.col);
  };
  // the nozzle's flare, on top of the head
  const nozzle = (c: Ctx) => { X.glow(c, j.nozzle[0], j.nozzle[1], 6, '#ffd860', 0.75); disc(c, j.nozzle[0], j.nozzle[1], 1.4, '#fffbe8'); };
  // far bands first
  for (let b = BANDS - 1; b >= 0; b--) {
    const g = groups[b];
    if (!g.length) continue;
    if (!behind) { drawGroup(o, g); continue; }
    let ax = 0, ay = 0;
    for (const p of g) { ax += p.gx; ay += p.gy; }
    ax /= g.length; ay /= g.length;
    // before the wall's line the jet is in front of everything near its tower, the tower and head included
    const where = j.side(ax, ay), dy = where === 'near' ? Math.max(ay, j.frontY) : ay;
    // behind draws inside a box round its anchor (R + 24 across and below, R + 70 above): big enough for the whole band
    let R = 0;
    for (const p of g) R = Math.max(R, Math.abs(p.x - ax) + p.r - 20, dy - p.y + p.r - 66, p.y - dy + p.r - 20);
    // the wall stands on its line, so none of its pieces can be in front of the jet until it's well past it
    behind(ax, dy, R, (c) => drawGroup(c, g), false, where !== 'far');
  }
  nozzle(o);
}

/** A defence's pilot flame: a small live flame at the nozzle while it isn't firing. */
export function pilotFlame(c: Ctx, x: number, y: number, t: number, seed: number): void {
  const f = Math.sin(t * 13 + seed) * 0.5 + Math.sin(t * 7.3 + seed * 2) * 0.5; // -1..1
  const h = 4.5 + f * 1.2, sway = Math.sin(t * 5 + seed) * 0.8;
  X.glow(c, x, y - 2, 5, '#ff9a30', 0.45);
  // a teardrop, rows from the base up: wide and red at the bottom, narrow and pale toward the tip
  for (let r = 0; r <= Math.ceil(h); r++) {
    const k = r / h, hw = Math.round((1 - k) * 1.6 + (k < 0.3 ? 0.4 : 0)), xx = Math.round(x + sway * k * k);
    const col = k < 0.25 ? '#ff5a20' : k < 0.55 ? '#ff9a30' : k < 0.8 ? '#ffd860' : '#fff4c0';
    X.rect(c, xx - hw, Math.round(y - r), hw * 2 + 1, 1, col);
  }
  X.px(c, Math.round(x), Math.round(y - 1), '#fff4c0');
  if ((Math.floor(t * 9 + seed) & 7) === 0) X.px(c, Math.round(x + sway * 2), Math.round(y - h - 2), '#ffd860');
}
