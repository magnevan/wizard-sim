/**
 * Enemy attacks, drawn (docs/explorations/2026-11-06-enemy-attacks.md). Every enemy's attack reads in
 * four beats: a telegraph pose held for the whole wind-up, a strike frame with a smear, an impact or
 * a release, and a recovery back to rest.
 *
 * Everything here is a pure function of the sim's own attack state, which it already keeps per body:
 * ai (approach / windup / cooldown / dash / grab) and aiT (ticks in that state). The blow lands on the
 * tick a body leaves its wind-up, and the cooldown's aiT counts up from that tick, so "time since the
 * strike" is aiT in cooldown. Nothing is remembered between frames, so a rollback that rewrites the
 * past redraws the right pose, and no sim state was added (the golden hash is untouched).
 *
 * attackK() gives the rig its pose (RigState.atk / smash / draw / hold, art/rigs.ts); drawAttackFx()
 * draws the smears, sparks, flame, dust and the grab's hold timer into the field canvases.
 */
import { AI, ARCH, ARCHETYPES, MAX_SEATS, KIND, type World } from '@wizard-sim/sim';
import * as K from './kit';
import * as X from './px';
import type { Ctx } from './px';
import { CU, FY, TAU, clamp, easeOut, lerp, rand } from './util';
import type { BodyView, LightFn } from './vfx';

/** Per archetype, seconds: how long the strike pose is held, then how long the recovery takes. */
const BEATS: Record<number, { hold: number; rec: number }> = {
  [ARCH.swarmer]: { hold: 0.1, rec: 0.3 },
  [ARCH.brute]: { hold: 0.3, rec: 0.6 },
  [ARCH.shieldbearer]: { hold: 0.12, rec: 0.4 },
  [ARCH.caster]: { hold: 0, rec: 0.36 },
  [ARCH.grabber]: { hold: 0.15, rec: 0.5 },
  [ARCH.imp]: { hold: 0.15, rec: 0.3 },
};

/** Seconds since body i struck (its cooldown began), or -1 outside the cooldown. alpha: the frame's interpolation. */
export function sinceStrike(w: World, i: number, alpha = 0): number {
  return w.bodies.ai[i] === AI.cooldown ? (w.bodies.aiT[i] + alpha) / 60 : -1;
}

/**
 * Body i's attack pose for the rig, quantized so the frame cache stays small:
 * -1 none; 0..0.5 the wind-up; 0.55 the blow mid-swing (one tick); 0.6 the strike held; 0.6..1 the recovery.
 * The grabber's dash is the strike pose (0.6): arms thrown forward.
 */
export function attackK(w: World, i: number): number {
  const b = w.bodies, arch = b.arch[i], A = ARCHETYPES[arch], ai = b.ai[i];
  if (ai === AI.windup) return (Math.round(Math.min(1, b.aiT[i] / Math.max(1, A.windup * 60)) * 8) / 8) * 0.5;
  if (ai === AI.dash) return 0.6;
  if (ai !== AI.cooldown) return -1;
  const B = BEATS[arch] ?? { hold: 0.1, rec: 0.3 }, age = b.aiT[i] / 60;
  if (age < 1 / 60 && arch !== ARCH.caster) return 0.55;
  if (age < B.hold) return 0.6;
  const q = (age - B.hold) / B.rec;
  return q >= 1 ? -1 : 0.6 + Math.round(q * 8) / 20;
}

/** A body's local frame on screen: forward f, right r, up u (rig units, the rig's own projection) -> field px. */
function frameAt(v: BodyView, faceTurns: number): (f: number, r: number, u: number) => [number, number] {
  const a = (Math.round(faceTurns * 16) / 16) * TAU, cs = Math.cos(a), sn = Math.sin(a);
  return (f, r, u) => [v.x + f * cs - r * sn, v.y + (f * sn + r * cs) * FY - u * CU];
}

/**
 * Draws every enemy's attack effects into the ground (g) and over (o) canvases. t is sim time with
 * interpolation, ct real time (cosmetic flicker). Returns the screen shake it asks for (art px).
 */
export function drawAttackFx(w: World, bodies: BodyView[], g: Ctx, o: Ctx, light: LightFn, alpha: number, ct: number): number {
  const b = w.bodies;
  let shake = 0;
  for (let i = MAX_SEATS; i < b.kind.length; i++) {
    if (b.kind[i] !== KIND.enemy) continue;
    const v = bodies[i];
    if (!v?.on) continue;
    const arch = b.arch[i], ai = b.ai[i], A = ARCHETYPES[arch];
    const at = frameAt(v, b.face[i]), sd = i * 7 + 3;
    const age = sinceStrike(w, i, alpha);
    const fwd = at(1, 0, 0), dirX = fwd[0] - v.x, dirY = fwd[1] - v.y;
    switch (arch) {
      case ARCH.swarmer: {
        if (age < 0 || age > 0.14) break;
        const variant = i % 3, e = age / 0.14;
        if (variant === 0) smearArc(o, at, [0, 3.2, 8.5], 9, 1.9, -0.35, e, '#ffffff', '#e4e8f0', 3); // the club comes down
        else thrust(o, at, variant === 1 ? 4 : 1, variant === 1 ? 11 : 17, variant === 1 ? 6.6 : 7, e);
        if (age < 0.07) star(o, at(variant === 0 ? 9 : variant === 1 ? 11 : 17, 1, variant === 0 ? 3 : 6.5), 3, '#ffffff');
        break;
      }
      case ARCH.shieldbearer: {
        if (age < 0 || age > 0.3) break;
        // the bash: a shock crescent off the shield's face, a flash on the boss, dust kicked from the feet
        const e = age / 0.3, c = at(8.5 + e * 5, 0, 6.5);
        if (age < 0.16) {
          for (let k = -4; k <= 4; k++) {
            const p = at(8 + e * 6 - (k * k) * 0.18, k * 1.5, 6.5 + (k % 2) * 0.5);
            X.px(o, p[0], p[1], Math.abs(k) < 2 ? '#ffffff' : '#e4e8f0');
          }
          star(o, at(6.5, 0, 7), 3, '#ffffff');
          light(c[0], c[1], 22, '#fff6d0', 0.5 * (1 - e));
        }
        for (const side of [-1, 1]) { const f = at(-1, side * 2.4, 0); K.dust(g, f[0], f[1], age, sd + side, 3, 9, '#7a6a5a', 0.45); }
        break;
      }
      case ARCH.imp: {
        const mouth = at(4.2, 0, 9.9);
        // no wind-up glow: its reach is short, so the spit is the warning (the user, 2026-11-06)
        if (age >= 0 && age < 0.3) {
          // the spit: a short gout of flame out of its mouth, to the end of its reach
          const e = age / 0.3, len = (A.reach + b.r[i] + 0.5) * 16 * 0.9;
          for (let k = 0; k < 26; k++) {
            const q = rand(k, sd, 5), d = len * (0.15 + 0.85 * q) * (0.6 + 0.4 * easeOut(Math.min(1, e * 2)));
            const p = at(4 + d, (rand(k, sd, 6) - 0.5) * (2 + d * 0.45), 9.5 - d * 0.25 + (rand(k, sd, 7) - 0.5) * 3);
            const life = clamp(e + q * 0.3, 0, 1);
            if (life < 0.95) K.sq(o, p[0], p[1], q < 0.3 && e < 0.5 ? 2 : 1, K.fireCol(life));
          }
          light(mouth[0] + dirX * 8, mouth[1] + dirY * 8, 30, '#ff8a30', 0.7 * (1 - e));
        }
        break;
      }
      case ARCH.caster: {
        const tip = at(8, -0.8, 9);
        // no aim glint: the bolt's flight is the warning (the user, 2026-11-06)
        if (age >= 0 && age < 0.12) {
          // the release: a puff of sparks off the bow
          const e = age / 0.12;
          for (let k = 0; k < 6; k++) { const a2 = (k / 6) * TAU + rand(k, sd) * 0.5, d = 2 + e * 5; X.px(o, tip[0] + Math.cos(a2) * d, tip[1] + Math.sin(a2) * d * 0.7, k % 2 ? '#ffc0e0' : '#ffffff'); }
          light(tip[0], tip[1], 18, '#ff6ab0', 0.6 * (1 - e));
        }
        break;
      }
      case ARCH.grabber: {
        if (ai === AI.dash) {
          // the lunge: speed lines trailing it and dust off its feet
          for (let k = 0; k < 4; k++) {
            const r = (k - 1.5) * 2.4, u = 3 + rand(k, sd) * 8, p0 = at(-3, r, u), p1 = at(-10 - rand(k, sd, 2) * 6, r, u);
            X.line(o, p0[0], p0[1], p1[0], p1[1], k % 2 ? '#e4e8f0' : '#b8c0d0');
          }
          const f = at(-2, 0, 0); K.dust(g, f[0], f[1], (b.aiT[i] + alpha) / 60, sd, 4, 10, '#7a6a5a', 0.5);
        }
        const t = b.holding[i];
        if (ai === AI.grab && t >= 0 && bodies[t]?.on) {
          const vt = bodies[t], g2 = A.grab!, held = (b.aiT[i] + alpha) / 60, left = clamp(1 - held / g2.hold, 0, 1);
          // the catch: a flash where the claws closed
          if (held < 0.15) star(o, [vt.x, vt.y - 9], 4, '#ffffff');
          // the hold timer: a ring round the held wizard that closes in as the throw comes (red at the end)
          const col = left < 0.25 ? (Math.floor(ct * 12) % 2 ? '#ff4f4f' : '#ffd36b') : left < 0.5 ? '#ffd36b' : '#4fe0d6';
          X.ring(g, vt.x, vt.y, 6 + 9 * left, (6 + 9 * left) * FY, col, 0.9, 0, TAU * left);
          X.ring(g, vt.x, vt.y, 6 + 9 * left, (6 + 9 * left) * FY, '#1a2a2a', 0.5, TAU * left, TAU);
        }
        break;
      }
      case ARCH.brute: {
        if (age < 0) break;
        // the fists come down in one heavy arc
        if (age < 0.1) for (const r of [-3.6, 3.6]) smearArc(o, at, [1.6, r, 17], 15, 1.75, -0.2, age / 0.1, '#ffffff', '#b2a4cc', 2);
        // the shockwave (sim: enemies.ts slamWave) rolls from the fists through the locked circle, so the
        // impact lands at the circle's centre when the front gets there, not when the fists hit
        const toPx = (x: number, y: number): [number, number] => [v.x + (x - b.x[i]) * 16, v.y + (y - b.y[i]) * 16 * FY];
        const [ox, oy] = toPx(b.slamX[i], b.slamY[i]), [lx, ly] = toPx(b.lockX[i], b.lockY[i]);
        const R = A.slamRadius!, dc = Math.hypot(b.lockX[i] - b.slamX[i], b.lockY[i] - b.slamY[i]), front = age * A.slamSpeed!;
        if (age < 0.12) { star(o, [Math.round(ox), Math.round(oy) - 1], 3, '#ffffff'); light(ox, oy, 20, '#fff6d0', 0.5 * (1 - age / 0.12)); }
        if (front < dc + R) {
          // the front: an arc round the fists, only where it crosses the circle, kicking up grit
          const an = Math.atan2(b.lockY[i] - b.slamY[i], b.lockX[i] - b.slamX[i]);
          for (let k = -24; k <= 24; k++) {
            const t2 = an + k * 0.045, wx = b.slamX[i] + Math.cos(t2) * front, wy = b.slamY[i] + Math.sin(t2) * front;
            if (Math.hypot(wx - b.lockX[i], wy - b.lockY[i]) > R) continue;
            const [px, py] = toPx(wx, wy);
            X.px(g, px, py, k % 3 ? '#fff6d0' : '#ffffff');
            X.px(g, px - Math.cos(t2) * 2, py - Math.sin(t2) * 2 * FY, '#8a7a68');
            if (rand(k, sd, Math.floor(front * 4)) < 0.25) X.px(o, px, py - 2 - rand(k, sd, 3) * 3, '#b8946a');
          }
        }
        // the ground cracks from the fists out to the centre as the front passes
        const ia = age - dc / A.slamSpeed!;
        if (age < 1.4) {
          const run = Math.min(1, front / Math.max(0.1, dc)), n = 7;
          let px0 = ox, py0 = oy;
          for (let k = 1; k <= n * run; k++) {
            const q = k / n, j = k === n ? 0 : (rand(k, sd, 9) - 0.5) * 5;
            const nx = lerp(ox, lx, q) - dirY * j, ny = lerp(oy, ly, q) + dirX * j * FY;
            X.line(g, px0, py0, nx, ny, age < 0.9 ? '#1a120c' : '#33241a', k < 3 ? 2 : 1); px0 = nx; py0 = ny;
          }
        }
        if (ia >= 0) {
          // the impact at the centre: a flash, chunks of floor thrown up, a short shake
          if (ia < 0.15) { const q = ia / 0.15; K.gring(o, lx, ly - 1, 4 + q * 20, q < 0.4 ? '#ffffff' : '#fff6d0', 1, 2); if (q < 0.5) star(o, [lx, ly - 2], 5, '#ffffff'); light(lx, ly, 44, '#fff6d0', 0.8 * (1 - q)); }
          if (ia < 1.2) K.debris(o, lx, ly, ia, sd, 12, 34, ['#977552', '#553e2a', '#b8946a'], 46);
          if (ia < 0.9) K.dust(g, lx, ly - 2, ia, sd + 1, 10, 26, '#8a7a68', 0.9);
          if (ia < 0.25) shake = Math.max(shake, 2.5 * (1 - ia / 0.25));
        }
        break;
      }
      default:
    }
  }
  return shake;
}

/**
 * A swing's smear: an arc in the body's forward-up plane round a pivot (f, r, u), from angle a0 to a1
 * (radians; 0 = straight ahead, PI/2 = straight up), radius R. e (0..1) is how far the smear has faded:
 * it shrinks toward its leading end and dithers away. hot is the leading edge's colour, cool the tail's.
 */
function smearArc(c: Ctx, at: (f: number, r: number, u: number) => [number, number], pv: [number, number, number], R: number, a0: number, a1: number, e: number, hot: string, cool: string, thick = 2): void {
  const n = 18, from = lerp(0, 0.7, e);
  for (let k = 0; k <= n; k++) {
    const q = k / n;
    if (q < from) continue;
    const an = lerp(a0, a1, q), lead = q > 0.75;
    for (let j = 0; j < thick; j++) {
      const rr = R - j * 1.1, p = at(pv[0] + Math.cos(an) * rr, pv[1], pv[2] + Math.sin(an) * rr);
      if ((1 - e) * (0.4 + q) > X.bay(Math.round(p[0]), Math.round(p[1])) || lead) X.px(c, p[0], p[1], lead || j === 0 ? hot : cool);
    }
  }
}

/** A thrust's streak: lines along the facing from f0 to f1 at height u, thinning as e runs to 1. */
function thrust(c: Ctx, at: (f: number, r: number, u: number) => [number, number], f0: number, f1: number, u: number, e: number): void {
  const a = at(lerp(f0, f1, e * 0.6), 1, u), z = at(f1 + 2, 1, u);
  X.line(c, a[0], a[1], z[0], z[1], '#ffffff');
  if (e < 0.6) for (const du of [-1.6, 1.6]) { const p = at(lerp(f0, f1, 0.3 + e), 1, u + du), q = at(f1, 1, u + du * 0.5); X.line(c, p[0], p[1], q[0], q[1], '#c8ccd8'); }
}

/** A small four-point hit star. */
function star(c: Ctx, p: [number, number], r: number, col: string): void {
  X.px(c, p[0], p[1], col);
  for (let k = 1; k <= r; k++) { X.px(c, p[0] + k, p[1], col); X.px(c, p[0] - k, p[1], col); if (k < r) { X.px(c, p[0], p[1] + k, col); X.px(c, p[0], p[1] - k, col); } }
}
