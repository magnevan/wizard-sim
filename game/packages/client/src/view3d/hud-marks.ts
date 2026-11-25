/**
 * The HUD's marks attached to the world in the 3D view, drawn in HUD px (whole art pixels, the pixel game's look) at
 * where each body's point projects: the health bar over a hurt body, with the burn it will still take and its chill
 * strip (art/vfx.ts bars), the damage and heal numbers that rise off a body (art/vfx.ts 'pop'), and Survive's rally ring
 * round a downed wizard with its progress and RALLY over them (view-structures.ts rallies). The ring lies on the ground,
 * as an ellipse fitted to the projected circle; it isn't hidden by what stands in front of it.
 */
import { ARCH, KIND, MAX_BODIES, MAX_SEATS, PERKS, STATUS, T, type World } from '@wizard-sim/sim';
import * as X from '../art/px';
import { clamp, easeOut, rand } from '../art/util';

/** What the marks need from the view: a body's drawn spot (sim u), and a sim point at a height over the ground -> HUD px. */
export interface MarkView {
  at(i: number): [number, number];
  /** Sim (x, y) at `h` u over the ground there -> HUD px (NaN when it is behind the camera). */
  toHud(x: number, y: number, h: number): { x: number; y: number };
}

/** A body's drawn height (u, to the top of its head or hat): the models' (view3d/bodies.ts: the wizard 2.7, a goblin 2.1). */
export function bodyHeight(w: World, i: number): number {
  const k = w.bodies.kind[i];
  if (k === KIND.wizard || k === KIND.double) return 2.7;
  if (k === KIND.dummy) return 2.4;
  const a = w.bodies.arch[i];
  return a === ARCH.brute ? 3.4 : a === ARCH.bramble ? 1.6 : 1.8;
}

/** One rising number: who it's on, where it was hit, its amount (or text), whether it's a heal, when it started. */
interface Pop { who: number; x: number; y: number; n: number; heal: boolean; text?: string; t0: number; seed: number; hx: number; hy: number; placed: boolean }
const POP_LIFE = 0.9;

export class HudMarks {
  private pops: Pop[] = [];

  /** A sim event (t: sim seconds): hits and heals become numbers. */
  onEvent(kind: string, who: number, x: number, y: number, amount: number | undefined, text: string | undefined, tick: number, t: number): void {
    if ((kind !== 'hit' && kind !== 'heal') || who < 0) return;
    const amt = Math.round(amount ?? 0), heal = kind === 'heal';
    // a body taking hit after hit (a beam, a spray) shows one number that keeps counting up
    const open = !text && this.pops.find((p) => p.who === who && p.heal === heal && !p.text && t - p.t0 < 0.45);
    if (open) { open.n += amt; open.t0 = t; return; }
    if (amt > 0 || text) this.pops.push({ who, x, y, n: amt, heal, text, t0: t, seed: tick * 13 + (who + 2) * 101 + Math.round(x * 7), hx: 0, hy: 0, placed: false });
  }

  /** The room changed (its clock started over): forget what was showing. */
  reset(): void { this.pops.length = 0; }

  draw(c: X.Ctx, w: World, v: MarkView, t: number, ct: number): void {
    if (w.run) this.rallies(c, w, v, ct);
    this.bars(c, w, v);
    this.drawPops(c, w, v, t);
  }

  /** The health bar over each hurt (or burning, or chilled) body: as the pixel view's, 12 px wide (a brute's 18). */
  private bars(c: X.Ctx, w: World, v: MarkView): void {
    const b = w.bodies;
    for (let i = 0; i < MAX_BODIES; i++) {
      if (!b.kind[i] || b.downed[i]) continue;
      const chill = b.chill[i], burning = b.burn[i] > 0 ? b.burnPool[i] : 0;
      if (b.hp[i] >= b.maxHp[i] && chill <= 0.02 && burning <= 0) continue;
      const [sx, sy] = v.at(i), p = v.toHud(sx, sy, bodyHeight(w, i));
      if (Number.isNaN(p.x)) continue;
      const f = Math.max(0, b.hp[i] / b.maxHp[i]), wd = b.arch[i] === ARCH.brute && b.kind[i] === KIND.enemy ? 18 : 12, cold = chill > 0.02;
      const x = Math.round(p.x - wd / 2), y = Math.round(p.y) - 7;
      X.rect(c, x - 1, y - 1, wd + 2, cold ? 5 : 4, '#120e1a'); X.rect(c, x, y, wd, 2, '#3a1420');
      const fill = Math.max(1, Math.round(wd * f));
      X.rect(c, x, y, fill, 2, b.team[i] === 1 ? (f > 0.5 ? '#5fe07a' : f > 0.25 ? '#e6c84a' : '#e05a5a') : '#e05a5a');
      // the health this burn will still take, if nothing puts it out
      if (burning > 0) { const left = Math.round(wd * Math.max(0, b.hp[i] - burning) / b.maxHp[i]); if (left < fill) X.rect(c, x + left, y, fill - left, 2, '#ff9a2a'); }
      // the frost pool, a 1 px strip that brightens once there's enough for Water to freeze
      if (cold) { X.rect(c, x, y + 2, wd, 1, '#1c2c44'); X.rect(c, x, y + 2, Math.max(1, Math.round(wd * chill)), 1, chill >= STATUS.freezeMin ? X.FROST[1] : X.FROST[3]); }
    }
  }

  /** Small damage and heal numbers: rise a few pixels over the head and fade (dithered), following the body while it lives. */
  private drawPops(c: X.Ctx, w: World, v: MarkView, t: number): void {
    const b = w.bodies;
    for (let k = this.pops.length - 1; k >= 0; k--) {
      const f = this.pops[k], e = t - f.t0;
      if (e > POP_LIFE || e < -0.1) { this.pops.splice(k, 1); continue; }
      if (b.kind[f.who]) { const [x, y] = v.at(f.who); f.hx = x; f.hy = y; f.placed = true; }
      const p = f.placed ? v.toHud(f.hx, f.hy, bodyHeight(w, f.who)) : v.toHud(f.x, f.y, 2);
      if (Number.isNaN(p.x)) continue;
      const q = Math.max(0, e) / POP_LIFE, px2 = p.x + (rand(f.seed, 1) - 0.5) * 8, py2 = p.y - 14 - easeOut(Math.min(1, q * 1.6)) * 8;
      if (q > 0.7 && X.bay(Math.round(px2), Math.round(py2 + e * 60)) < (q - 0.7) / 0.3) continue;
      const str = f.text ? f.text : (f.heal ? '+' : '') + f.n;
      const col = f.text ? '#ffd36b' : f.heal ? X.LIFE[1] : f.n >= 20 ? '#ffd860' : '#f4f0f8';
      X.text(c, str, Math.round(px2 - str.length * 2), Math.round(py2), col, '#120e1a');
    }
  }

  /**
   * Survive's Rally: a downed wizard lies in a faint dashed green ring the size of the rally range; while someone rallies
   * them a ring outside the body fills clockwise in the rescuer's colour, and RALLY floats over them.
   */
  private rallies(c: X.Ctx, w: World, v: MarkView, ct: number): void {
    const r = w.run!, b = w.bodies, TAU = Math.PI * 2;
    for (let d = 0; d < MAX_SEATS; d++) {
      if (b.kind[d] !== KIND.wizard || !b.downed[d]) continue;
      const [sx, sy] = v.at(d), o = v.toHud(sx, sy, 0);
      if (Number.isNaN(o.x)) continue;
      /** The ground circle of radius R u round the body, as a screen ellipse. */
      const radii = (R: number): [number, number] => {
        const e = v.toHud(sx + R, sy, 0), n = v.toHud(sx, sy - R, 0), s = v.toHud(sx, sy + R, 0);
        return [Math.abs(e.x - o.x), Math.abs(s.y - n.y) / 2];
      };
      const p = 0.5 + 0.5 * Math.sin(ct * 3), [R0x, R0y] = radii(PERKS.rallyRange);
      for (let k = 0; k < 16; k++) { const a0 = (k / 16) * TAU + ct * 0.4; X.ring(c, o.x, o.y, R0x, R0y, X.LIFE[2], 0.35 + 0.15 * p, a0, a0 + TAU / 32); }
      const by = r.rallyBy[d], f = clamp(r.rally[d] / T(PERKS.rallyTime), 0, 1);
      if (by < 0 || f <= 0) continue;
      const team = X.TEAMS[by % 4], [rx, ry] = radii(b.r[d] + 0.75), k = ry / Math.max(1, rx), a0 = -Math.PI / 2, a1 = a0 + f * TAU;
      X.ellipse(c, o.x, o.y, rx, ry, X.LIFE[3], 0.15 + 0.2 * f);
      for (let j = -1; j <= 1; j++) X.ring(c, o.x, o.y, rx + j, (rx + j) * k, '#1a1726', 0.7);
      X.ring(c, o.x, o.y, rx - 1, (rx - 1) * k, X.LIFE[1], 0.9, a0, a1);
      X.ring(c, o.x, o.y, rx, rx * k, team.light, 1, a0, a1);
      X.ring(c, o.x, o.y, rx + 1, (rx + 1) * k, team.main, 1, a0, a1);
      X.rect(c, o.x + Math.cos(a1) * rx - 1, o.y + Math.sin(a1) * ry - 1, 3, 3, '#ffffff');
      const label = 'RALLY', tw = label.length * 4 - 1, top = v.toHud(sx, sy, 1.2);
      X.text(c, label, Math.round(o.x - Math.floor(tw / 2)), Math.round(top.y) - 10 - Math.round(p), team.light, '#0a0810');
    }
  }
}
