/**
 * The pixel camera. The scene is laid out at art resolution (PPU art pixels per world unit) and
 * shown at an integer scale with nearest filtering, so every art
 * pixel is a crisp square. The steep 3/4 view squashes the ground: screen y = world y * FY
 * (Pixel Battlefield pass 4 settled on 0.6).
 */
import { ARENA } from '@wizard-sim/sim';

export const PPU = 16;
export const FY = 0.6;
/** Art px the rune HUD takes at the bottom of the view. */
const HUD_H = 74;

export class Camera {
  /** Integer upscale from art pixels to screen pixels. */
  scale = 2;
  /** Size of the low-res target in art pixels. */
  w = 0;
  h = 0;
  /** World point at the centre of the view. */
  cx = 0;
  cy = 0;

  /** Pick the largest integer scale that still shows about 270 art pixels of height (like 1080p / 4). */
  fit(screenW: number, screenH: number, forced?: number): void {
    this.scale = forced && forced > 0 ? Math.floor(forced) : Math.max(1, Math.floor(screenH / 270));
    this.w = Math.ceil(screenW / this.scale);
    this.h = Math.ceil(screenH / this.scale);
    // frame the arena in the space above the rune HUD when there is room for both
    // (keeping at least a little sky above the arena for hats and the wave strip)
    const up = Math.max(0, Math.min(HUD_H / 2, this.h / 2 - (ARENA.h / 2) * PPU * FY - 26));
    this.cy = up / (PPU * FY);
  }

  /** Art pixel of the world origin. Everything is placed as origin + round(x * PPU), so sprites and the
   * effect canvases (whose own origin is a whole pixel) round the same way and never drift apart. */
  originX(): number { return Math.round(-this.cx * PPU + this.w / 2); }
  originY(): number { return Math.round(-this.cy * PPU * FY + this.h / 2); }
  /** World -> art pixel in the scene. Rounded so sprites never land between pixels. */
  toArtX(x: number): number { return this.originX() + Math.round(x * PPU); }
  toArtY(y: number): number { return this.originY() + Math.round(y * PPU * FY); }

  /** Screen pixel -> world point on the ground. */
  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return { x: (sx / this.scale - this.w / 2) / PPU + this.cx, y: (sy / this.scale - this.h / 2) / (PPU * FY) + this.cy };
  }
}
