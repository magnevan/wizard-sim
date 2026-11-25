/**
 * The 3D view (the port to 3D, docs/explorations/2026-11-25-port-3d-plan.md): implements GameView with a three.js
 * renderer on its own canvas, hosting the kit scene (kit-scene.ts), the game camera (camera3d.ts), the bodies
 * (stand-ins until Bodies3D lands: stand-in-bodies.ts) and fading for hidden wizards (fade.ts). A transparent 2D canvas
 * sits over the 3D one for the HUD (a later step: nothing draws on it yet).
 *
 * Spell effects, the HUD, deaths and statuses aren't drawn yet; the rollback hooks keep bodies smooth and feed sound.
 */
import * as THREE from 'three';
import { KIND, MAX_BODIES, MAX_SEATS, type RoomDef, type World } from '@wizard-sim/sim';
import type { GameView } from '../game-view';
import type { SoundDirector } from '../audio/director';
import { setupStage, spinKit } from '../lab/kit-render';
import { Camera3D } from './camera3d';
import { Fader } from './fade';
import { KitScene } from './kit-scene';
import { sceneX, sceneZ, setSceneOrigin } from './scene-map';
import { StandInBodies, type BodiesLayer } from './stand-in-bodies';

export interface View3DOptions {
  /** Draw the kit's fitted models and textures (false: its greybox placeholders, quick to load). */
  art?: boolean;
  /** Keep the frame after it's shown (headless screenshots read the canvas). */
  preserve?: boolean;
}

export class View3D implements GameView {
  readonly renderer: THREE.WebGLRenderer;
  /** The 2D canvas over the 3D one, for the HUD (transparent, takes no pointer events). */
  readonly hudCanvas = document.createElement('canvas');
  readonly scene = new THREE.Scene();
  readonly kit = new KitScene();
  readonly camera: Camera3D;
  readonly sun: THREE.DirectionalLight;
  readonly fader: Fader = new Fader([]);
  /** Swap this for the characters workstream's Bodies3D. */
  bodies: BodiesLayer = new StandInBodies();
  sound: SoundDirector | null = null;
  isLocal: (seat: number) => boolean = () => true;
  catchUp = true;
  readonly caught = { missiles: 0, channels: 0, casts: 0 };
  /** True once the scene is built and drawn once. */
  ready = false;
  private localSeat = 0;
  private prevX = new Float64Array(MAX_BODIES);
  private prevY = new Float64Array(MAX_BODIES);
  private prevKind = new Uint8Array(MAX_BODIES);
  private smoothX = new Float64Array(MAX_BODIES);
  private smoothY = new Float64Array(MAX_BODIES);
  private preX = new Float64Array(MAX_BODIES);
  private preY = new Float64Array(MAX_BODIES);
  private lastDraw = 0;
  private def: RoomDef | null = null;
  private bufSize = new THREE.Vector2();
  /** The last frame's render time (ms) and renderer.info. */
  renderMs = 0;
  info = { calls: 0, triangles: 0 };

  constructor(host: HTMLElement, private opts: View3DOptions = {}) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: !!opts.preserve, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.info.autoReset = true;
    const c = this.renderer.domElement;
    c.style.cssText = 'position:absolute;inset:0;display:block;width:100%;height:100%';
    this.hudCanvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
    host.append(c, this.hudCanvas);
    this.sun = setupStage(this.renderer, this.scene);
    this.camera = new Camera3D(this.kit);
    this.scene.add(this.kit.root, this.bodies.root);
  }

  /** The 3D canvas (input listens on it). */
  get canvas(): HTMLCanvasElement { return this.renderer.domElement; }

  /** Load and build the room's scene. */
  async load(scene: string): Promise<void> {
    await this.kit.load(scene, this.opts.art !== false);
    (this as { fader: Fader }).fader = new Fader(this.kit.occluders);
  }

  resize(screenW: number, screenH: number): void {
    this.renderer.setSize(screenW, screenH, false);
    this.hudCanvas.width = screenW; this.hudCanvas.height = screenH;
    this.camera.resize(screenW, screenH);
  }

  setLocalSeat(seat: number): void { this.localSeat = seat; this.isLocal = (s) => s === seat; }

  beforeStep(w: World): void {
    this.prevX.set(w.bodies.x); this.prevY.set(w.bodies.y); this.prevKind.set(w.bodies.kind);
  }

  afterStep(w: World): void {
    const b = w.bodies;
    for (const e of w.events) if (e.kind === 'blink' && e.who >= 0) { this.prevX[e.who] = b.x[e.who]; this.prevY[e.who] = b.y[e.who]; }
    for (let i = 0; i < MAX_BODIES; i++) if (b.kind[i] && this.prevKind[i] !== b.kind[i]) { this.prevX[i] = b.x[i]; this.prevY[i] = b.y[i]; }
    this.sound?.afterStep(w, this.isLocal);
  }

  replayStep(w: World): void { this.sound?.replayStep(w, this.localSeat); }

  notePreRewind(w: World): void { this.preX.set(w.bodies.x); this.preY.set(w.bodies.y); }
  notePostRewind(w: World, localSeat: number): void {
    const b = w.bodies;
    for (let i = 0; i < MAX_BODIES; i++) {
      if (i === localSeat || !b.kind[i]) continue;
      const dx = this.preX[i] - b.x[i], dy = this.preY[i] - b.y[i];
      if (dx * dx + dy * dy > 9) { this.smoothX[i] = 0; this.smoothY[i] = 0; continue; } // a real teleport: snap
      this.smoothX[i] += dx; this.smoothY[i] += dy;
    }
    this.sound?.postRewind(w);
  }

  /** Where body i is drawn (sim u), `alpha` of the way from the last step to this one, with any rollback correction. */
  drawnAt(w: World, i: number, alpha: number): [number, number] {
    const b = w.bodies;
    return [this.prevX[i] + (b.x[i] - this.prevX[i]) * alpha + this.smoothX[i], this.prevY[i] + (b.y[i] - this.prevY[i]) * alpha + this.smoothY[i]];
  }

  draw(w: World, alpha: number, now = performance.now()): void {
    const dt = this.lastDraw ? (now - this.lastDraw) / 1000 : 0;
    this.lastDraw = now;
    // a new room: the scene origin is its toScene (scene-map.ts), and the camera jumps
    if (w.def !== this.def) { this.def = w.def; setSceneOrigin(w.def); this.camera.reset(); }
    // rollback corrections ease out over ~100 ms
    const ease = Math.exp(-Math.max(0, dt) / 0.1);
    for (let i = 0; i < MAX_BODIES; i++) { this.smoothX[i] *= ease; this.smoothY[i] *= ease; }
    const b = w.bodies, up: { x: number; y: number }[] = [], down: { x: number; y: number }[] = [], all: { x: number; y: number }[] = [];
    for (let s = 0; s < MAX_SEATS; s++) {
      if (b.kind[s] !== KIND.wizard || !w.seats.active[s]) continue;
      const [x, y] = this.drawnAt(w, s, alpha), p = { x, y };
      all.push(p);
      if (this.isLocal(s)) (b.downed[s] ? down : up).push(p);
    }
    this.camera.follow(up.length ? up : down.length ? down : all, dt);
    const at = (i: number) => {
      const [x, y] = this.drawnAt(w, i, alpha), X = sceneX(x), Z = sceneZ(y), g = this.kit.heightAt(X, Z);
      return { x: X, y: Number.isNaN(g) ? this.camera.target.y : g, z: Z, face: b.face[i] };
    };
    this.bodies.draw(w, at, now);
    // hidden wizards: a hole through what stands between the camera and each local one (fade.ts)
    const targets: { x: number; y: number; z: number; h: number }[] = [];
    for (let s = 0; s < MAX_SEATS; s++) if (b.kind[s] === KIND.wizard && w.seats.active[s] && this.isLocal(s)) targets.push({ ...at(s), h: this.bodies.heightOf(w, s) });
    if (targets[0]) this.camera.fallbackY = targets[0].y;
    this.fader.update(this.camera.cam, targets, dt, this.renderer.getDrawingBufferSize(this.bufSize));
    // the sun and its shadow box ride along with the view
    const t = this.camera.target;
    this.sun.position.set(t.x - 30, t.y + 40, t.z + 22); this.sun.target.position.copy(t);
    spinKit(now / 1000);
    this.render();
    this.ready = true;
    const me = this.localSeat;
    this.sound?.frame(w, { cx: t.x - sceneX(0), cy: t.z - sceneZ(0), halfW: this.camera.halfWidth(), earX: b.x[me], earY: b.y[me] }, now / 1000);
  }

  /** Render the scene now (a report's screenshot renders, then reads the canvas in the same task). */
  render(): void {
    const t0 = performance.now();
    this.renderer.render(this.scene, this.camera.cam);
    this.renderMs = performance.now() - t0;
    this.info = { calls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles };
  }

  debug(): string {
    return `draws ${this.info.calls}  tris ${(this.info.triangles / 1000).toFixed(0)}k  render ${this.renderMs.toFixed(1)}ms  faded ${this.fader.count}  viewH ${this.camera.viewH}`;
  }
}
