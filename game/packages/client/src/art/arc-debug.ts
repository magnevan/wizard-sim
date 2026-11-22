/**
 * The Shard stream's arcs as lines, for tuning F2 Tune › Spell shapes › streamArc* (?arcs=1 in the game, live; and the
 * VFX Lab's hit overlay, &hit=1). Two kinds:
 *   - the preview: while a wizard channels the stream, every lane's curve from the hand to the cursor, as the next shard
 *     in that lane would fly it, read from the sim's own helpers (effects.ts streamLane, arcControl, streamAimD), so a
 *     slider moved in Tune moves the lines at once;
 *   - each arcing shard's own curve (its sx, cx, tx buffers), fainter, with where it is now.
 * Client only: the sim never sees it, and no hash changes.
 */
import type { Graphics } from 'pixi.js';
import { MAX_SEATS, PF, PHASE, SHAPES, arcControl, atan2Turns, cosTurns, sinTurns, specOf, streamAimD, streamLane, type World } from '@wizard-sim/sim';

export type ArcPt = [number, number];
/** One curve in world units: `tier` 1 is the innermost lane; `preview` the lane lines, else a shard's own path; `at` where the shard is now. */
export interface ArcLine { pts: ArcPt[]; tier: number; preview: boolean; at?: ArcPt }

/** Lane colours, innermost first: the outer lanes (the full streamArcWidth) are the brightest. */
export const ARC_COLS = [0x7ff0ff, 0xffd84a, 0xff7ad9];

const curve = (sx: number, sy: number, cx: number, cy: number, tx: number, ty: number, n = 24): ArcPt[] => {
  const pts: ArcPt[] = [];
  for (let k = 0; k <= n; k++) {
    const u = k / n, v = 1 - u;
    pts.push([v * v * sx + 2 * v * u * cx + u * u * tx, v * v * sy + 2 * v * u * cy + u * u * ty]);
  }
  return pts;
};

/** Every Shard stream curve in the world now: the channelling wizards' lane previews and the arcing shards' own paths. */
export function streamArcs(w: World): ArcLine[] {
  const out: ArcLine[] = [], s = w.seats, b = w.bodies, m = w.missiles;
  if (SHAPES.streamArc) {
    for (let i = 0; i < MAX_SEATS; i++) {
      if (!s.active[i] || s.phase[i] !== PHASE.channel) continue;
      const spec = specOf(w, i);
      if (spec.shape !== 'stream') continue;
      const aimD = streamAimD(w, i), face = atan2Turns(s.aimY[i], s.aimX[i]), dx = cosTurns(face), dy = sinTurns(face);
      const sx = b.x[i] + dx * (b.r[i] + 0.25), sy = b.y[i] + dy * (b.r[i] + 0.25), tx = b.x[i] + dx * aimD, ty = b.y[i] + dy * aimD;
      const { lanes } = streamLane(spec.formN, 0, aimD);
      for (let lane = 0; lane < lanes; lane++) {
        const { side, width } = streamLane(spec.formN, lane, aimD), [cx, cy] = arcControl(sx, sy, tx, ty, side, width);
        out.push({ pts: curve(sx, sy, cx, cy, tx, ty), tier: (lane >> 1) + 1, preview: true });
      }
    }
  }
  for (let j = 0; j < m.alive.length; j++) {
    if (!m.alive[j] || !(m.flags[j] & PF.arc)) continue;
    out.push({ pts: curve(m.sx[j], m.sy[j], m.cx[j], m.cy[j], m.tx[j], m.ty[j], 16), tier: 0, preview: false, at: [m.x[j], m.y[j]] });
  }
  return out;
}

/** Draw streamArcs into a Pixi Graphics; `at` maps a world point to the Graphics' own space. */
export function drawStreamArcs(g: Graphics, w: World, at: (x: number, y: number) => ArcPt): void {
  for (const a of streamArcs(w)) {
    const pts = a.pts.map(([x, y]) => at(x, y));
    const col = a.preview ? ARC_COLS[Math.min(ARC_COLS.length, a.tier) - 1] : 0xffffff;
    g.moveTo(pts[0][0], pts[0][1]);
    for (let k = 1; k < pts.length; k++) g.lineTo(pts[k][0], pts[k][1]);
    g.stroke({ width: a.preview ? 1.5 : 1, color: col, alpha: a.preview ? 0.9 : 0.35 });
    if (a.preview) { const [ex, ey] = pts[pts.length - 1]; g.circle(ex, ey, 3).stroke({ width: 1, color: col, alpha: 0.9 }); }
    if (a.at) { const [px, py] = at(...a.at); g.circle(px, py, 2).fill({ color: 0xffffff, alpha: 0.8 }); }
  }
}
