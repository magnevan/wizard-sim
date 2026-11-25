/**
 * Off-screen marks, for an arena the camera pans over: a small pixel arrow on the edge of the
 * view for enemies outside it (red; bigger for a pack), one in the seat's colour for each wizard
 * outside it (blinking while downed), and a pulsing violet diamond for each open portal, pointing
 * the way. Enemies close together share one mark, so a wave coming in reads
 * as a few marks, not a fringe of them. Drawn in the HUD layer (it doesn't zoom), in whole pixels.
 *
 * This half only works out the pixels and hands them, a colour at a time, to a sink: the pixel view's EdgeMarks
 * (edge-marks.ts) fills a Pixi Graphics, the 3D view's HUD (view3d/hud3d.ts) a 2D canvas.
 */
import { KIND, MAX_PORTALS, MAX_SEATS, PHASE_ENC, YTAG, type World } from '@wizard-sim/sim';
import { TEAMS } from './art/px';

const hex = (css: string): number => parseInt(css.slice(1), 16);
const ENEMY = 0xff5a46, ENEMY_HOT = 0xffc0a0, PORTAL = 0xc77dff, PORTAL_HOT = 0xf0d8ff, EDGE = 0x120e1a;
/** Inset from the edge of the play area, HUD px. */
const INSET = 6;
/** Marks closer than this along the edge merge, HUD px. */
const BUCKET = 12;

/** What the marks need of a camera: the pixel view's Camera has it all; the 3D view gives its own. */
export interface EdgeCamera {
  /** Marks show only while the camera follows (one local seat, or an arena bigger than the view). */
  readonly following: boolean;
  /** Screen px per HUD px. */
  readonly base: number;
  /** The play area on screen (screen px), between whatever the HUD covers. */
  playRect(): { x0: number; y0: number; x1: number; y1: number };
  /** A world point -> screen px. */
  viewToScreen(x: number, y: number): { x: number; y: number };
  /** HUD px above that point the marks aim at (the pixel view: 6, the body rather than its feet). */
  readonly aimLift?: number;
}

/** Takes one colour's pixels (x, y in HUD px, w, h), as rects. */
export type RectSink = (rects: readonly (readonly [number, number, number, number])[], col: number) => void;

export class EdgeMarksCore {
  private px: [number, number][] = [];
  private ex: [number, number][] = [];
  private out: [number, number, number, number][] = [];
  private sink: RectSink = () => {};

  draw(w: World, cam: EdgeCamera, ct: number, at: (i: number) => [number, number], sink: RectSink): void {
    if (!cam.following || w.enc.state[0] === PHASE_ENC.over) return;
    this.sink = sink;
    const k = cam.base, r = cam.playRect(), lift = cam.aimLift ?? 6;
    const X0 = r.x0 / k + INSET, Y0 = r.y0 / k + INSET, X1 = r.x1 / k - INSET, Y1 = r.y1 / k - INSET;
    const mx = (X0 + X1) / 2, my = (Y0 + Y1) / 2;
    /** Where on the edge a world point off screen is marked, and the way to it; null when it is in view. */
    const place = (x: number, y: number): [number, number, number, number] | null => {
      const p = cam.viewToScreen(x, y), hx = p.x / k, hy = p.y / k - lift; // aim at the body, not its feet
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
      if (b.kind[i] !== KIND.enemy || (w.yard && w.yard.tag[i] !== YTAG.goblin)) continue; // the drill yard's straw, sack and sparring soldiers are no threat
      const [x, y] = at(i), m = place(x, y);
      if (!m) continue;
      const key = Math.round(m[0] / BUCKET) * 4096 + Math.round(m[1] / BUCKET);
      const p = packs.get(key);
      if (p) { p.n++; p.ux += m[2]; p.uy += m[3]; } else packs.set(key, { x: m[0], y: m[1], ux: m[2], uy: m[3], n: 1 });
    }
    const hot = Math.floor(ct * 4) % 2 === 0;
    for (const p of packs.values()) {
      const l = Math.hypot(p.ux, p.uy) || 1;
      this.arrow(p.x, p.y, p.ux / l, p.uy / l, p.n >= 3 ? 4 : 3, p.n >= 5 && hot ? ENEMY_HOT : ENEMY);
    }
    // wizards off screen (each screen follows its own: Survive Review Q8): an arrow in their seat's
    // colour with a light rim, so it never reads as an enemy's; a downed one blinks (go rally them)
    for (let s = 0; s < MAX_SEATS; s++) {
      if (b.kind[s] !== KIND.wizard) continue;
      const [x, y] = at(s), m = place(x, y);
      if (!m) continue;
      const pal = TEAMS[s % TEAMS.length], down = !!b.downed[s];
      const col = hex(down && hot ? pal.trim : pal.light), rim = hex(down ? pal.deep : pal.trim);
      this.arrow(m[0], m[1], m[2], m[3], 4, col, rim);
      // a head behind the arrow: a dot in the seat's main colour
      const hx = m[0] - Math.round(m[2] * 6), hy = m[1] - Math.round(m[3] * 6);
      sink([[hx - 2, hy - 1, 5, 3], [hx - 1, hy - 2, 3, 5]], rim);
      sink([[hx - 1, hy - 1, 3, 3]], hex(pal.main));
    }
    // open portals (the next wave's, during the lull and the pick; still spilling, during the wave)
    for (let q = 0; q < MAX_PORTALS; q++) {
      if (!w.enc.total[q] || !w.enc.left[q]) continue;
      const m = place(w.enc.px[q], w.enc.py[q]);
      if (!m) continue;
      this.portal(m[0], m[1], m[2], m[3], hot ? PORTAL_HOT : PORTAL);
    }
  }

  /** A pixel arrow pointing (ux, uy), tip ahead of (x, y), with a rim (dark, unless given). */
  private arrow(x: number, y: number, ux: number, uy: number, r: number, col: number, rim = EDGE): void {
    const inside = (i: number, j: number, rr: number) => {
      const a = i * ux + j * uy, c = -i * uy + j * ux;
      return a <= rr && a >= -rr * 0.55 && Math.abs(c) <= (rr - a) * 0.75 + 0.35;
    };
    this.px.length = 0; this.ex.length = 0;
    for (let j = -r - 2; j <= r + 2; j++) for (let i = -r - 2; i <= r + 2; i++) {
      if (inside(i, j, r)) this.px.push([i, j]); else if (inside(i, j, r + 1.3)) this.ex.push([i, j]);
    }
    this.fill(x, y, this.ex, rim); this.fill(x, y, this.px, col);
  }

  /** A portal: a diamond with a notch of arrow toward it. */
  private portal(x: number, y: number, ux: number, uy: number, col: number): void {
    this.px.length = 0; this.ex.length = 0;
    const cx = x - Math.round(ux * 4), cy = y - Math.round(uy * 4);
    for (let j = -6; j <= 6; j++) for (let i = -6; i <= 6; i++) {
      const d = Math.abs(i) + Math.abs(j);
      if (d <= 4) this.px.push([cx - x + i, cy - y + j]); else if (d <= 5) this.ex.push([cx - x + i, cy - y + j]);
    }
    this.fill(x, y, this.ex, EDGE); this.fill(x, y, this.px, col);
    // a dark eye in the middle, and the way to the portal
    this.sink([[cx - 1, cy, 3, 1], [cx, cy - 1, 1, 3]], EDGE);
    this.arrow(x + Math.round(ux * 4), y + Math.round(uy * 4), ux, uy, 3, col);
  }

  private fill(x: number, y: number, pts: [number, number][], col: number): void {
    if (!pts.length) return;
    this.out.length = 0;
    for (const [i, j] of pts) this.out.push([x + i, y + j, 1, 1]);
    this.sink(this.out, col);
  }
}
