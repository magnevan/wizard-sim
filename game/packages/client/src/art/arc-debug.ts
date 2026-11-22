/**
 * The Shard stream's arcs as lines, for tuning F2 Tune › Spell shapes › streamArc* (?arcs=1 in the game, live; and the
 * VFX Lab's hit overlay, &hit=1). Two kinds:
 *   - the preview: while a wizard channels the stream, every lane's whole path from your side to the cursor (its float,
 *     its turn, the run in), as the next shard in that lane would fly it, from the sim's own helpers (effects.ts
 *     streamLane, arcRadius, arcPath, streamAimD), so a slider moved in Tune moves the lines at once;
 *   - each arcing shard's path still to fly, fainter, with where it is now.
 * Client only: the sim never sees it, and no hash changes.
 */
import type { Graphics } from 'pixi.js';
import { MAX_SEATS, PF, PHASE, SHAPES, arcPath, arcRadius, atan2Turns, cosTurns, sinTurns, specOf, streamAimD, streamLane, type World } from '@wizard-sim/sim';

export type ArcPt = [number, number];
/** One path in world units: `tier` 1 is the inner lanes; `preview` the lane lines, else a shard's own path; `at` where the shard is now. */
export interface ArcLine { pts: ArcPt[]; tier: number; preview: boolean; at?: ArcPt }

/** Lane colours, inner first: cyan inner, yellow middle, magenta outer (the ones behind you). */
export const ARC_COLS = [0x7ff0ff, 0xffd84a, 0xff7ad9];

/** Every Shard stream path in the world now: the channelling wizards' lane previews and the arcing shards' own paths. */
export function streamArcs(w: World): ArcLine[] {
  const out: ArcLine[] = [], s = w.seats, b = w.bodies, m = w.missiles;
  if (SHAPES.streamArc) {
    for (let i = 0; i < MAX_SEATS; i++) {
      if (!s.active[i] || s.phase[i] !== PHASE.channel) continue;
      const spec = specOf(w, i);
      if (spec.shape !== 'stream') continue;
      const aimD = streamAimD(w, i), face = atan2Turns(s.aimY[i], s.aimX[i]), dx = cosTurns(face), dy = sinTurns(face);
      const tx = b.x[i] + dx * aimD, ty = b.y[i] + dy * aimD, off = b.r[i] + 0.25;
      const { lanes } = streamLane(spec.formN, 0, aimD);
      for (let lane = 0; lane < lanes; lane++) {
        // as effects.ts does: it leaves from your side in its lane's direction, floats, turns, runs in
        const { turn, out: float, radius } = streamLane(spec.formN, lane, aimD);
        const hx = dx * cosTurns(turn) - dy * sinTurns(turn), hy = dx * sinTurns(turn) + dy * cosTurns(turn);
        const sx = b.x[i] + hx * off, sy = b.y[i] + hy * off;
        const r = arcRadius(sx, sy, hx, hy, tx, ty, float, radius);
        out.push({ pts: arcPath(sx, sy, hx, hy, tx, ty, float, r), tier: (lane >> 1) + 1, preview: true });
      }
    }
  }
  for (let j = 0; j < m.alive.length; j++) {
    if (!m.alive[j] || !(m.flags[j] & PF.arc)) continue;
    const sp = Math.hypot(m.vx[j], m.vy[j]) || 1, at: ArcPt = [m.x[j], m.y[j]];
    const pts = m.arcL[j] < 0 ? [at, [m.tx[j], m.ty[j]] as ArcPt] : arcPath(m.x[j], m.y[j], m.vx[j] / sp, m.vy[j] / sp, m.tx[j], m.ty[j], m.arcL[j], m.arcR[j]);
    out.push({ pts, tier: 0, preview: false, at });
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
