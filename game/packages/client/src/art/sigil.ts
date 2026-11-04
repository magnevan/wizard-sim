/**
 * Structure drawing kit, ported from tools/spell-vfx/fx.js (sigilDevice, runeRing, seal, glyph,
 * lineGlyph, sheet, reticle, dragPath, aura) and vfx-sigil.js (the lens). Pure functions of
 * (time, seed) drawing in art pixels into a Canvas2D context; the caller picks the canvas
 * (a depth-sorted piece, or the field's ground / over canvas).
 */
import * as X from './px';
import type { Ctx, Pt, Ramp } from './px';
import { FY, TAU, lerp, mod, rand, smooth } from './util';

const EL = X.EL;
export const SV = EL.sigil;

/** Sample a polyline every `step` px of ground length. */
export function sample(pts: readonly Pt[], step = 3): Pt[] {
  const out: Pt[] = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], L = Math.hypot(b[0] - a[0], (b[1] - a[1]) / FY), n = Math.max(1, Math.round(L / step));
    for (let k = 0; k < n; k++) out.push([lerp(a[0], b[0], k / n), lerp(a[1], b[1], k / n)]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** Where the cursor is for a Place cast: four ticks closing in as the hold lands (k 0..1). */
export function reticle(c: Ctx, x: number, y: number, t: number, col: string, k = 1): void {
  if (k <= 0) return;
  const r = 6 + (1 - k) * 6;
  for (let i = 0; i < 4; i++) { const a = (i * TAU) / 4 + t * 1.5, x0 = x + Math.cos(a) * r, y0 = y + Math.sin(a) * r * FY; X.line(c, x0, y0, x0 + Math.cos(a) * 3, y0 + Math.sin(a) * 3 * FY, col); }
  X.px(c, x, y, col);
}
/** A dotted path that crawls. */
export function dragPath(c: Ctx, pts: readonly Pt[], col: string, t: number): void { for (let i = 0; i < pts.length; i++) if ((i + Math.floor(t * 12)) % 3) X.px(c, pts[i][0], pts[i][1], col); }

/** The violet seal ring under a device or an aura. */
export function seal(c: Ctx, x: number, y: number, r: number, t: number, a = 1, R: Ramp = SV): void {
  if (a <= 0.05) return;
  const rot = -t * 0.9;
  X.ring(c, x, y, r, r * FY, R[2], a);
  for (let i = 0; i < 5; i++) { const ang = rot + (i / 5) * TAU; X.px(c, x + Math.cos(ang) * (r + 2), y + Math.sin(ang) * (r + 2) * FY, R[1]); }
}

const RUNES = [[[0, -1], [0, 0], [0, 1], [1, -1]], [[-1, 0], [0, 0], [1, 0], [0, 1]], [[-1, -1], [0, 0], [1, 1], [1, -1]], [[0, -1], [-1, 1], [1, 1], [0, 0]], [[-1, -1], [-1, 0], [0, 1], [1, 1]], [[0, -1], [0, 1], [-1, 0], [1, 1]]];
/** The rune ring on the ground under a device: dim and blinking while the device waits (dry). */
export function runeRing(c: Ctx, x: number, y: number, r: number, t: number, a = 1, dry = 0, R: Ramp = SV): void {
  if (a <= 0.05) return;
  X.ring(c, x, y, r, r * FY, R[3], 0.75 * a);
  X.ring(c, x, y, r - 3, (r - 3) * FY, R[4], 0.6 * a, t * 0.7, t * 0.7 + Math.PI * 1.2);
  for (let i = 0; i < 6; i++) {
    const ang = t * 0.5 + (i / 6) * TAU, px2 = Math.round(x + Math.cos(ang) * (r - 1.5)), py2 = Math.round(y + Math.sin(ang) * (r - 1.5) * FY);
    if (a < 1 && rand(i, 9) > a) continue;
    const col = dry ? ((i + Math.floor(t * 5)) % 3 ? R[4] : R[3]) : (i + Math.floor(t * 3)) % 6 === 0 ? R[0] : R[1];
    for (const [dx, dy] of RUNES[i]) X.px(c, px2 + dx, py2 + dy, col);
  }
}

export interface DeviceOpt { R: Ramp; rise?: number; recoil?: number; charge?: number; dry?: number; feed?: number; orbZ?: number }
/**
 * The Sigil device (the turret the user called "much better"): a low carved dais with a violet
 * groove, a hovering crystal in the payload's colours above it, three runic plates orbiting it.
 * Charge pulls the plates in; recoil kicks the crystal; dry sinks it to an ember. Returns the orb.
 */
export function sigilDevice(c: Ctx, x: number, y: number, t: number, o: DeviceOpt): Pt | null {
  const R = o.R, fy = FY, rise = o.rise ?? 1, rec = o.recoil ?? 0, ch = o.charge ?? 0, dry = o.dry ?? 0, feed = o.feed ?? 0;
  if (rise <= 0.02) return null;
  x = Math.round(x); y = Math.round(y);
  const Z = (o.orbZ ?? 14) * (0.35 + 0.65 * smooth(rise));
  const drx = 5, dry2 = Math.max(2.5, drx * fy * 0.8), dh = 2;
  X.ellipse(c, x, y + 1, drx + 1, dry2 + 1, '#14101c');
  X.ellipse(c, x, y, drx, dry2, '#2e2a3a');
  X.ellipse(c, x, y - dh, drx, dry2, '#5e5a6c');
  X.ellipse(c, x - 1, y - dh - 1, drx - 2.2, dry2 - 1.4, '#77738a');
  X.ellipse(c, x, y - dh, 2.6, dry2 * 0.45, '#1c1826');
  X.ring(c, x, y - dh, 4.4, dry2 * 0.72, dry ? SV[4] : SV[3], 1);
  for (let k = 0; k < 4; k++) { const a = -t * 0.8 + (k * TAU) / 4; if (dry && (k + Math.floor(t * 6)) % 2) continue; X.px(c, x + Math.cos(a) * 4.4, y - dh + Math.sin(a) * dry2 * 0.72, dry ? SV[3] : SV[1]); }
  if (!dry) for (let z = dh + 2; z < Z - 4; z += 2) if ((z + Math.floor(t * 10)) % 4 < 2) X.px(c, x, y - z, SV[3]);
  const plates = [0, 1, 2].map((i) => {
    const a = t * 0.9 + (i * TAU) / 3, r = (9 + 3 * rec - 2 * ch) * smooth(rise), s = Math.sin(a);
    return { i, s, x: x + Math.cos(a) * r, y: y + s * r * fy, z: Z - 1 + Math.sin(t * 2.3 + i * 2.1) * 1.2 - 6 * dry };
  });
  const plate = (p: (typeof plates)[number]) => {
    const w = 0.6 + 1.6 * Math.abs(p.s), cx = Math.round(p.x), top = Math.round(p.y - p.z - 4);
    const pts = (k: number): Pt[] => [[cx + 0.5 - w + 0.5, top - 1 - k], [cx + 0.5 + w - 0.5, top - 1 - k], [cx + 0.5 + w + k, top], [cx + 0.5 + w + k, top + 5], [cx + 0.5, top + 7 + k], [cx + 0.5 - w - k, top + 5], [cx + 0.5 - w - k, top]];
    X.poly(c, pts(1), '#14101c');
    X.poly(c, pts(0), '#4e4a5c');
    if (w > 1) X.rect(c, cx - Math.floor(w), top, 1, 5, '#7e7a90');
    X.px(c, cx, top - 1, '#8a869c');
    if (p.s > -0.3) {
      const col = dry ? SV[4] : ch > 0.5 || rec > 0.5 ? SV[0] : SV[1];
      X.rect(c, cx, top + 1, 1, 3, col); X.px(c, cx, top + 5, dry ? SV[4] : SV[2]);
      if (w > 1.4) { X.px(c, cx - 1, top + 2, dry ? SV[4] : SV[2]); X.px(c, cx + 1, top + 2, dry ? SV[4] : SV[2]); }
    }
  };
  for (const p of plates) if (p.s < 0) plate(p);
  const bob = Math.round(Math.sin(t * 3)), cy = Math.round(y - Z + bob + dry * 2 - rec * 2);
  const hw = 3.6 + rec * 1.2 - ch * 0.6, hu = 7 + ch * 1.5 - rec * 1.5, hd = 5;
  const C = dry ? { lt: R[4] ?? R[3], mid: R[5] ?? R[4] ?? R[3], dk: '#2a0a18', core: rand(Math.floor(t * 12), 5) < 0.5 ? R[3] : R[4] ?? R[3], edge: SV[4] }
    : { lt: R[1], mid: R[2], dk: R[3], core: ch > 0.5 || rec > 0.4 || feed > 0.5 ? '#ffffff' : R[0], edge: SV[3] };
  if (!dry) X.ring(c, x, cy + 1, 7, 2, SV[3], 1, Math.PI, TAU);
  X.poly(c, [[x + 0.5, cy - hu - 1], [x + 1.5 + hw, cy + 0.5], [x + 0.5, cy + hd + 2], [x - 0.5 - hw, cy + 0.5]], C.edge);
  X.poly(c, [[x + 0.5, cy - hu], [x + 0.5, cy + 0.5], [x + 0.5 - hw, cy + 0.5]], C.lt);
  X.poly(c, [[x + 0.5, cy - hu], [x + 0.5 + hw, cy + 0.5], [x + 0.5, cy + 0.5]], C.mid);
  X.poly(c, [[x + 0.5 - hw, cy + 0.5], [x + 0.5, cy + 0.5], [x + 0.5, cy + hd + 1]], C.mid);
  X.poly(c, [[x + 0.5, cy + 0.5], [x + 0.5 + hw, cy + 0.5], [x + 0.5, cy + hd + 1]], C.dk);
  X.rect(c, x, cy - 2, 1, 3, C.core); if (!dry) X.px(c, x - 1, cy - 1, R[0]);
  if (!dry) X.px(c, x - 1, cy - hu + 2, '#ffffff');
  if (!dry) for (let k = 0; k <= 12; k++) { const a = (k / 12) * Math.PI, q = (k + Math.floor(t * 8)) % 4; if (q === 3) continue; X.px(c, x + Math.cos(a) * 7, cy + 1 + Math.sin(a) * 2, q === 0 ? SV[1] : SV[2]); }
  for (const p of plates) if (p.s >= 0) plate(p);
  return [x, cy];
}

/** A glyph on the ground. draw 0..1 writes it in; armed pulses; inner = an element icon. */
export function glyph(c: Ctx, x: number, y: number, r: number, R: Ramp, t: number, draw: number, armed: boolean, inner?: string, innerCol?: string): void {
  const reach = draw * TAU, rot = t * 0.5, pulse = 0.65 + 0.3 * Math.sin(t * 5);
  X.ring(c, x, y, r, r * FY, R[2], armed ? Math.min(1, pulse + 0.25) : 0.75, rot, rot + reach);
  X.ring(c, x, y, r * 0.62, r * 0.62 * FY, R[3], armed ? pulse : 0.6, -rot, -rot + reach * 0.999);
  for (let i = 0; i < 6; i++) { const a = rot + (i / 6) * TAU; if (a - rot > reach) continue; const px2 = x + Math.cos(a) * r * 0.82, py2 = y + Math.sin(a) * r * 0.82 * FY; X.rect(c, px2 - 0.5, py2 - 0.5, 2, 1, R[1]); }
  if (draw > 0.9 && inner) X.icon(c, inner, x - 3, y - 3, armed ? innerCol ?? R[1] : R[3]);
  else if (draw > 0.9) { X.px(c, x, y - 1, R[1]); X.px(c, x - 1, y, R[2]); X.px(c, x + 1, y, R[2]); X.px(c, x, y + 1, R[2]); }
}
/** A glyph written along a line: a double rail with rune ticks. */
export function lineGlyph(c: Ctx, pts: readonly Pt[], R: Ramp, t: number, draw: number, armed: boolean, El?: Ramp): void {
  const P = sample(pts, 2), n = Math.floor((P.length - 1) * draw), pulse = 0.6 + 0.3 * Math.sin(t * 5);
  for (let i = 0; i <= n; i++) {
    const p = P[i], q = P[Math.min(P.length - 1, i + 1)], gx = q[0] - p[0], gy = (q[1] - p[1]) / FY, gl = Math.hypot(gx, gy) || 1, nx = (-gy / gl) * 2.5, ny = (gx / gl) * 2.5 * FY;
    // the rails: dim while it is being written in, bright and pulsing once armed
    const rc = armed ? (pulse > X.bay(Math.round(p[0]), Math.round(p[1])) ? R[1] : R[2]) : R[3];
    X.px(c, p[0] + nx, p[1] + ny, rc); X.px(c, p[0] - nx, p[1] - ny, rc);
    if (i % 4 === 0) { X.px(c, p[0], p[1], armed && El ? El[1] : R[1]); X.px(c, p[0] + nx * 0.5, p[1] + ny * 0.5 - 1, R[3]); }
  }
  if (armed && El) { const k = Math.floor(mod(t * 20, P.length)); for (let j = 0; j < 3; j++) { const p = P[(k + j * 7) % P.length]; X.px(c, p[0], p[1] - 1, El[0]); } }
}

/** The lens: a ringed violet lens hovering on its seal, a refraction shimmer sliding across it. pass 0..1 flares it. */
export function lens(c: Ctx, x0: number, y: number, t: number, up: number, pass = 0): void {
  const zL = 18, rx = (5 + pass * 1.5) * up, ry = (12 + pass * 1.5) * up, cy = y - zL - Math.sin(t * 3);
  if (up < 0.05) return;
  X.ellipse(c, x0, cy, rx - 1, ry - 1, '#e8c0ff', 0.16 + 0.5 * pass);
  for (let s = 0; s < 2; s++) {
    const off = mod(t * 0.8 + s * 0.5, 1) * 2.4 - 1.2;
    for (let yy = -ry + 1; yy < ry; yy++) { const x = x0 + off * rx - (yy / ry) * 2; if (((x - x0) / (rx - 0.5)) ** 2 + (yy / (ry - 0.5)) ** 2 < 0.85) X.px(c, x, cy + yy, s ? SV[0] : '#ffffff'); }
  }
  X.ring(c, x0, cy, rx + 2, ry + 2, SV[3], 0.7);
  X.ring(c, x0, cy, rx + 1, ry + 1, SV[2], 1);
  X.ring(c, x0, cy, rx, ry, pass > 0.3 ? '#ffffff' : SV[1], 1);
  X.ring(c, x0, cy, rx * 0.55, ry * 0.72, SV[2], 0.55);
  X.ring(c, x0, cy, rx, ry, '#ffffff', 1, 3.5, 4.5);
  for (let k = 0; k < 4; k++) { const a = t * 1.6 + (k * Math.PI) / 2; X.px(c, x0 + Math.cos(a) * (rx + 3.5), cy + Math.sin(a) * (ry + 3.5), k % 2 ? SV[1] : SV[0]); }
}

/** Aura motes: a slow ring on the ground plus element motes rising round the wearer. */
export function auraMotes(g: Ctx, o: Ctx, x: number, y: number, t: number, R: Ramp, r: number, k: number, n = 10, spin = 1.4, riseRate = 8, ring = true): void {
  if (k < 0.05) return;
  if (ring) { X.ring(g, x, y, r, r * FY, R[2], 0.7 * k); X.ring(g, x, y, r - 3, (r - 3) * FY, R[3], 0.35 * k); }
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + t * spin, rr = r - 1 + Math.sin(t * 3 + i) * 1.5, h = mod(t * riseRate + i * 3.7, 14);
    if (rand(i, Math.floor(t * 8)) > k) continue;
    const px2 = x + Math.cos(a) * rr, py2 = y + Math.sin(a) * rr * FY - h;
    X.px(Math.sin(a) < 0 ? g : o, px2, py2, h < 7 ? R[1] : R[2]);
  }
}

/**
 * An energy sheet segment (the barrier): translucent fill, a bright base and crest, scan bands
 * climbing it, columns dropping out and the crest stuttering as kS (its owner's Shield) runs low.
 * cols: ground points along the segment (1 px apart); f0/f1 their fraction for the scatter.
 */
export function sheetCols(c: Ctx, cols: readonly Pt[], h: number, t: number, kS: number, R: Ramp, rgb: string, seed: number, hit = -1): void {
  const weak = 1 - kS, fl = Math.floor(t * 14), n = cols.length;
  if (n < 2) return;
  const hh = (j: number) => h * (0.62 + 0.38 * kS) + Math.sin(j * 0.19 + seed + t * 6) * 0.9 + Math.sin(j * 0.5 - t * 9 + seed) * (0.5 + weak * 1.5);
  const top: Pt[] = [], base: Pt[] = [];
  for (let j = 0; j < n; j++) { top.push([cols[j][0], cols[j][1] - hh(j)]); base.push([cols[n - 1 - j][0], cols[n - 1 - j][1] + 0.5]); }
  X.poly(c, top.concat(base), `rgba(${rgb},${(0.06 + 0.16 * kS).toFixed(2)})`);
  const low: Pt[] = cols.map((q, j) => [q[0], q[1] - hh(j) * 0.45]);
  X.poly(c, low.concat(base), `rgba(${rgb},${(0.05 + 0.12 * kS).toFixed(2)})`);
  c._fs = null;
  for (let j = 0; j < n; j++) {
    const x = Math.round(cols[j][0]), y0 = Math.round(cols[j][1]), H = Math.round(hh(j)), qi = seed * 31 + j;
    const gone = weak > 0.1 && rand(qi, fl, 19) < weak * 0.5;
    if (!(weak > 0.55 && x & 1)) X.px(c, x, y0, R[1]);
    if (gone) continue;
    const crest = rand(qi, fl) < 0.8 - weak * 0.35;
    X.px(c, x, y0 - H, crest ? (kS > 0.5 ? R[0] : R[1]) : R[2]);
    if (kS > 0.55) X.px(c, x, y0 - H + 1, R[kS > 0.8 ? 1 : 2]);
    for (let z = 2; z < H - 1; z++) {
      const zt = z - t * 14, bnd = mod(zt, 5);
      if (bnd < 1 && rand(Math.floor(qi / 6), Math.floor(zt / 5) & 63, 3) < 0.65 * (0.35 + 0.65 * kS)) X.px(c, x, y0 - z, z > H * 0.6 ? R[1] : R[2]);
      else if (z === 2 && x & 1) X.px(c, x, y0 - z, R[2]);
    }
    if (kS > 0.6 && qi % 9 === 0) for (let z = 2; z < H - 1; z += 2) X.px(c, x, y0 - z, R[2]);
    if (hit >= 0 && hit < 0.6) {
      const dx = j - n / 2;
      for (let z = 1; z < H; z++) { const dd = Math.hypot(dx, z - 8), r = hit * 26; if (Math.abs(dd - r) < 0.9) X.px(c, x, y0 - z, hit < 0.25 ? '#ffffff' : R[1]); else if (dd < 3 && hit < 0.1) X.px(c, x, y0 - z, '#ffffff'); }
    }
  }
}

/** A rune mote flowing from a to b: e = 0..1 along a little arc. */
export function mote(c: Ctx, a: Pt, b: Pt, e: number, R: Ramp, lift = 10): void {
  if (e <= 0 || e >= 1) return;
  const P = (k: number): Pt => [lerp(a[0], b[0], smooth(k)), lerp(a[1], b[1], smooth(k)) - Math.sin(k * Math.PI) * lift];
  for (let j = 1; j <= 3; j++) { const q = P(Math.max(0, e - j * 0.06)); X.px(c, q[0], q[1], R[Math.min(R.length - 1, 1 + j)]); }
  const p = P(e); X.glow(c, p[0], p[1], 4, R[2], 0.7); X.rect(c, p[0] - 1, p[1] - 1, 2, 2, R[1]); X.px(c, p[0], p[1], '#ffffff');
}
