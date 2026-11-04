import { CAMERA } from '../config';
import { lerp, type Vec2 } from '../core/vec2';

/** Maps world units to CSS pixels. Zoom 1 shows CAMERA.viewHeight units vertically. */
export class Camera {
  center: Vec2 = { x: 0, y: 0 };
  zoom = 1;
  /** Extra zoom-out (<= 1) so every player stays in frame. */
  fit = 1;
  viewW = 1;
  viewH = 1;

  get ppu(): number {
    return (this.viewH / CAMERA.viewHeight) * this.zoom * this.fit;
  }

  resize(w: number, h: number): void {
    this.viewW = w;
    this.viewH = h;
  }

  worldToScreen(p: Vec2): Vec2 {
    return { x: (p.x - this.center.x) * this.ppu + this.viewW / 2, y: (p.y - this.center.y) * this.ppu + this.viewH / 2 };
  }

  screenToWorld(p: Vec2): Vec2 {
    return { x: (p.x - this.viewW / 2) / this.ppu + this.center.x, y: (p.y - this.viewH / 2) / this.ppu + this.center.y };
  }

  follow(target: Vec2, dt: number): void {
    this.center = lerp(this.center, target, 1 - Math.exp(-CAMERA.followRate * dt));
  }

  /** Ease `fit` so a world-space box of w x h units fits the view, down to CAMERA.minFit. */
  frame(w: number, h: number, dt: number): void {
    const base = (this.viewH / CAMERA.viewHeight) * this.zoom;
    const need = Math.max(w / (this.viewW / base), h / (this.viewH / base), 1);
    const target = Math.max(CAMERA.minFit, 1 / need);
    this.fit += (target - this.fit) * (1 - Math.exp(-3 * dt));
  }

  zoomBy(wheelDelta: number): void {
    if (!wheelDelta) return;
    this.zoom = Math.min(CAMERA.maxZoom, Math.max(CAMERA.minZoom, this.zoom * Math.exp(-wheelDelta * 0.001)));
  }
}
