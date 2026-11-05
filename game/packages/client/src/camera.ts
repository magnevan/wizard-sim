/**
 * The pixel camera. The scene is laid out at art resolution (PPU art pixels per world unit) and
 * shown at an integer scale with nearest filtering, so every art
 * pixel is a crisp square. The steep 3/4 view squashes the ground: screen y = world y * FY
 * (Pixel Battlefield pass 4 settled on 0.6).
 *
 * In every room, each screen follows its own wizard at one fixed scale, easing toward it and
 * stopping a few units past the arena's edge (where the arena fits the view, it only drifts toward
 * you as far as keeps the whole arena in view). Allies elsewhere get an arrow at the edge of the
 * view (edge-marks.ts), not a zoom (Survive Review Q8). Several local seats on one screen (couch
 * co-op) share it: the camera aims at their middle, and an arena that fits is framed still, as it
 * always was. Panning moves the scene by whole screen pixels (the art-pixel part through the
 * layout, the rest as an offset), so it is smooth and still crisp.
 */
export const PPU = 16;
export const FY = 0.6;
/** Art px the rune HUD takes at the bottom of the view (in HUD pixels: the HUD keeps the base scale). */
const HUD_H = 74;
/** Art px kept above the arena for hats and the wave strip. */
const SKY = 26;
/** How far past the arena's edge a following camera may look, world units: sides, north, south. */
const PAD_X = 2, PAD_N = 2.5, PAD_S = 1.5;

export interface Spot { x: number; y: number }

export class Camera {
  /** Integer upscale from art pixels to screen pixels for the scene. */
  scale = 2;
  /** The scale picked for the screen; the HUD uses it. The scene uses it too (it no longer zooms out). */
  base = 2;
  /** Size of the scene's low-res target in art pixels. */
  w = 0;
  h = 0;
  /** Size of the HUD layer in its art pixels (at the base scale). */
  hudW = 0;
  hudH = 0;
  /** World point at the centre of the view. */
  cx = 0;
  cy = 0;
  /** Is the camera following (one local seat, or an arena bigger than the view)? Edge marks show only then. */
  following = false;
  private sw = 0;
  private sh = 0;
  private placed = false;

  /** Pick the largest integer scale that still shows about 270 art pixels of height (like 1080p / 4). */
  fit(screenW: number, screenH: number, forced?: number): void {
    this.sw = screenW; this.sh = screenH;
    this.base = forced && forced > 0 ? Math.floor(forced) : Math.max(1, Math.floor(screenH / 270));
    this.scale = this.base;
    this.hudW = Math.ceil(screenW / this.base);
    this.hudH = Math.ceil(screenH / this.base);
    this.w = Math.ceil(this.sw / this.scale);
    this.h = Math.ceil(this.sh / this.scale);
    this.placed = false;
  }

  /** World units of the view, left/right of the centre, and above / below it (the HUD hides the bottom). */
  private halfX(): number { return this.w / 2 / PPU; }
  private upY(): number { return (this.h / 2 - SKY) / (PPU * FY); }
  private downY(): number { return (this.h / 2 - HUD_H) / (PPU * FY); }

  /**
   * Once a frame: aim at this screen's own wizards. aw x ah is the arena; spots are the local
   * seats' wizards (the living ones, or the downed ones if none is up); the camera aims at their
   * middle. `shared`: several local seats play on this one screen (couch co-op), so an arena that
   * fits is framed still, as before. dt is real seconds since the last frame.
   */
  follow(aw: number, ah: number, spots: readonly Spot[], shared: boolean, dt: number): void {
    // Couch co-op in an arena that fits is framed as before: centred, and lifted to clear the rune HUD when there's room.
    // (the whole view counts here, HUD and all: the Sanctum at 4x sits partly behind the HUD, as it always did)
    this.following = !shared || aw * PPU > this.w || ah * PPU * FY > this.h;
    if (!this.following) {
      const up = Math.max(0, Math.min(HUD_H / 2, this.h / 2 - (ah / 2) * PPU * FY - SKY));
      this.cx = 0; this.cy = up / (PPU * FY); this.placed = true;
      return;
    }
    let x0 = 0, x1 = 0, y0 = 0, y1 = 0;
    spots.forEach((p, k) => {
      if (!k || p.x < x0) x0 = p.x; if (!k || p.x > x1) x1 = p.x;
      if (!k || p.y < y0) y0 = p.y; if (!k || p.y > y1) y1 = p.y;
    });
    let tx = (x0 + x1) / 2, ty = (y0 + y1) / 2;
    const hx = this.halfX(), up = this.upY(), down = this.downY();
    // The view stops a little past the arena's edge. Along an axis where the arena (and that margin)
    // fits, the same two limits swap: the view drifts toward you only until the far edge would leave it.
    const lx = -aw / 2 - PAD_X + hx, rx = aw / 2 + PAD_X - hx;
    tx = Math.max(Math.min(lx, rx), Math.min(Math.max(lx, rx), tx));
    const ly = -ah / 2 - PAD_N + up, ry = ah / 2 + PAD_S - down;
    ty = Math.max(Math.min(ly, ry), Math.min(Math.max(ly, ry), ty));
    // ease toward it (a fresh view jumps straight there)
    const k = this.placed ? 1 - Math.exp(-Math.min(0.1, Math.max(0, dt)) * 5) : 1;
    this.cx += (tx - this.cx) * k; this.cy += (ty - this.cy) * k;
    this.placed = true;
  }

  /** Forget where the camera was: the next follow() jumps (a new world). */
  reset(): void { this.placed = false; }

  /** Art pixel of the world origin. Everything is placed as origin + round(x * PPU), so sprites and the
   * effect canvases (whose own origin is a whole pixel) round the same way and never drift apart. */
  originX(): number { return Math.round(-this.cx * PPU + this.w / 2); }
  originY(): number { return Math.round(-this.cy * PPU * FY + this.h / 2); }
  /** The part of the pan finer than an art pixel, in whole screen pixels: the scene is offset by it. */
  subX(): number { return Math.round((-this.cx * PPU + this.w / 2 - this.originX()) * this.scale); }
  subY(): number { return Math.round((-this.cy * PPU * FY + this.h / 2 - this.originY()) * this.scale); }
  /** World -> art pixel in the scene. Rounded so sprites never land between pixels. */
  toArtX(x: number): number { return this.originX() + Math.round(x * PPU); }
  toArtY(y: number): number { return this.originY() + Math.round(y * PPU * FY); }

  /** Screen pixel -> world point on the ground. */
  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return { x: (sx / this.scale - this.w / 2) / PPU + this.cx, y: (sy / this.scale - this.h / 2) / (PPU * FY) + this.cy };
  }
  /** World point -> screen pixel (the inverse of screenToWorld). */
  worldToScreen(x: number, y: number): { x: number; y: number } {
    return { x: ((x - this.cx) * PPU + this.w / 2) * this.scale, y: ((y - this.cy) * PPU * FY + this.h / 2) * this.scale };
  }
  /** The play part of the view in screen px: below the sky strip, above the rune HUD. */
  playRect(): { x0: number; y0: number; x1: number; y1: number } {
    return { x0: 0, y0: SKY * this.base, x1: this.sw, y1: this.sh - HUD_H * this.base };
  }
}
