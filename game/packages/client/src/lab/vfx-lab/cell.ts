/**
 * One VFX Lab panel: a real World of the scene, stepped by the real sim, drawn by its own real WorldView (rigs, effects,
 * lights, the lot) into a box of the page. The wizards cast through demo.ts's inputs, as `?spell=` does in the game, so
 * every spell works without wiring of its own.
 *
 * Sharing one page between several worlds and views takes what help-preview.ts takes: the sim's current hit kind (module
 * state) is put back round every step, and live3d's per-body keys are scoped to the panel. FIELD (art/field.ts) is the
 * same for every panel (they are all the same room), so it is fitted once before the first view is made.
 */
import { Container, Graphics, type Renderer } from 'pixi.js';
import {
  ARCH, BODY, KEYED_EL, KIND, MAX_SEATS, NO_INPUT, QUEUE_MAX, TEAM, atan2Turns, createWorld, devRefillRunes, devSpawnEnemy, devStage,
  hitKindNow, restore, setHitKind, snapshot, spawnBody, step, type PlayerInput, type Snapshot, type World,
} from '@wizard-sim/sim';
import { FY, PPU } from '../../camera';
import { demoInput, type Demo } from '../../demo';
import { fitField } from '../../art/field';
import { setLiveScope } from '../../art/live3d';
import { toX, toY, turnedWorld } from '../../iso-world';
import { WorldView } from '../../view';
import type { SceneDef, V } from './scenes';

export interface CellSpec {
  scene: SceneDef;
  /** Each wizard's cast, or null to stand still. */
  demos: (Demo | null)[];
  seed: number;
  /** The box, art px, and the screen px per art px. */
  w: number; h: number; scale: number;
  /** A part of the default frame to show instead (art px from its top left): x, y, w, h. */
  zoom: readonly [number, number, number, number] | null;
  mood: string | null;
  /** Keeps this panel's live 3D bodies apart from the other panels'. */
  scope: string;
}

/** demoInput lags seat s by 37 ticks a seat (two moments of one spell); the lab's wizards cast together. */
const LAG = 37;

const worldX = (p: V) => toX(p[0], p[1]), worldY = (p: V) => toY(p[0], p[1]);

export class Cell {
  readonly root = new Container();
  readonly view: WorldView;
  readonly world: World;
  /** Steps taken since the scene was set up. */
  tick = 0;
  /** The step after which wizard 0's spell went off (its cast event): t = 0. */
  readonly t0: number;
  private start: Snapshot;
  private mask = new Graphics();
  private inputs: PlayerInput[] = new Array(MAX_SEATS).fill(NO_INPUT);

  constructor(readonly spec: CellSpec, renderer: Renderer) {
    const sc = spec.scene, w = (this.world = createWorld(spec.seed, sc.wizards.length, { room: sc.room, dummies: false }));
    const b = w.bodies;
    sc.wizards.forEach((wz, i) => {
      const aim = wz.aim ?? sc.target;
      b.x[i] = worldX(wz.at); b.y[i] = worldY(wz.at);
      b.face[i] = atan2Turns(worldY(aim) - b.y[i], worldX(aim) - b.x[i]);
    });
    for (const d of sc.dummies ?? []) spawnBody(w, -1, KIND.dummy, TEAM.enemies, worldX(d), worldY(d), BODY.dummyHp, BODY.dummyRadius);
    for (const e of sc.enemies ?? []) {
      const i = devSpawnEnemy(w, ARCH[e.arch], worldX(e.at), worldY(e.at));
      if (i >= 0) b.face[i] = atan2Turns(b.y[0] - b.y[i], b.x[0] - b.x[i]);
    }
    // a full queue of anything (Ice has no pool of its own), and every enemy held where it stands
    const own = w.mode;
    w.mode = { ...own, runeMax: (_w, _i, id) => (id > KEYED_EL ? 0 : QUEUE_MAX) };
    devStage(w, { hold: true, puppet: -1, goal: null, aim: 0 });
    for (let s = 0; s < sc.wizards.length; s++) devRefillRunes(w, s);
    this.start = snapshot(w);
    this.t0 = this.findCast();

    // the effect canvases are sized from FIELD when a view is made: fit it to this room first
    const tw = turnedWorld(w);
    fitField(tw.dims.w, tw.dims.h);
    const v = (this.view = new WorldView());
    v.setRenderer(renderer);
    v.mood = spec.mood ?? sc.mood ?? null;
    // the view's HUD, wave strip and edge arrows are not wanted here
    const hudLayer = v.root.children[1];
    if (hudLayer) hudLayer.visible = false;
    v.hud.draw = () => {};
    // the camera stays on the scene (and on the zoomed part of it)
    const [lu, lv] = sc.look, z = spec.zoom, fw = z ? z[2] : spec.w, fh = z ? z[3] : spec.h;
    const du = z ? (z[0] + z[2] / 2 - spec.w / 2) / PPU : 0, dv = z ? (z[1] + z[3] / 2 - spec.h / 2) / (PPU * FY) : 0;
    const cam = v.camera;
    cam.follow = () => { cam.cx = lu + du; cam.cy = lv + dv; cam.following = false; };
    v.resize(fw * spec.scale, fh * spec.scale, spec.scale);
    this.mask.rect(0, 0, fw * spec.scale, fh * spec.scale).fill(0xffffff);
    this.root.addChild(v.root, this.mask);
    v.root.mask = this.mask;
  }

  /** The box on screen, px. */
  get pxW(): number { return (this.spec.zoom ? this.spec.zoom[2] : this.spec.w) * this.spec.scale; }
  get pxH(): number { return (this.spec.zoom ? this.spec.zoom[3] : this.spec.h) * this.spec.scale; }

  private inputsAt(tick: number): PlayerInput[] {
    for (let s = 0; s < MAX_SEATS; s++) {
      const d = this.spec.demos[s];
      this.inputs[s] = d && s < this.spec.scene.wizards.length ? demoInput(this.world, tick + s * LAG, s, d) : NO_INPUT;
    }
    return this.inputs;
  }

  /** Runs the sim alone (no view) until wizard 0's spell goes off, then puts the world back. */
  private findCast(): number {
    const w = this.world, d = this.spec.demos[0], kind = hitKindNow();
    const hands = !d || d.els.length === 0;
    let at = -1;
    for (let k = 0; k < 600 && at < 0; k++) {
      step(w, this.inputsAt(k));
      if (w.events.some((e) => e.who === 0 && (e.kind === 'cast' || (hands && e.kind === 'move')))) at = k + 1;
    }
    restore(w, this.start);
    setHitKind(kind);
    // nothing went off (a held Place's preview, a wait): t counts from the button press instead
    return at >= 0 ? at : 10 + (d?.els.length ?? 0) * 6;
  }

  /** One sim step, with the view told before and after, as the game's loop does. */
  stepOnce(): void {
    const kind = hitKindNow();
    const inputs = this.inputsAt(this.tick);
    this.view.beforeStep(this.world);
    step(this.world, inputs);
    this.view.afterStep(this.world);
    setHitKind(kind);
    this.tick++;
  }

  /** The scene from the top again (live looping; the view's clock carries on, so the old run's effects end). */
  restart(): void { restore(this.world, this.start); this.tick = 0; }

  draw(alpha: number, now: number): void {
    setLiveScope(this.spec.scope);
    try { this.view.draw(this.world, alpha, now); } finally { setLiveScope(''); }
  }

  destroy(): void { this.root.destroy({ children: true }); }
}
