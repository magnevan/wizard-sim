/**
 * Off-screen threats, for an arena the camera pans over: a small pixel arrow on the edge of the
 * view for enemies outside it (red; bigger for a pack), and a pulsing violet diamond for each
 * open portal, pointing the way. Enemies close together share one mark, so a wave coming in reads
 * as a few marks, not a fringe of them. Drawn in the HUD layer (it doesn't zoom), in whole pixels.
 */
import { Graphics } from 'pixi.js';
import { KIND, MAX_PORTALS, MAX_SEATS, PHASE_ENC, type World } from '@wizard-sim/sim';
import type { Camera } from './camera';

const ENEMY = 0xff5a46, ENEMY_HOT = 0xffc0a0, PORTAL = 0xc77dff, PORTAL_HOT = 0xf0d8ff, EDGE = 0x120e1a;
/** Inset from the edge of the play area, HUD px. */
const INSET = 6;
/** Marks closer than this along the edge merge, HUD px. */
const BUCKET = 12;

export class EdgeMarks {
  readonly g = new Graphics();
  private px: [number, number][] = [];
  private ex: [number, number][] = [];

  draw(w: World, cam: Camera, ct: number, at: (i: number) => [number, number]): void {
    const g = this.g.clear();
    if (!cam.following || w.enc.state[0] === PHASE_ENC.over) return;
    const k = cam.base, r = cam.playRect();
    const X0 = r.x0 / k + INSET, Y0 = r.y0 / k + INSET, X1 = r.x1 / k - INSET, Y1 = r.y1 / k - INSET;
    const mx = (X0 + X1) / 2, my = (Y0 + Y1) / 2;
    /** Where on the edge a world point off screen is marked, and the way to it; null when it is in view. */
    const place = (x: number, y: number): [number, number, number, number] | null => {
      const p = cam.worldToScreen(x, y), hx = p.x / k, hy = p.y / k - 6; // aim at the body, not its feet
      if (hx >= X0 - INSET && hx <= X1 + INSET && hy >= Y0 - INSET && hy <= Y1 + INSET) return null;
      const dx = hx - mx, dy = hy - my;
      const t = Math.min(dx ? ((dx > 0 ? X1 : X0) - mx) / dx : Infinity, dy ? ((dy > 0 ? Y1 : Y0) - my) / dy : Infinity);
      const l = Math.hypot(dx, dy) || 1;
      return [Math.round(mx + dx * t), Math.round(my + dy * t), dx / l, dy / l];
    };
    // enemies, merged along the edge
    const packs = new Map<number, { x: number; y: number; ux: number; uy: number; n: number }>();
    const b = w.bodies;
    for (let i = MAX_SEATS; i < b.kind.length; i++) {
      if (b.kind[i] !== KIND.enemy) continue;
      const [x, y] = at(i), m = place(x, y);
      if (!m) continue;
      const key = Math.round(m[0] / BUCKET) * 4096 + Math.round(m[1] / BUCKET);
      const p = packs.get(key);
      if (p) { p.n++; p.ux += m[2]; p.uy += m[3]; } else packs.set(key, { x: m[0], y: m[1], ux: m[2], uy: m[3], n: 1 });
    }
    const hot = Math.floor(ct * 4) % 2 === 0;
    for (const p of packs.values()) {
      const l = Math.hypot(p.ux, p.uy) || 1;
      this.arrow(g, p.x, p.y, p.ux / l, p.uy / l, p.n >= 3 ? 4 : 3, p.n >= 5 && hot ? ENEMY_HOT : ENEMY);
    }
    // open portals (the next wave's, during the lull and the pick; still spilling, during the wave)
    for (let q = 0; q < MAX_PORTALS; q++) {
      if (!w.enc.total[q] || !w.enc.left[q]) continue;
      const m = place(w.enc.px[q], w.enc.py[q]);
      if (!m) continue;
      this.portal(g, m[0], m[1], m[2], m[3], hot ? PORTAL_HOT : PORTAL);
    }
  }

  /** A pixel arrow pointing (ux, uy), tip ahead of (x, y), with a dark rim. */
  private arrow(g: Graphics, x: number, y: number, ux: number, uy: number, r: number, col: number): void {
    const inside = (i: number, j: number, rr: number) => {
      const a = i * ux + j * uy, c = -i * uy + j * ux;
      return a <= rr && a >= -rr * 0.55 && Math.abs(c) <= (rr - a) * 0.75 + 0.35;
    };
    this.px.length = 0; this.ex.length = 0;
    for (let j = -r - 2; j <= r + 2; j++) for (let i = -r - 2; i <= r + 2; i++) {
      if (inside(i, j, r)) this.px.push([i, j]); else if (inside(i, j, r + 1.3)) this.ex.push([i, j]);
    }
    this.fill(g, x, y, this.ex, EDGE); this.fill(g, x, y, this.px, col);
  }

  /** A portal: a diamond with a notch of arrow toward it. */
  private portal(g: Graphics, x: number, y: number, ux: number, uy: number, col: number): void {
    this.px.length = 0; this.ex.length = 0;
    const cx = x - Math.round(ux * 4), cy = y - Math.round(uy * 4);
    for (let j = -6; j <= 6; j++) for (let i = -6; i <= 6; i++) {
      const d = Math.abs(i) + Math.abs(j);
      if (d <= 4) this.px.push([cx - x + i, cy - y + j]); else if (d <= 5) this.ex.push([cx - x + i, cy - y + j]);
    }
    this.fill(g, x, y, this.ex, EDGE); this.fill(g, x, y, this.px, col);
    // a dark eye in the middle, and the way to the portal
    g.rect(cx - 1, cy, 3, 1).rect(cx, cy - 1, 1, 3).fill(EDGE);
    this.arrow(g, x + Math.round(ux * 4), y + Math.round(uy * 4), ux, uy, 3, col);
  }

  private fill(g: Graphics, x: number, y: number, pts: [number, number][], col: number): void {
    if (!pts.length) return;
    for (const [i, j] of pts) g.rect(x + i, y + j, 1, 1);
    g.fill(col);
  }
}
