/**
 * The VFX Lab's hit overlay (?hit=1): what the sim's hits really cover, dotted over the stage, read from the sim's state
 * and config, never from the art, so an effect can be checked against where it hurts:
 *   - a spray's cone (effects.ts channelTick: SHAPES.sprayRange and sprayHalfAngle, both growing per extra rune), and
 *     where it stops (the channel's far end: a wall cuts it short)
 *   - a beam's line, to the channel's far end
 *   - each missile's circle (missiles.r) and the rest of its flight (its velocity over its remaining life)
 *   - each zone's circle (Place: patches, blasts, springs, fog)
 *   - each area cast's ring (its burst event's radius), for half a second
 * Drawn on the stage's 2D overlay; positions go through each panel's own camera, so the ground's turn and squash apply.
 */
import { DT, MAX_SEATS, PHASE, SHAPES, atan2Turns, specOf, type World } from '@wizard-sim/sim';
import type { Cell } from './cell';

const COL = 'rgba(255,255,255,0.9)', SHADE = 'rgba(0,0,0,0.55)', RING = 'rgba(255,214,90,0.95)';
/** Ticks an area ring stays on the overlay after it went off. */
const RING_TICKS = 30;

export function drawHits(g: CanvasRenderingContext2D, cells: readonly Cell[]): void {
  for (const c of cells) {
    const w = c.world, cam = c.view.camera, x0 = c.root.position.x, y0 = c.root.position.y;
    g.save();
    g.beginPath(); g.rect(x0, y0, c.pxW, c.pxH); g.clip();
    const scr = (x: number, y: number): [number, number] => { const p = cam.worldToScreen(x, y); return [x0 + p.x, y0 + p.y]; };
    // a dot every `gap` screen px along a world-space path
    const dots = (pts: [number, number][], col: string, gap = 5): void => {
      let carry = 0;
      for (let k = 1; k < pts.length; k++) {
        const [ax, ay] = scr(...pts[k - 1]), [bx, by] = scr(...pts[k]), L = Math.hypot(bx - ax, by - ay);
        for (let d = carry; d <= L; d += gap) {
          const x = ax + ((bx - ax) * d) / L, y = ay + ((by - ay) * d) / L;
          g.fillStyle = SHADE; g.fillRect(Math.round(x) - 1, Math.round(y) - 1, 4, 4);
          g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), 2, 2);
        }
        carry = (carry - L) % gap; if (carry < 0) carry += gap;
      }
    };
    const circle = (x: number, y: number, r: number, col: string): void => {
      const pts: [number, number][] = [];
      for (let k = 0; k <= 64; k++) { const a = (k / 64) * Math.PI * 2; pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r]); }
      dots(pts, col);
    };
    channels(w, dots);
    const m = w.missiles;
    for (let j = 0; j < m.alive.length; j++) {
      if (!m.alive[j]) continue;
      circle(m.x[j], m.y[j], m.r[j], COL);
      const life = Math.max(0, m.life[j]) * DT;
      dots([[m.x[j], m.y[j]], [m.x[j] + m.vx[j] * life, m.y[j] + m.vy[j] * life]], COL, 8);
    }
    const z = w.zones;
    for (let j = 0; j < z.type.length; j++) if (z.type[j]) circle(z.x[j], z.y[j], z.r[j], COL);
    for (const b of c.bursts) if (c.tick - b.tick <= RING_TICKS && c.tick >= b.tick) circle(b.x, b.y, b.r, RING);
    g.restore();
  }
}

/** Every channelling wizard's spray cone or beam line. */
function channels(w: World, dots: (pts: [number, number][], col: string, gap?: number) => void): void {
  const b = w.bodies, s = w.seats;
  for (let i = 0; i < MAX_SEATS; i++) {
    if (!s.active[i] || s.phase[i] !== PHASE.channel) continue;
    const spec = specOf(w, i), x = b.x[i], y = b.y[i], ex = s.chanEndX[i], ey = s.chanEndY[i];
    if (spec.shape === 'beam') { dots([[x, y], [ex, ey]], COL, 4); continue; }
    if (spec.shape !== 'spray') continue;
    const face = atan2Turns(s.aimY[i], s.aimX[i]) * Math.PI * 2;
    const range = SHAPES.sprayRange + 0.5 * (spec.sizeN - 1), half = SHAPES.sprayHalfAngle * (1 + 0.25 * (spec.sizeN - 1)) * Math.PI * 2;
    const at = (a: number, r: number): [number, number] => [x + Math.cos(a) * r, y + Math.sin(a) * r];
    const arc: [number, number][] = [];
    for (let k = 0; k <= 24; k++) arc.push(at(face - half + (2 * half * k) / 24, range));
    dots([[x, y], at(face - half, range)], COL); dots([[x, y], at(face + half, range)], COL); dots(arc, COL);
    // where the stream stops (short of the range when a wall cuts it)
    dots([[x, y], [ex, ey]], RING, 7);
  }
}
