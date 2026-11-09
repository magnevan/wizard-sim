/**
 * The help panel's live previews: each row's spell (or weapon move) cast by a real wizard in a tiny
 * world of its own, drawn by the game's own view (WorldView: rigs, VFX, structures, lights), so the
 * preview is exactly what the cast looks like in play.
 *
 * Each preview is a sanctum world with one wizard and one dummy, stepped at 60 Hz on real time while
 * the panel is open, its wizard driven by demo.ts's spell loop. It never touches the game's world:
 * it has its own World and its own WorldView. Two things are shared between views and worlds and are
 * put back around every preview step and draw:
 *   - FIELD (art/field.ts), where the effect canvases sit. A preview uses a small field round its
 *     own scene, so its canvases are a few hundred pixels, not the arena's.
 *   - the sim's current hit kind (hit.ts), module state that a hit stamps on its target.
 * A Graphics mask clips each view to its box in the panel.
 */
import { Container, Graphics } from 'pixi.js';
import {
  KIND, MAX_SEATS, NO_INPUT, createWorld, hitKindNow, restore, setHitKind, snapshot, step,
  type PlayerInput, type Snapshot, type World,
} from '@wizard-sim/sim';
import { FIELD } from './art/field';
import { FY, PPU } from './camera';
import { PERIOD, demoInput, type Demo } from './demo';
import { WorldView } from './view';

/** Where the preview's wizard and dummy stand (the middle dummy of the Sanctum, at (0, -5)). */
const WIZ_X = -2.6, WIZ_Y = -5, DUMMY = [0, -5] as const;
/** A Retreat preview: the wizard starts this much nearer the dummy, and the camera looks this far back (world units; the field's margin allows 2). */
const RETREAT_START = 1.0, RETREAT_LOOK = 1.6;

/** What a preview copies from the player before each loop (their weapon and guard, for the hands' moves). */
export type Setup = (w: World) => void;

type FieldState = { OX: number; OY: number; W: number; H: number; aw: number; ah: number };

export class Preview {
  readonly root = new Container();
  private world: World;
  private view: WorldView;
  private mask = new Graphics();
  private start: Snapshot;
  private field: FieldState;
  private demo: Demo | null = null;
  private setup: Setup | null = null;
  /** 'retreat': the wizard starts nearer the dummy and the camera looks further back, where the Retreat lands. */
  private framing: 'retreat' | null = null;
  private tick = 0;
  /** The box, art px. */
  private bw = 0;
  private bh = 0;
  private scale = 0;

  /** `frames`: the game view's rig frame cache, shared so a preview's wizard is painted once, not once per view. */
  constructor(bw: number, bh: number, scale: number, frames?: unknown) {
    this.field = previewField(bw, bh);
    // the view's canvases are sized from FIELD when it is made: make it under the preview's field
    this.view = withField(this.field, () => new WorldView(false));
    if (frames) (this.view as unknown as { frames: unknown }).frames = frames;
    this.world = createWorld(11, 1, { room: 'sanctum' });
    const b = this.world.bodies;
    // one dummy, in front of the wizard: the others would wander into the box
    for (let i = MAX_SEATS; i < b.kind.length; i++) if (b.kind[i] === KIND.dummy && (Math.abs(b.x[i] - DUMMY[0]) > 0.1 || Math.abs(b.y[i] - DUMMY[1]) > 0.1)) b.kind[i] = KIND.none;
    b.x[0] = WIZ_X; b.y[0] = WIZ_Y; b.face[0] = 0;
    this.start = snapshot(this.world);
    // the view's own HUD, wave strip and edge arrows are not wanted here
    const hudLayer = this.view.root.children[1];
    if (hudLayer) hudLayer.visible = false;
    this.view.hud.draw = () => {};
    // the camera stays put on the scene: between the wizard and the dummy, the feet low in the box
    const cam = this.view.camera;
    cam.follow = () => {
      cam.cx = (WIZ_X + DUMMY[0]) / 2 + (this.framing === 'retreat' ? -RETREAT_LOOK : 0);
      cam.cy = WIZ_Y - 0.25 * this.bh / (PPU * FY); cam.following = false;
    };
    this.root.addChild(this.view.root, this.mask);
    this.view.root.mask = this.mask;
    this.resize(bw, bh, scale);
  }

  /** The box size in art px and the scale it is shown at. */
  resize(bw: number, bh: number, scale: number): void {
    if (bw === this.bw && bh === this.bh && scale === this.scale) return;
    this.bw = bw; this.bh = bh; this.scale = scale;
    this.view.resize(bw * scale, bh * scale, scale);
    this.mask.clear().rect(0, 0, bw * scale, bh * scale).fill(0xffffff);
    this.field = previewField(bw, bh);
  }

  /** Plays this demo from the start, after `setup` (re-run at every loop). */
  play(demo: Demo, setup: Setup | null, framing: 'retreat' | null = null): void {
    this.demo = demo; this.setup = setup; this.framing = framing;
    this.reset();
  }

  private reset(): void {
    const clock = this.world.clock[0];
    restore(this.world, this.start);
    // time keeps going forward for the view (its effects are keyed by sim time)
    this.world.clock[0] = clock + 1;
    this.setup?.(this.world);
    if (this.framing === 'retreat') this.world.bodies.x[0] = WIZ_X + RETREAT_START;
    this.tick = 0;
  }

  /** n sim steps. */
  steps(n: number): void {
    if (!this.demo || n <= 0) return;
    const loop = PERIOD * (this.demo.seq?.length ?? 1);
    const inputs: PlayerInput[] = new Array(MAX_SEATS).fill(NO_INPUT);
    const kind = hitKindNow();
    withField(this.field, () => {
      for (let k = 0; k < n; k++) {
        if (this.tick >= loop) this.reset();
        inputs[0] = demoInput(this.world, this.tick, 0, this.demo!);
        this.view.beforeStep(this.world);
        step(this.world, inputs);
        this.view.afterStep(this.world);
        this.tick++;
      }
    });
    setHitKind(kind);
  }

  draw(alpha: number, now: number): void {
    withField(this.field, () => this.view.draw(this.world, alpha, now));
  }

  destroy(): void { this.root.destroy({ children: true }); }
}

/** Field canvases a little bigger than the largest box (the view makes them once). */
const FW = 160, FH = 128;

/** A small field round the box, centred where the preview's camera looks. */
function previewField(bw: number, bh: number): FieldState {
  const W = FW, H = FH;
  const cx = (WIZ_X + DUMMY[0]) / 2, cy = WIZ_Y - 0.25 * bh / (PPU * FY);
  return { OX: Math.round(W / 2 - cx * PPU), OY: Math.round(H / 2 - cy * PPU * FY), W, H, aw: FIELD.aw, ah: FIELD.ah };
}

/** Runs f with FIELD set to `f`, then puts the game's FIELD back. */
function withField<T>(f: FieldState, fn: () => T): T {
  const saved = { ...FIELD };
  // aw / ah stay the game's: a view refits only when its world's arena differs from them (it never does here)
  Object.assign(FIELD, f, { aw: saved.aw, ah: saved.ah });
  try { return fn(); } finally { Object.assign(FIELD, saved); }
}
