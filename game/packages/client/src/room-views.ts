/**
 * A mode's own drawing, the client's half of the sim's modes (sim mode.ts): what the battery, Survive or the tutorial
 * add to the screen. The view, the effects layer, the structures and the HUD call these hooks and never ask which
 * mode they're in, so a new chapter's look is a new RoomView here, not another branch in those files.
 *
 * Still to move (pass B, as they're next touched): the battery's spots in view.ts (where a driver's wizard stands,
 * the stakes breaking, the blackout), its flame from the tower's head in vfx.ts, and Survive's banner lines in hud.ts.
 */
import { MAX_SEATS, pedestalNear, possessed, wellNear, type ModeId, type World } from '@wizard-sim/sim';
import type { Ctx } from './art/px';
import type { BodyView, LightFn } from './art/vfx';
import { feedLines } from './art/feed-lines';
import { drawKeys } from './key-caps';
import { drawTutorialWorld, type PieceFn } from './tutorial-view';

/** What the structures layer lends a mode (view-structures.ts). */
export interface StructureKit {
  altars(w: World, t: number, g: Ctx, o: Ctx, light: LightFn): void;
  rallies(w: World, t: number, g: Ctx, o: Ctx, bodies: BodyView[], light: LightFn): void;
  piece: PieceFn;
}

/** What the HUD lends a mode for its top banner (hud.ts). */
export interface BannerKit {
  /** The battery's lesson: what to do now and its keys (hud.ts drawLesson). */
  lesson(w: World, t: number, viewW: number): void;
}

export interface RoomView {
  /** The top banner, drawn by the mode instead of the wave count. */
  banner?(k: BannerKit, w: World, t: number, viewW: number): void;
  /** The mode's things in the world, on the structures layer (after the walls). */
  structures?(k: StructureKit, w: World, t: number, g: Ctx, o: Ctx, bodies: BodyView[], light: LightFn): void;
  /** Painted on the ground under every effect (the battery's glyph paths). */
  ground?(g: Ctx, w: World, t: number, light: LightFn): void;
  /** Over the bodies, on the effects layer (the battery's X key over whoever can use something). */
  overBodies?(o: Ctx, w: World, bodies: BodyView[], t: number): void;
}

const NONE: RoomView = {};

const VIEWS: Partial<Record<ModeId, RoomView>> = {
  battery: {
    banner: (k, w, t, viewW) => k.lesson(w, t, viewW),
    ground: (g, w, t, light) => feedLines(g, w, t, light), // the well's glyph paths to the defences and the gate, under everything
    overBodies: (o, w, bodies, t) => {
      // standing in a free possession circle, or by the well once it can be stabilized: the X key over your head
      for (let i = 0; i < MAX_SEATS; i++) {
        const v = bodies[i];
        if (v?.on && w.seats.active[i] && !possessed(w, i) && (pedestalNear(w, i) >= 0 || wellNear(w, i))) drawKeys(o, [{ key: 'x' }], Math.round(v.x - 7), Math.round(v.y - 50), t);
      }
    },
  },
  survive: {
    structures: (k, w, t, g, o, bodies, light) => { k.altars(w, t, g, o, light); k.rallies(w, t, g, o, bodies, light); },
  },
  tutorial: {
    structures: (k, w, t, g, o, _bodies, light) => drawTutorialWorld(w, t, g, o, light, k.piece),
  },
};

/** The world's mode's view (an empty one for modes that add nothing). */
export const roomView = (w: World): RoomView => VIEWS[w.mode.id] ?? NONE;
