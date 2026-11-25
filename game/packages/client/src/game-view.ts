/**
 * What the game's loop, input, panels and netplay ask of a renderer: the seam between them and
 * whatever draws the world. The PixiJS pixel view (view.ts, WorldView) implements it today; the 3D
 * view (view3d/, the port to 3D: docs/threads/port-3d.md) implements it too, and main.ts picks one.
 *
 * A view reads the sim and never writes to it. Everything it shows between ticks is interpolated
 * with `alpha`; sim events seen in afterStep become cosmetic effects that live only in the view.
 */
import type { World } from '@wizard-sim/sim';
import type { SoundDirector } from './audio/director';

/** Screen pixels (CSS px on the game's canvas, from its top-left) to and from world units on the ground. */
export interface ViewCamera {
  /**
   * Screen pixel -> world point on the ground. `lift` is renderer-specific: the pixel view takes the art px the
   * ground is drawn above its flat place (art/heights.ts); the 3D view ignores it and reads the cursor at the
   * height the ray meets the ground.
   */
  screenToWorld(sx: number, sy: number, lift?: number): { x: number; y: number };
  /** World point on the ground -> screen pixel. */
  worldToScreen(x: number, y: number): { x: number; y: number };
}

export interface GameView {
  readonly camera: ViewCamera;
  /** The canvas's size in CSS px changed (and, for the pixel view, its forced integer scale). */
  resize(screenW: number, screenH: number, forcedScale?: number): void;

  /** Called before each sim step that is shown (keeps last tick's positions for interpolation). */
  beforeStep(real: World): void;
  /** Called after each sim step that is shown: reads `real.events` for one-shot effects, poses and sound. */
  afterStep(real: World): void;
  /** Rollback is replaying a tick it already showed: note only what must not be lost (late remote spells), play nothing twice. */
  replayStep(real: World): void;
  /** Rollback is about to rewind: remember where bodies were drawn. */
  notePreRewind(real: World): void;
  /** Rollback has resimulated: smooth the local seat's correction. */
  notePostRewind(real: World, localSeat: number): void;
  /** Netplay: a late remote spell is being caught up (drawn from its first frame). */
  catchUp: boolean;
  /** Netplay's debug counters for caught-up effects. */
  readonly caught: Readonly<{ missiles: number; channels: number; casts: number }>;

  /** The seat played on this screen online: the HUD and the camera follow it. */
  setLocalSeat(seat: number): void;
  /** The seats played on this screen: a following camera frames their wizards. */
  isLocal: (seat: number) => boolean;
  /** The sound director fed from afterStep / replayStep and each draw. */
  sound: SoundDirector | null;

  /** Draw the world `alpha` of the way from the last step to the next; `now` is real time in ms. */
  draw(real: World, alpha: number, now?: number): void;
  /** One line of `key value` pairs, two spaces apart, for the Stats panel. */
  debug(): string;
}
