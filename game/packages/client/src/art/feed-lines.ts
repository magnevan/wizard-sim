/**
 * The battery's feed lines: glowing glyph paths cut into the ground from the well to what it feeds, so you can see where
 * the defences' fire comes from (the user, 2026-11-12). One runs to each defence by way of its pedestal (the control), and
 * a trunk runs north to the gate, splitting to its two pillars, for the wall of fire.
 *
 * Each is a dark groove with runes along it and pulses of light running out from the well. How bright they are and how
 * fast the pulses go follow the well's flow (sim battery.flow); the line to a defence someone is driving burns brighter.
 * As the well fails (beat 5) the runes start to gutter; when it runs dry (beat 6) the light drains back down every line
 * into the well, and they stay dark.
 *
 * Drawn on the ground canvas every frame, in the view's turned world (iso-world.ts), as the props are.
 */
import type { World } from '@wizard-sim/sim';
import { gx, gy } from './field';
import * as X from './px';
import type { Ctx } from './px';
import { mod, rand } from './util';

type LightFn = (x: number, y: number, r: number, col: string, a: number) => void;
type P = readonly [number, number];
interface Feed { pts: P[]; tower: number }

/** The fire ramp the lines glow in, hot to dim, and the groove. */
const HOT = '#ffe6a0', LIT = '#ffb040', WARM = '#e0701c', DIM = '#7a3412', COLD = '#3a2418', GROOVE = '#1c120c';
/** Art px between runes, and between pulses; pulses' speed (px/s) at a full well. */
const RUNE_GAP = 9, PULSE_GAP = 46, PULSE_SPEED = 38;
/** How long the light takes to drain back into the well when it runs dry, s. */
const DRAIN = 1.1;
/** How far out from the well's middle the lines start, and short of a tower's middle they end, world units. */
const WELL_R = 2.6, TOWER_R = 2.3;

let cache: { def: unknown; feeds: Feed[] } | null = null;

/** The lines' corners in field px, worked out once per room. */
function feedsOf(w: World): Feed[] {
  if (cache && cache.def === w.def) return cache.feeds;
  const props = w.def.props, well = props.find((p) => p.asset === 'battery-well');
  const towers = props.filter((p) => p.asset === 'defence-tower'), pads = props.filter((p) => p.asset === 'control-pedestal');
  const pillars = props.filter((p) => p.asset === 'battery-pillar');
  const feeds: Feed[] = [];
  if (well) {
    // a point `r` along from a toward b
    const toward = (a: { x: number; y: number }, b: { x: number; y: number }, r: number): [number, number] => {
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
      return [a.x + (dx / d) * r, a.y + (dy / d) * r];
    };
    const F = ([x, y]: [number, number]): P => [gx(x), gy(y)];
    towers.forEach((t, k) => {
      const pad = pads[k] ?? t;
      feeds.push({ tower: k, pts: [F(toward(well, pad, WELL_R)), F([pad.x, pad.y]), F(toward(t, pad, TOWER_R))] });
    });
    if (pillars.length === 2) {
      // the trunk to the gate's middle, a little short of the fire's line, then out to each pillar's foot
      const mx = (pillars[0].x + pillars[1].x) / 2, my = (pillars[0].y + pillars[1].y) / 2 + 1.6;
      const fork = F([mx, my]), start = F(toward(well, { x: mx, y: my }, WELL_R));
      for (const p of pillars) feeds.push({ tower: -1, pts: [start, fork, F(toward(p, { x: mx, y: my }, 0.9))] });
    }
  }
  cache = { def: w.def, feeds };
  return feeds;
}

/** Walks a line: calls fn(x, y, ux, uy, s) every `gap` px of its length, s the distance from the well. */
function along(pts: readonly P[], gap: number, from: number, fn: (x: number, y: number, ux: number, uy: number, s: number) => void): number {
  let s0 = 0, next = from;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i], L = Math.hypot(bx - ax, by - ay) || 1, ux = (bx - ax) / L, uy = (by - ay) / L;
    while (next <= s0 + L) { const d = next - s0; fn(ax + ux * d, ay + uy * d, ux, uy, next); next += gap; }
    s0 += L;
  }
  return s0;
}

const lengthOf = (pts: readonly P[]): number => { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; };

/** A rune cut across the line at (x, y): one of four small marks, by its place along the line. */
function rune(g: Ctx, x: number, y: number, ux: number, uy: number, n: number, col: string): void {
  const nx = -uy, ny = ux * 0.5; // across the line, squashed onto the ground
  switch (n % 4) {
    case 0: X.line(g, x - nx * 2, y - ny * 2, x + nx * 2, y + ny * 2, col); break; // a bar across
    case 1: X.px(g, x - nx * 1.5, y - ny * 1.5, col); X.px(g, x + nx * 1.5, y + ny * 1.5, col); X.px(g, x + ux, y + uy * 0.5, col); break; // three dots
    case 2: X.line(g, x - nx * 2 - ux, y - ny * 2, x + ux, y, col); X.line(g, x + ux, y, x + nx * 2 - ux, y + ny * 2, col); break; // a chevron, pointing out
    default: X.px(g, x, y - 1, col); X.px(g, x - 1, y, col); X.px(g, x + 1, y, col); X.px(g, x, y + 1, col); // a diamond
  }
}

/** Draws every feed line on the ground canvas `g`. `t`: seconds of the view's clock. */
export function feedLines(g: Ctx, w: World, t: number, light: LightFn): void {
  const d = w.battery;
  if (!d) return;
  const feeds = feedsOf(w), flow = d.flow[0], dryT = d.wellT[1] / 60, frame = Math.floor(t * 9);
  for (let f = 0; f < feeds.length; f++) {
    const { pts, tower } = feeds[f], L = lengthOf(pts);
    const driven = tower >= 0 && d.drive.includes(tower);
    // how far out from the well the light still reaches: all of it, or draining back once the well is dry
    const reach = dryT > 0 ? L * Math.max(0, 1 - dryT / DRAIN) : L;
    const k = (driven ? 1 : 0.62) * (0.35 + 0.65 * flow); // brightness
    // the groove, under everything
    X.lines(g, pts, GROOVE, 4);
    X.lines(g, pts, COLD, 2);
    // the lit channel, out as far as the light reaches
    if (reach > 0) {
      const lit: P[] = [pts[0]];
      let s0 = 0;
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1], [bx, by] = pts[i], Ls = Math.hypot(bx - ax, by - ay) || 1;
        if (s0 + Ls >= reach) { const q = (reach - s0) / Ls; lit.push([ax + (bx - ax) * q, ay + (by - ay) * q]); break; }
        lit.push(pts[i]); s0 += Ls;
      }
      X.lines(g, lit, k > 0.6 ? WARM : DIM, 2);
      if (k > 0.45) X.lines(g, lit, LIT, 1);
    }
    // the runes: lit where the light reaches, with a soft glow, guttering as the well fails
    let n = 0;
    along(pts, RUNE_GAP, RUNE_GAP / 2, (x, y, ux, uy, s) => {
      const i = n++;
      const out = rand(i, frame + f * 7, 913) < 0.55 * (1 - flow) * (1 - flow); // a failing well: runes blink out
      const lit = s < reach && !out;
      if (lit) X.glow(g, x, y, 4, WARM, 0.3 * k, 0.5);
      rune(g, x, y, ux, uy, i + f, !lit ? COLD : k > 0.75 ? HOT : k > 0.45 ? LIT : WARM);
    });
    if (reach <= 0) continue;
    // pulses running out from the well, as fast as the well gives; a driven defence's run quicker
    const speed = PULSE_SPEED * (0.25 + 0.75 * flow) * (driven ? 1.6 : 1);
    let m = 0;
    along(pts, PULSE_GAP, mod(t * speed + f * 13, PULSE_GAP), (x, y, ux, uy, s) => {
      if (s > reach) return;
      const j = m++;
      X.line(g, x - ux * 3, y - uy * 3, x, y, k > 0.6 ? LIT : WARM, 2);
      X.px(g, x, y, HOT);
      if (j % 2 === 0) light(x, y, 18, '#ff8a30', 0.22 * k);
    });
    // the light draining back: a bright head on its way into the well
    if (dryT > 0 && reach < L) along(pts, 1e9, Math.max(0, reach - 1), (x, y) => { X.glow(g, x, y, 4, LIT, 0.8); light(x, y, 26, '#ff8a30', 0.4); });
  }
}
