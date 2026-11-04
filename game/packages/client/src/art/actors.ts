/**
 * Actor frames: each distinct quantized rig state is painted once (art/rigs.ts) into a cell
 * of an atlas page and kept as a Pixi texture. Facing snaps to 16 directions, the walk cycle
 * to 8 phases, poses and statuses to a few levels, so a crowd of identical goblins shares a
 * handful of frames. Pages are small (512 px) because a page is re-uploaded whole whenever a
 * new frame lands on it.
 *
 * Painting is budgeted per frame: past the budget a body keeps its last texture for a frame
 * or two instead of stalling the loop while a crowd warms the cache.
 */
import { Rectangle, Texture } from 'pixi.js';
import * as X from './px';
import { CELL_H, CELL_W, FEET_X, FEET_Y, paint, type Anchors, type RigState } from './rigs';

/** A cached frame: its texture, anchors, and where it sits on its page canvas (for silhouette effects). */
export interface Frame { tex: Texture; a: Anchors; c: HTMLCanvasElement; sx: number; sy: number }

const PAGE = 512, COLS = Math.floor(PAGE / CELL_W), ROWS = Math.floor(PAGE / CELL_H), PER_PAGE = COLS * ROWS;
/** About 5k frames (32 MB of pages) before the cache starts over. */
const MAX_PAGES = 56;

interface Page { c: HTMLCanvasElement; x: X.Ctx; tex: Texture; dirty: boolean }

export class ActorFrames {
  private pages: Page[] = [];
  private map = new Map<string, Frame>();
  private used = 0;
  private budget = 0;
  /** Frames painted since boot (for the debug line). */
  painted = 0;

  /** Call once per drawn frame, before any get(). */
  begin(budget = 28): void { this.budget = budget; }

  /** The frame for s, painting it if it is new and the budget allows (or `force`). */
  get(s: RigState, force: boolean): Frame | null {
    const k = keyOf(s);
    const hit = this.map.get(k);
    if (hit) return hit;
    if (!force && this.budget <= 0) return null;
    this.budget--;
    if (this.used >= MAX_PAGES * PER_PAGE) this.reset();
    const pi = Math.floor(this.used / PER_PAGE), ci = this.used % PER_PAGE;
    if (!this.pages[pi]) this.pages[pi] = newPage();
    const pg = this.pages[pi], cx = (ci % COLS) * CELL_W, cy = Math.floor(ci / COLS) * CELL_H;
    this.used++;
    pg.x.clearRect(cx, cy, CELL_W, CELL_H);
    const a = paint(s, pg.x, cx + FEET_X, cy + FEET_Y);
    pg.dirty = true;
    this.painted++;
    const f: Frame = { tex: new Texture({ source: pg.tex.source, frame: new Rectangle(cx, cy, CELL_W, CELL_H) }), a, c: pg.c, sx: cx, sy: cy };
    this.map.set(k, f);
    return f;
  }

  /** Re-upload the pages that changed this frame. */
  upload(): void { for (const p of this.pages) if (p.dirty) { p.tex.source.update(); p.dirty = false; } }

  get size(): number { return this.map.size; }

  private reset(): void {
    for (const f of this.map.values()) f.tex.destroy(false);
    this.map.clear();
    this.used = 0;
  }
}

function newPage(): Page {
  const { c, x } = X.canvas(PAGE, PAGE);
  const tex = Texture.from(c);
  tex.source.scaleMode = 'nearest';
  return { c, x, tex, dirty: true };
}

/** Feet offset inside a frame texture: place the sprite at (feetX - FEET_X, feetY - FEET_Y). */
export { FEET_X, FEET_Y };

const q = (v: number, steps: number) => Math.round(v * steps);
function keyOf(s: RigState): string {
  return s.kind + s.pal + '.' + s.variant + '.' + (s.seed & 1) + '|' + q(s.face, 100) + '|' + q(s.spd, 10) + '.' + q(s.ph, 100) + '.' + q(s.idle, 10) +
    '|' + q(s.vx, 1) + '.' + q(s.vy, 1) + '|' + q(s.prep, 10) + '.' + q(s.cast, 10) + '.' + q(s.sq, 10) + '.' + q(s.dead, 10) +
    '|' + q(s.burn, 10) + '.' + s.burnF + '.' + q(s.wet, 10) + '.' + s.wetF + '.' + q(s.frozen, 10) + '.' + q(s.chill, 10) + '.' + s.shock + '.' + s.flash +
    '|' + q(s.punch, 10) + '.' + q(s.smash, 10) + '.' + q(s.draw, 10);
}
