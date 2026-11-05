/**
 * The pixel camera. The scene is laid out at art resolution (PPU art pixels per world unit) and
 * shown at an integer scale with nearest filtering, so every art
 * pixel is a crisp square. The steep 3/4 view squashes the ground: screen y = world y * FY
 * (Pixel Battlefield pass 4 settled on 0.6).
 *
 * An arena that fits the view (the Sanctum, the Arena) is framed still, as it always was. One that
 * doesn't (Survive's) is followed: the camera eases toward the middle of the living wizards, keeps
 * the local player in view, steps out one integer scale when the team spreads too far apart, and
 * stops a few units past the arena's edge. Panning moves the scene by whole screen pixels (the
 * art-pixel part through the layout, the rest as an offset), so it is smooth and still crisp.
 */
export const PPU = 16;
export const FY = 0.6;
/** Art px the rune HUD takes at the bottom of the view (in HUD pixels: the HUD keeps the base scale). */
const HUD_H = 74;
/** Art px kept above the arena for hats and the wave strip. */
const SKY = 26;
/** How far past the arena's edge a following camera may look, world units: sides, north, south. */
const PAD_X = 2, PAD_N = 2.5, PAD_S = 1.5;
/** Room kept round the wizards when framing them, world units (x, then y). */
const KEEP_X = 5, KEEP_Y = 3.5;

export interface Spot { x: number; y: number }

export class Camera {
  /** Integer upscale from art pixels to screen pixels for the scene. */
  scale = 2;
  /** The scale picked for the screen; the HUD always uses it, the scene may step out one from it. */
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
  /** Is the camera following (the arena is bigger than the view)? */
  following = false;
  private sw = 0;
  private sh = 0;
  private forced = false;
  private zoomOut = 0;
  private placed = false;

  /** Pick the largest integer scale that still shows about 270 art pixels of height (like 1080p / 4). */
  fit(screenW: number, screenH: number, forced?: number): void {
    this.sw = screenW; this.sh = screenH;
    this.forced = !!forced && forced > 0;
    this.base = this.forced ? Math.floor(forced!) : Math.max(1, Math.floor(screenH / 270));
    this.hudW = Math.ceil(screenW / this.base);
    this.hudH = Math.ceil(screenH / this.base);
    this.setZoom(this.zoomOut);
    this.placed = false;
  }

  private setZoom(z: number): void {
    this.zoomOut = z;
    this.scale = Math.max(1, this.base - z);
    this.w = Math.ceil(this.sw / this.scale);
    this.h = Math.ceil(this.sh / this.scale);
  }

  /** The HUD's height in scene art px. */
  private hudInScene(): number { return (HUD_H * this.base) / this.scale; }
  /** World units of the view, left/right of the centre, and above / below it (the HUD hides the bottom). */
  private halfX(): number { return this.w / 2 / PPU; }
  private upY(): number { return (this.h / 2 - SKY) / (PPU * FY); }
  private downY(): number { return (this.h / 2 - this.hudInScene()) / (PPU * FY); }
  /** Does a box of bw x bh world units fit the play part of the view at this zoom? */
  private fits(bw: number, bh: number): boolean { return bw <= this.halfX() * 2 && bh <= this.upY() + this.downY(); }

  /**
   * Once a frame: aim at the wizards. aw x ah is the arena; spots are the wizards to frame (the
   * living ones; all of them when everyone is down), local the local player's (or null). dt is
   * real seconds since the last frame.
   */
  follow(aw: number, ah: number, spots: readonly Spot[], local: Spot | null, dt: number): void {
    // An arena that fits is framed as before: centred, and lifted to clear the rune HUD when there's room.
    const wasOut = this.zoomOut > 0;
    this.setZoom(0);
    // (the whole view counts here, HUD and all: the Sanctum at 4x sits partly behind the HUD, as it always did)
    this.following = aw * PPU > this.w || ah * PPU * FY > this.h;
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
    // Step out one scale when the team doesn't fit (never below 2x, and not with ?scale); come back
    // in only once it fits with room to spare, so a pair standing at the limit doesn't flicker.
    const bw = x1 - x0 + 2 * KEEP_X, bh = y1 - y0 + 2 * KEEP_Y;
    const canOut = !this.forced && this.base >= 3;
    const out = canOut && spots.length > 1 && (wasOut ? !this.fits(bw * 1.2, bh * 1.2) : !this.fits(bw, bh));
    this.setZoom(out ? 1 : 0);
    let tx = (x0 + x1) / 2, ty = (y0 + y1) / 2;
    const hx = this.halfX(), up = this.upY(), down = this.downY();
    // the local player always stays in view, a little inside its edges
    if (local) {
      tx = Math.max(local.x - hx + 2, Math.min(local.x + hx - 2, tx));
      ty = Math.max(local.y - down + 1.5, Math.min(local.y + up - 2, ty));
    }
    // and the view stops a little past the arena's edge (or centres on it, along an axis it fits)
    const lx = -aw / 2 - PAD_X + hx, rx = aw / 2 + PAD_X - hx;
    tx = lx > rx ? 0 : Math.max(lx, Math.min(rx, tx));
    const ly = -ah / 2 - PAD_N + up, ry = ah / 2 + PAD_S - down;
    ty = ly > ry ? (ly + ry) / 2 : Math.max(ly, Math.min(ry, ty));
    // ease toward it (a fresh view jumps straight there)
    const k = this.placed ? 1 - Math.exp(-Math.min(0.1, Math.max(0, dt)) * 5) : 1;
    this.cx += (tx - this.cx) * k; this.cy += (ty - this.cy) * k;
    this.placed = true;
  }

  /** Forget where the camera was: the next follow() jumps (a new world). */
  reset(): void { this.placed = false; this.zoomOut = 0; }

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
