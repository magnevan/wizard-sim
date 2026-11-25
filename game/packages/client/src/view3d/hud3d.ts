/**
 * The HUD over the 3D view (the port's decision 4: the pixel HUD's look, for now). Everything is drawn in HUD px into
 * one small canvas, then scaled up by a whole number onto the transparent 2D canvas View3D lays over the 3D one, so it
 * stays crisp in whole art pixels at the pixel game's scale (screen height / 270, rounded down).
 *
 * Back to front: the marks attached to the world (hud-marks.ts: health bars, numbers, the rally ring), the arrows at the
 * edge to what's off screen (edge-marks-core.ts), and the rune HUD's canvases (hud-core.ts: the bar, the queue and spell
 * chips, the stored spell, the wave strip or a mode's banner, Survive's power-ups and run-over card).
 */
import * as THREE from 'three';
import type { World } from '@wizard-sim/sim';
import * as X from '../art/px';
import { HudCore } from '../hud-core';
import { EdgeMarksCore, type EdgeCamera, type RectSink } from '../edge-marks-core';
import { HudMarks } from './hud-marks';
import type { Camera3D } from './camera3d';

/** HUD px the rune HUD takes at the bottom of the view (camera.ts HUD_H): the edge arrows keep above it. */
const HUD_H = 74;
/** The height (u) off-screen arrows aim at: a body's middle. */
const AIM_H = 1.3;
/** How far (u, along the ground) a point behind the camera is brought toward the target, so it projects the right way. */
const BEHIND_R = 20;

export class Hud3D {
  /** The rune HUD; its seat is the local player's. */
  readonly core = new HudCore(0);
  readonly marks = new HudMarks();
  private edges = new EdgeMarksCore();
  private art = X.canvas(1, 1);
  private out: CanvasRenderingContext2D;
  /** Screen px per HUD px. */
  base = 1;
  hudW = 1;
  hudH = 1;
  private sw = 1;
  private sh = 1;
  private lastTick = 0;
  private epoch = 0;
  private v = new THREE.Vector3();
  private sink: RectSink = (rects, col) => {
    const c = this.art.x;
    c.fillStyle = `#${col.toString(16).padStart(6, '0')}`; c._fs = null;
    for (const [x, y, w, h] of rects) c.fillRect(x, y, w, h);
  };

  /** `canvas`: the 2D canvas over the 3D one. */
  constructor(private canvas: HTMLCanvasElement) {
    this.out = canvas.getContext('2d')!;
    canvas.style.imageRendering = 'pixelated';
  }

  set seat(s: number) { this.core.seat = s; }
  get seat(): number { return this.core.seat; }

  /** The view's size in CSS px (the overlay canvas has been sized to it). */
  resize(screenW: number, screenH: number): void {
    this.sw = screenW; this.sh = screenH;
    this.base = Math.max(1, Math.floor(screenH / 270));
    this.hudW = Math.ceil(screenW / this.base); this.hudH = Math.ceil(screenH / this.base);
    this.art.c.width = this.hudW; this.art.c.height = this.hudH;
    this.art.x.imageSmoothingEnabled = false; this.art.x._fs = null;
  }

  /** After each shown sim step: its events (dry runes, casts, hits). */
  afterStep(w: World): void {
    const t = this.simTime(w), s = w.seats;
    this.core.noteStep(w);
    for (const e of w.events) {
      this.core.onEvent(e.kind, e.who, e.look, e.text, t);
      this.marks.onEvent(e.kind, e.who, e.x, e.y, e.amount, e.text, e.tick, t);
      if (e.kind === 'cast' && e.who === this.core.seat) for (let k = 0; k < s.castLen[e.who]; k++) this.core.spent(s.castQueue[e.who * 5 + k], t);
    }
  }

  /**
   * Draws the HUD for this frame. `at` gives where body i is drawn (sim u), `ground` the scene point of the ground under a
   * sim point.
   */
  draw(w: World, alpha: number, now: number, cam: Camera3D, at: (i: number) => [number, number], ground: (x: number, y: number) => THREE.Vector3): void {
    const t = this.simTime(w, alpha), ct = now / 1000, c = this.art.x, k = this.base;
    c.clearRect(0, 0, this.hudW, this.hudH); c._fs = null;
    const toHud = (x: number, y: number, h: number): { x: number; y: number } => {
      const g = ground(x, y), p = this.project(cam, g.x, g.y + h, g.z, false);
      return { x: p.x / k, y: p.y / k };
    };
    this.marks.draw(c, w, { at, toHud }, t, ct);
    const edgeCam: EdgeCamera = {
      following: true, base: k, aimLift: 0,
      playRect: () => ({ x0: 0, y0: 0, x1: this.sw, y1: this.sh - HUD_H * k }),
      viewToScreen: (x, y) => { const g = ground(x, y); return this.project(cam, g.x, g.y + AIM_H, g.z, true); },
    };
    this.edges.draw(w, edgeCam, ct, at, this.sink);
    this.core.draw(w, t, this.hudW, this.hudH);
    const L = this.core.layers;
    for (const l of [L.top, L.bar, L.perks, L.over]) { if (l.visible) c.drawImage(l.c, l.x, l.y); l.dirty = false; }
    const o = this.out;
    o.clearRect(0, 0, this.canvas.width, this.canvas.height);
    o.imageSmoothingEnabled = false;
    o.drawImage(this.art.c, 0, 0, this.hudW * k, this.hudH * k);
  }

  /**
   * A scene point -> CSS px. Behind the camera it's NaN, or with `pull` the point is brought along the ground toward the
   * camera's target until it's in front, so an arrow to it still points the right way.
   */
  private project(cam: Camera3D, x: number, y: number, z: number, pull: boolean): { x: number; y: number } {
    const v = this.v.set(x, y, z).applyMatrix4(cam.cam.matrixWorldInverse);
    if (v.z > -cam.cam.near) {
      if (!pull) return { x: NaN, y: NaN };
      const T = cam.target, dx = x - T.x, dz = z - T.z, l = Math.hypot(dx, dz) || 1, s = Math.min(1, BEHIND_R / l);
      return cam.project(T.x + dx * s, y, T.z + dz * s);
    }
    return cam.project(x, y, z);
  }

  /** Sim seconds, carried on across a room change so a new room's clock doesn't run the old one's effects backwards. */
  private simTime(w: World, alpha = 0): number {
    const tick = w.clock[0];
    if (tick < this.lastTick) { this.epoch += this.lastTick / 60 + 60; this.marks.reset(); }
    this.lastTick = tick;
    return (tick + alpha) / 60 + this.epoch;
  }
}
