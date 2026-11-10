/**
 * A spray striking a wall: it can't go on, so it spreads along the wall instead. Fire licks sideways
 * and up the face, water bursts out in droplets and runs down, cold grows frost, steam billows.
 * Purely a function of time, like the rest of the effects.
 */
import * as K from './kit';
import * as X from './px';
import type { Ctx, Ramp } from './px';
import { emit, lerp, rand, seg } from './util';

export type SplashKind = 'fire' | 'water' | 'cold' | 'scald' | 'warm';

/** The colour each splash throws on the wall. */
export const SPLASH_LIGHT: Readonly<Record<SplashKind, string>> = { fire: '#ff7a2a', water: '#2a8cff', cold: '#7ff0ff', scald: '#ffd0b0', warm: '#ffe68a' };

/** How far above the wall's foot the spray lands, and how far along it a full spray spreads, in art px. */
const HIT = 6, REACH = 22;
/** How high a beam meets what it hits, art px above the ground (as in vfx.ts's LIFT). */
const BEAM_Z = 9;

/**
 * (x, y) is where the spray meets the foot of the wall and (ux, uy) the wall's direction on screen, unit length.
 * `c` draws over the actors, `g` on the floor.
 */
export function wallSplash(c: Ctx, g: Ctx, x: number, y: number, ux: number, uy: number, t: number, t0: number, kind: SplashKind, seed: number, power = 1): void {
  const reach = REACH * (0.5 + 0.5 * power);
  /** Spread along the wall: particle i, `grow` 0..1 of the way out, on one side or the other. */
  const along = (i: number, grow: number) => (rand(i, 1, seed) < 0.5 ? -1 : 1) * grow * reach * (0.35 + 0.65 * rand(i, 2, seed));
  switch (kind) {
    case 'fire': {
      for (const p of emit(t, 130 * power, 0.5, (i, age) => {
        const a = along(i, Math.pow(age, 0.6));
        return { x: x + ux * a + Math.sin(age * 9 + i) * 1.2, y: y + uy * a - HIT - age * (8 + rand(i, 3, seed) * 20), age };
      }, t0, t)) {
        const big = p.age < 0.45, col = p.age < 0.2 ? '#fff4c0' : p.age < 0.5 ? '#ffb040' : p.age < 0.8 ? '#ff6a20' : '#a03010';
        X.rect(c, p.x - 1, p.y - (big ? 2 : 1), big ? 3 : 1, big ? 4 : 2, col);
      }
      X.glow(c, x, y - HIT, 9, '#ff8a30', 0.55);
      break;
    }
    case 'water': {
      for (const p of emit(t, 110 * power, 0.5, (i, age) => {
        const a = along(i, age), hop = Math.sin(age * Math.PI) * (5 + rand(i, 3, seed) * 11);
        return { x: x + ux * a, y: y + uy * a - HIT * (1 - age) - hop, age, i };
      }, t0, t)) X.px(c, p.x, p.y, p.i % 4 === 0 ? '#ffffff' : p.age < 0.5 ? '#9fd8ff' : '#4a9cf0');
      // sheets running down the face
      for (let q = 0; q < 7; q++) {
        const a = (rand(q, 5, seed) - 0.5) * reach * 1.4, top = y + uy * a - HIT - 1 - rand(q, 6, seed) * 5, phase = (t * 2.4 + rand(q, 7, seed)) % 1;
        X.line(c, x + ux * a, top, x + ux * a, lerp(top, y + uy * a, phase), q % 2 ? '#7ab8f0' : '#bfe4ff');
      }
      // and spreading out across the floor
      const ring = (t * 2 + seed * 0.13) % 1;
      X.ring(g, x, y + 1, 6 + ring * 14, (6 + ring * 14) * 0.45, '#8ccfff', 0.5 * (1 - ring));
      break;
    }
    case 'cold': {
      // frost creeping along the face: each crystal grows in its own time and stays while the spray lasts
      for (let q = 0; q < 16; q++) {
        const k = seg(t, t0 + 0.1 + rand(q, 5, seed) * 0.6, t0 + 0.5 + rand(q, 5, seed) * 0.8);
        if (k <= 0) continue;
        const a = (rand(q, 6, seed) - 0.5) * reach * 1.8, bx = x + ux * a, by = y + uy * a - rand(q, 7, seed) * 7;
        const tx = bx + (rand(q, 8, seed) - 0.5) * 6 * k, ty = by - (3 + rand(q, 9, seed) * 9) * k;
        X.line(c, bx, by, tx, ty, q % 3 ? X.FROST[2] : X.FROST[3]);
        X.px(c, tx, ty, '#ffffff');
      }
      for (const p of emit(t, 60 * power, 0.45, (i, age) => {
        const a = along(i, age);
        return { x: x + ux * a, y: y + uy * a - HIT + age * 7, age };
      }, t0, t)) X.px(c, p.x, p.y, p.age < 0.5 ? '#ffffff' : X.FROST[2]);
      break;
    }
    case 'scald':
    case 'warm': {
      const hot = kind === 'scald';
      for (const p of emit(t, (hot ? 42 : 30) * power, 0.8, (i, age) => {
        const a = along(i, Math.pow(age, 0.5));
        return { x: x + ux * a + Math.sin(age * 5 + i) * 2, y: y + uy * a - HIT - age * 24, age, i };
      }, t0, t)) {
        if (hot) K.puff(c, p.x, p.y, 2 + p.age * 5, p.i % 3 ? '#e8f0f8' : '#ffd8c0', (1 - p.age) * 0.65);
        else X.px(c, p.x, p.y, p.age < 0.5 ? X.WARM[1] : X.WARM[3]);
      }
      break;
    }
  }
}

/**
 * A beam burning against a wall or a piece of furniture: a hot spot at the contact, crackle running
 * out along the surface, sparks thrown off it. (x, y) and (ux, uy) as in wallSplash.
 */
export function beamImpact(c: Ctx, g: Ctx, x: number, y: number, ux: number, uy: number, t: number, t0: number, R: Ramp, seed: number, power = 1): void {
  if (t < t0) return;
  const cy = y - BEAM_Z, pulse = 0.85 + 0.15 * Math.sin(t * 23 + seed), reach = 18 * (0.5 + 0.5 * power);
  K.scorch(g, x, y + 1, 9 * power, 0.35 * seg(t, t0, t0 + 0.8));
  X.glow(c, x, cy, 11 * pulse * power, R[2], 0.75);
  X.glow(c, x, cy, 5 * pulse * power, R[1], 0.95);
  K.sq(c, x, cy, 3, R[0]);
  const f = Math.floor(t * 20);
  for (let q = 0; q < 4; q++) {
    const a = (q % 2 ? -1 : 1) * (6 + rand(q, f, seed) * reach * 0.7), ex = x + ux * a, ey = cy + uy * a + (rand(q, f + 1, seed) - 0.5) * 6;
    const mx = lerp(x, ex, 0.5) + (rand(q, f + 2, seed) - 0.5) * 3, my = lerp(cy, ey, 0.5) + (rand(q, f + 3, seed) - 0.5) * 4;
    X.line(c, x, cy, mx, my, R[1]); X.line(c, mx, my, ex, ey, R[2]);
  }
  for (const p of emit(t, 100 * power, 0.45, (i, age) => {
    const side = rand(i, 1, seed) < 0.5 ? -1 : 1, a = side * age * reach * (0.3 + 0.7 * rand(i, 2, seed));
    return { x: x + ux * a, y: cy + uy * a + age * (2 + rand(i, 3, seed) * 6) - age * (10 + rand(i, 4, seed) * 22) + age * age * 34, age };
  }, t0, t)) X.px(c, p.x, p.y, p.age < 0.3 ? R[0] : p.age < 0.7 ? R[1] : R[3]);
}
