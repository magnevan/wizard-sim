/**
 * Camera vistas: a scripted look at a tall landmark that's bigger than the play view (the court's armillary). The user
 * (2026-11-22): keep it large, show pieces of it in play, "with maybe some sequences where the whole thing comes into
 * view". A Marker tagged `vista` is such a moment: the first time one of this screen's wizards comes within VISTA_R of it
 * (or starts there) in a visit to the room, the camera pulls back to the largest whole-pixel scale at which the nearest
 * `landmark` (with the prop standing on it) and the wizard both fit, frames them, holds, and returns to play.
 *
 * Client only: the sim never knows, and play goes on underneath. Whole-pixel scales only, so the art stays crisp: the
 * pull-back is a cut in scale with an eased pan, not a smooth zoom.
 */
import type { RoomDef } from '@wizard-sim/sim';

/** How near a vista marker a wizard comes to set it off, view units. */
export const VISTA_R = 4;
/** Seconds: easing onto the landmark, holding on it, then handing back to the follow camera. */
export const VISTA_IN = 0.9, VISTA_HOLD = 3, VISTA_OUT = 0.6;

/** A landmark's foot and top, view units (the top is where its prop's art ends, at the height it stands on). */
export interface LandmarkSpan { x: number; foot: number; top: number }

export interface VistaShot {
  /** What the camera should frame (view units): the middle across, the top to keep in view, and the scene scale. */
  x: number; top: number; scale: number;
  /** Is it in the hand-back part (the follow camera takes over at the base scale)? */
  out: boolean;
}

interface Running { id: string; t0: number; land: LandmarkSpan; wx: number; wy: number }

export class Vistas {
  /** What it's doing, for tests and scripts (window.wizardSim.view.vista.phase): idle, or in / hold / out of vista `id`. */
  phase: 'idle' | 'in' | 'hold' | 'out' = 'idle';
  id = '';
  private room = '';
  private done = new Set<string>();
  private run: Running | null = null;

  /** Forget what has played (a new visit to a room, or a new world). */
  reset(): void { this.room = ''; this.done.clear(); this.run = null; }

  /**
   * Once a frame. `spots`: this screen's wizards, where they're drawn (view units, lifted by the ground's height).
   * `landmark` finds the span of the landmark nearest a point. `fit(span)` gives the scale at which `span` view units
   * of height fill the play view. `lift(x, y)`: how far the ground at a view point is drawn above its flat place (view
   * units), so a marker is measured where it's drawn, like the wizards. Returns the shot to show, or null to follow.
   */
  update(def: RoomDef, spots: readonly { x: number; y: number }[], now: number, landmark: (x: number, y: number) => LandmarkSpan | null,
    fit: (span: number) => number, lift: (x: number, y: number) => number = () => 0): VistaShot | null {
    if (def.id !== this.room) { this.reset(); this.room = def.id; }
    if (!this.run && spots.length) {
      for (const m of def.markers) {
        if (m.tag !== 'vista' || this.done.has(m.id)) continue;
        const my = m.y - lift(m.x, m.y), near = spots.find((p) => Math.hypot(p.x - m.x, p.y - my) < VISTA_R);
        const land = near && landmark(m.x, m.y);
        if (!near || !land) continue;
        this.done.add(m.id);
        this.run = { id: m.id, t0: now, land, wx: near.x, wy: near.y };
        break;
      }
    }
    const r = this.run;
    if (!r) { this.phase = 'idle'; return null; }
    const t = now - r.t0;
    if (t > VISTA_IN + VISTA_HOLD + VISTA_OUT) { this.run = null; this.phase = 'idle'; return null; }
    this.id = r.id; this.phase = t < VISTA_IN ? 'in' : t < VISTA_IN + VISTA_HOLD ? 'hold' : 'out';
    const top = r.land.top - 1, bottom = Math.max(r.land.foot, r.wy) + 1;
    return { x: (r.land.x + r.wx) / 2, top, scale: fit(bottom - top), out: t > VISTA_IN + VISTA_HOLD };
  }
}
