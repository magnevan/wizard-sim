/**
 * Silhouette effects built from a body's cached frame: a skin round it (the ward, the imbue, the Double) or a sheen over it.
 * Shared by the structures (view-structures.ts) and the statuses (vfx.ts).
 */
import * as X from './px';
import type { Ctx } from './px';
import { CELL_H, CELL_W, FEET_X, FEET_Y } from './rigs';
import { mod } from './util';
import type { BodyView } from './vfx';

// =====================================================================================================
// Silhouette effects: a halo or sheen built from a body's cached frame (the ward skin, the Double).
export class Sil {
  private A = X.canvas(CELL_W + 8, CELL_H + 8);
  private B = X.canvas(CELL_W + 8, CELL_H + 8);
  private cell(v: BodyView, c: Ctx, dx = 4, dy = 4): boolean {
    const f = v.f; if (!f) return false;
    c.drawImage(f.c, f.sx, f.sy, CELL_W, CELL_H, dx, dy, CELL_W, CELL_H);
    return true;
  }
  /** A skin round the silhouette: `ring` px wide, in col, with a bright band climbing it, dithered to level (0..16). */
  halo(o: Ctx, v: BodyView, t: number, col: string, opt: { hi?: string; col2?: string; level?: number; ring?: number; band?: boolean; lag?: [number, number] } = {}): void {
    const A = this.A.x, B = this.B.x, W = CELL_W + 8, H = CELL_H + 8;
    A.globalCompositeOperation = 'source-over'; A.clearRect(0, 0, W, H);
    if (!this.cell(v, A)) return;
    A.globalCompositeOperation = 'source-in'; A.fillStyle = col; A.fillRect(0, 0, W, H);
    if (opt.band !== false && opt.hi) {
      A.globalCompositeOperation = 'source-atop';
      const band = H - ((t * 46) % (H + 12));
      A.fillStyle = opt.hi; A.fillRect(0, Math.round(band), W, 3);
      A.fillStyle = opt.col2 ?? col; A.fillRect(0, Math.round(band) + 3, W, 2);
    }
    const lvl = Math.round(opt.level ?? 16);
    if (lvl < 16) {
      A.globalCompositeOperation = 'destination-in';
      const ox = Math.floor(t * 9) % 4, oy = Math.floor(t * 7) % 4;
      A.drawImage(X.mask(lvl), ox, oy, W, H, 0, 0, W, H);
    }
    A.globalCompositeOperation = 'source-over'; A._fs = null;
    B.globalCompositeOperation = 'source-over'; B.clearRect(0, 0, W, H);
    const r = opt.ring ?? 2, lag = opt.lag;
    if (lag) B.drawImage(this.A.c, lag[0], lag[1]);
    else {
      const offs = r >= 2 ? [[-2, 0], [2, 0], [0, -2], [0, 2], [-1, -1], [1, -1], [-1, 1], [1, 1], [-2, -1], [2, -1]] : [[-1, 0], [1, 0], [0, -1], [0, 1]];
      for (const [dx, dy] of offs) B.drawImage(this.A.c, dx, dy);
    }
    B.globalCompositeOperation = 'destination-out'; this.cell(v, B); B.globalCompositeOperation = 'source-over';
    o.drawImage(this.B.c, Math.round(v.x - FEET_X - 4), Math.round(v.y - FEET_Y - 4));
  }
  /** A sheen over the body itself: diagonal bands sweeping across it, dithered. */
  sheen(o: Ctx, v: BodyView, t: number, cols: [string, string], level = 9): void {
    const A = this.A.x, W = CELL_W + 8, H = CELL_H + 8;
    A.globalCompositeOperation = 'source-over'; A.clearRect(0, 0, W, H); A._fs = null;
    const sweep = mod(t * 40, W + 40) - 20;
    for (let y = 0; y < H; y++) { const x0 = Math.round(sweep - y * 0.6); X.rect(A, x0, y, 3, 1, cols[0]); X.rect(A, x0 + 3, y, 2, 1, cols[1]); X.rect(A, x0 - 14, y, 1, 1, cols[1]); }
    A.globalCompositeOperation = 'destination-in'; A.drawImage(X.mask(level), 0, 0, W, H, 0, 0, W, H);
    this.cell(v, A); // destination-in with the body: only on the body
    A.globalCompositeOperation = 'source-over';
    o.drawImage(this.A.c, Math.round(v.x - FEET_X - 4), Math.round(v.y - FEET_Y - 4));
  }
}
