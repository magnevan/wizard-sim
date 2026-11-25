/**
 * The 3D game camera (the port's decision 5): the kit's game camera, perspective with a narrow 28 degree lens, 46
 * degrees down, from the south, never turning, so north is up the screen and W walks north. It follows the local seats'
 * middle as camera.ts does for the pixel view: one local wizard is followed, several on one screen (couch co-op) share
 * it aimed at their middle, easing toward the spot.
 *
 * Its distance is `viewH`: the u of ground the view shows top to bottom at the target (the ground's depth, as the lab
 * pages count it: dist = viewH sin(pitch) / (2 tan(fov / 2))).
 *
 * Sim <-> scene: scene-map.ts. Heights come from the scene's own ground (kit-scene.ts), since the sim has none yet.
 */
import * as THREE from 'three';
import type { ViewCamera } from '../game-view';
import type { KitScene } from './kit-scene';
import { sceneX, sceneZ, simX, simY } from './scene-map';

export const FOV = 28;
export const PITCH = THREE.MathUtils.degToRad(46);
/** The default ground height in view (u). The pixel game shows about 34 u top to bottom at 1080p (scripts/play3d-shot.mjs notes). */
export const VIEW_H = 26;

export class Camera3D implements ViewCamera {
  readonly cam = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.5, 600);
  viewH = VIEW_H;
  /** The scene point aimed at (x, z, u) and its ground height (y). */
  readonly target = new THREE.Vector3();
  /** The height (u) the cursor falls back to when its ray meets no walkable ground: the local wizard's. */
  fallbackY = 0;
  private sw = 1;
  private sh = 1;
  private placed = false;
  private ndc = new THREE.Vector2();
  private rc = new THREE.Raycaster();
  private v = new THREE.Vector3();

  constructor(private kit: KitScene) {}

  resize(w: number, h: number): void {
    this.sw = Math.max(1, w); this.sh = Math.max(1, h);
    this.cam.aspect = this.sw / this.sh; this.cam.updateProjectionMatrix();
  }

  /** Forget where it was: the next follow() jumps. */
  reset(): void { this.placed = false; }

  /** Once a frame: aim at the middle of `spots` (sim points), easing; dt in real seconds. */
  follow(spots: readonly { x: number; y: number }[], dt: number): void {
    if (!spots.length) return;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of spots) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
    const tx = sceneX((x0 + x1) / 2), tz = sceneZ((y0 + y1) / 2);
    const g = this.kit.heightAt(tx, tz), ty = Number.isNaN(g) ? this.target.y : g;
    const k = this.placed ? 1 - Math.exp(-Math.min(0.1, Math.max(0, dt)) * 5) : 1;
    this.target.x += (tx - this.target.x) * k; this.target.z += (tz - this.target.z) * k;
    // height eases slower, so a step onto a flight doesn't bob the view
    this.target.y += (ty - this.target.y) * (this.placed ? k * 0.6 : 1);
    this.placed = true;
    this.place();
  }

  /** Put the camera at its distance from the target (after follow, or after viewH changed). */
  place(): void {
    const dist = (this.viewH * Math.sin(PITCH)) / (2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)));
    this.cam.position.set(this.target.x, this.target.y + Math.sin(PITCH) * dist, this.target.z + Math.cos(PITCH) * dist);
    this.cam.lookAt(this.target);
    this.cam.updateMatrixWorld();
  }

  /** The cursor's ray dropped onto the walkable ground; with nothing walkable under it, onto the local wizard's level. */
  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    this.ndc.set((sx / this.sw) * 2 - 1, 1 - (sy / this.sh) * 2);
    this.rc.setFromCamera(this.ndc, this.cam);
    const r = this.rc.ray, hit = this.kit.hitGround(r);
    if (hit) return { x: simX(hit.x), y: simY(hit.z) };
    const t = Math.abs(r.direction.y) > 1e-6 ? (this.fallbackY - r.origin.y) / r.direction.y : 0;
    r.at(Math.max(0, t), this.v);
    return { x: simX(this.v.x), y: simY(this.v.z) };
  }

  /** A sim point on the ground (at the scene's ground height there) -> CSS px on the canvas. */
  worldToScreen(x: number, y: number): { x: number; y: number } {
    const X = sceneX(x), Z = sceneZ(y), g = this.kit.heightAt(X, Z);
    return this.project(X, Number.isNaN(g) ? this.fallbackY : g, Z);
  }

  /** A scene point (u) -> CSS px on the canvas. */
  project(x: number, y: number, z: number): { x: number; y: number } {
    this.v.set(x, y, z).project(this.cam);
    return { x: (this.v.x + 1) / 2 * this.sw, y: (1 - this.v.y) / 2 * this.sh };
  }

  /** Half the view's width at the target, in u (for the sound's pan). */
  halfWidth(): number {
    const dist = this.cam.position.distanceTo(this.target);
    return Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * dist * this.cam.aspect;
  }
}
