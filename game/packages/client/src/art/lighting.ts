/**
 * Scene lighting, for the isometric camera. Two low-resolution maps are drawn each frame, at art
 * pixels so they stay crisp and multiplied over the scene:
 *
 *   the shadow map, over the ground and under the actors: flat, hard-edged cast shadows from
 *   props, bodies and rock walls (a shadow on the ground must not darken someone standing in front of it);
 *   the light map, over the ground and the actors: the mood's ambient colour, drifting cloud shade,
 *   every spell's light, lamps on props, a small light each wizard carries, and a vignette.
 *
 * Walls stop light. A light near a wall is drawn as its visibility polygon (the method in Red Blob
 * Games' "2D Visibility": a ray to each wall end, and the nearest hit along each), and the wall faces
 * turned toward it catch the light, since a face stands above the ground line it would otherwise be cut off at.
 *
 * Effects drawn over the actors stay out of both maps: they're light, not lit. The look follows
 * what shipped pixel-art games do: a graded mood per time of day (Graveyard Keeper keeps ten), shadows
 * as sheared silhouettes, flat bands with dither only at the seams. A colour matrix over the lit
 * layers takes the edge off saturated art.
 */
import { ColorMatrixFilter, Container, Graphics, Mesh, MeshGeometry, RenderTexture, Sprite, Texture, TilingSprite, type Renderer } from 'pixi.js';
import { Lights } from './lights';
import * as X from './px';
import { FY, rand } from './util';

type RGB = readonly [number, number, number];
export interface Mood {
  /** What unlit ground and bodies are multiplied by. */
  ambient: RGB;
  /** The colour of a cast shadow. Hue-shifted, never plain grey. */
  shadow: RGB;
  /** Shadow length per art px of height: to the right and down the screen. 0, 0 casts none. */
  sun: readonly [number, number];
  /** -1 to 1: 0 leaves colour alone. */
  saturate: number;
  /** How dark passing cloud shade gets, 0 for none. */
  clouds: number;
  /** How dark the screen's corners get. */
  vignette: number;
  /** How bright the small light each wizard carries is. */
  carry: number;
}

export const MOODS: Readonly<Record<string, Mood>> = {
  day: { ambient: [0.94, 0.92, 0.87], shadow: [0.62, 0.62, 0.76], sun: [0.55, 0.28], saturate: -0.14, clouds: 0.1, vignette: 0.16, carry: 0 },
  dusk: { ambient: [0.76, 0.66, 0.7], shadow: [0.48, 0.44, 0.62], sun: [0.95, 0.42], saturate: -0.2, clouds: 0.06, vignette: 0.32, carry: 0.2 },
  night: { ambient: [0.38, 0.44, 0.66], shadow: [0.26, 0.3, 0.48], sun: [0.3, 0.15], saturate: -0.34, clouds: 0, vignette: 0.42, carry: 0.55 },
  interior: { ambient: [0.68, 0.61, 0.6], shadow: [0.48, 0.44, 0.54], sun: [0.18, 0.1], saturate: -0.12, clouds: 0, vignette: 0.36, carry: 0.32 },
};
const ROOM_MOOD: Readonly<Record<string, string>> = { academy: 'interior', survive: 'dusk', arena: 'dusk' };
export const moodOf = (room: string, override?: string | null): Mood => MOODS[override ?? ''] ?? MOODS[ROOM_MOOD[room] ?? 'day'];

/** Props that give off light: colour, radius in art px, strength, and how far above the prop's foot it sits. */
export const PROP_LIGHTS: Readonly<Record<string, readonly [string, number, number, number]>> = {
  'crystal-ball': ['#b08aff', 46, 0.6, 18], 'rune-circle': ['#b08aff', 54, 0.5, 0], cauldron: ['#8ef07e', 36, 0.35, 8], armillary: ['#ffd860', 30, 0.25, 14],
  'lantern-post': ['#ffb060', 62, 0.8, 24], 'ward-lamp': ['#9fd8ff', 58, 0.7, 26], 'wax-candle-on-a-brass-holder': ['#ffb060', 26, 0.5, 6], 'campfire-ring': ['#ff8a30', 72, 0.85, 4],
  'test-rig': ['#b08aff', 34, 0.45, 12], 'control-pedestal': ['#ffb060', 26, 0.35, 12], 'small-glowing-blue-crystal': ['#6ab8ff', 22, 0.4, 3],
};

const asNum = (c: RGB): number => (Math.round(c[0] * 255) << 16) | (Math.round(c[1] * 255) << 8) | Math.round(c[2] * 255);
/** Extra room round the view, so a screen shake never shows an unlit edge. */
const PAD = 12;
/** The height, in art px, a rock wall's shadow is cast from. */
const WALL_H = 22;
/** How many lights a frame may be cut by walls, strongest first. The rest aren't blocked. */
const MAX_BLOCKED = 40;
/** Vertices one blocked light can use. */
const MAX_VERTS = 180;
const RAYS = 24;

/** What's reused between frames for one blocked light: a shape drawn into the light map and again as the additive glow. */
interface LitShape { geo: MeshGeometry; map: Mesh; glow: Mesh; pos: Float32Array; uv: Float32Array; idx: Uint32Array }
interface QueuedLight { x: number; y: number; r: number; col: string; a: number }
const strongest = (a: QueuedLight, b: QueuedLight): number => b.a * b.r - a.a * a.r;

function cloudTexture(): Texture {
  const N = 256, cell = 32, P = N / cell, { c, x } = X.canvas(N, N), img = x.createImageData(N, N), d = img.data;
  const lat = (i: number, j: number) => rand(((i % P) + P) % P, ((j % P) + P) % P, 301);
  for (let y = 0; y < N; y++) for (let xx = 0; xx < N; xx++) {
    const fx = xx / cell, fy = y / cell, i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j, su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
    const n = (lat(i, j) * (1 - su) + lat(i + 1, j) * su) * (1 - sv) + (lat(i, j + 1) * (1 - su) + lat(i + 1, j + 1) * su) * sv;
    // flat bands, with dither only where one meets the next
    const lv = Math.floor((n - 0.42) * 7 + (X.bay(xx, y) - 0.5) * 0.7);
    const k = (y * N + xx) * 4;
    d[k + 3] = lv <= 0 ? 0 : Math.round((Math.min(3, lv) / 3) * 255);
  }
  x.putImageData(img, 0, 0);
  const t = Texture.from(c);
  t.source.scaleMode = 'nearest'; t.source.addressMode = 'repeat';
  return t;
}

function vignetteTexture(w: number, h: number): Texture {
  const { c, x } = X.canvas(w, h), img = x.createImageData(w, h), d = img.data, L = 6;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const e = Math.hypot((i - w / 2) / (w * 0.62), (j - h / 2) / (h * 0.62));
    const lv = Math.floor(Math.max(0, (e - 0.5) * 2) * L + (X.bay(i, j) - 0.5) * 0.8);
    const k = (j * w + i) * 4;
    d[k + 3] = lv <= 0 ? 0 : Math.round((Math.min(L, lv) / L) * 255);
  }
  x.putImageData(img, 0, 0);
  const t = Texture.from(c);
  t.source.scaleMode = 'nearest';
  return t;
}

/**
 * The walls within reach of a light, in light-relative ground space: x unchanged, y unsquashed, so a
 * light's reach is a true circle. Returns ax, ay, bx, by repeating. A light standing on a wall ignores that wall.
 */
export function nearWalls(occ: readonly number[], lx: number, ly: number, R: number, out: number[] = []): number[] {
  out.length = 0;
  for (let i = 0; i < occ.length; i += 4) {
    const ax = occ[i] - lx, ay = (occ[i + 1] - ly) / FY, bx = occ[i + 2] - lx, by = (occ[i + 3] - ly) / FY;
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy || 1;
    const u = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
    const d = Math.hypot(ax + u * dx, ay + u * dy);
    if (d < R && d > 2) out.push(ax, ay, bx, by);
  }
  return out;
}

/** How far a ray from the light travels before a wall stops it, up to `max`. */
export function castRay(c: number, s: number, segs: readonly number[], max: number): number {
  let best = max;
  for (let i = 0; i < segs.length; i += 4) {
    const ax = segs[i], ay = segs[i + 1], D = segs[i + 2] - ax, E = segs[i + 3] - ay, det = D * s - c * E;
    if (Math.abs(det) < 1e-9) continue;
    const t = (D * ay - ax * E) / det, u = (c * ay - s * ax) / det;
    if (t > 0 && t < best && u >= 0 && u <= 1) best = t;
  }
  return best;
}

/** Scratch for the rays of one light, so a frame's light cutting allocates next to nothing. */
const ANGLES = new Float64Array(MAX_VERTS * 2);
function putVert(pos: Float32Array, uv: Float32Array, lx: number, ly: number, R: number, v: number, X0: number, Y0: number, up: number, farX = 0, farY = 0): void {
  pos[v * 2] = lx + X0; pos[v * 2 + 1] = ly + Y0 * FY - up;
  uv[v * 2] = ((X0 + farX) / R + 1) / 2; uv[v * 2 + 1] = ((Y0 + farY) / R + 1) / 2;
}

/** Fills a light's triangle fan, then a quad for each wall face turned toward it. Unused indices are left as empty triangles. */
function fillShape(pos: Float32Array, uv: Float32Array, idx: Uint32Array, lx: number, ly: number, R: number, segs: readonly number[], wallH: number): void {
  let na = 0;
  for (let k = 0; k < RAYS; k++) ANGLES[na++] = (k / RAYS) * Math.PI * 2 - Math.PI;
  for (let i = 0; i < segs.length && na + 2 <= ANGLES.length; i += 2) if (Math.hypot(segs[i], segs[i + 1]) < R) { const a = Math.atan2(segs[i + 1], segs[i]); ANGLES[na++] = a - 0.002; ANGLES[na++] = a + 0.002; }
  ANGLES.subarray(0, na).sort();
  const rim = Math.min(na, MAX_VERTS - 24);
  putVert(pos, uv, lx, ly, R, 0, 0, 0, 0);
  let v = 1, n = 0;
  for (let k = 0; k < rim; k++) {
    const a = ANGLES[k], c = Math.cos(a), sn = Math.sin(a), t = castRay(c, sn, segs, R);
    putVert(pos, uv, lx, ly, R, v, t * c, t * sn, 0);
    idx[n++] = 0; idx[n++] = v; idx[n++] = k + 1 < rim ? v + 1 : 1;
    v++;
  }
  // a wall's face stands above its ground line: where the light can see it, the face catches the light
  for (let i = 0; i < segs.length && v + 4 <= MAX_VERTS; i += 4) {
    const ax = segs[i], ay = segs[i + 1], bx = segs[i + 2], by = segs[i + 3];
    let nx = ay - by, ny = bx - ax;
    if (ny < 0) { nx = -nx; ny = -ny; } // the face the camera sees
    if (nx * -ax + ny * -ay <= 0) continue; // the light is behind it
    const mx = (ax + bx) / 2, my = (ay + by) / 2, dist = Math.hypot(mx, my) || 1;
    if (castRay(mx / dist, my / dist, segs, dist + 1) < dist - 2) continue; // another wall is in the way
    putVert(pos, uv, lx, ly, R, v, ax, ay, 0); putVert(pos, uv, lx, ly, R, v + 1, bx, by, 0);
    // higher up the wall is further from a light on the ground, so the glow fades as it climbs
    const nl = Math.hypot(nx, ny) || 1, fx = (-nx / nl) * wallH * 1.4, fy = (-ny / nl) * wallH * 1.4;
    putVert(pos, uv, lx, ly, R, v + 2, bx, by, wallH, fx, fy); putVert(pos, uv, lx, ly, R, v + 3, ax, ay, wallH, fx, fy);
    idx[n++] = v; idx[n++] = v + 1; idx[n++] = v + 2; idx[n++] = v; idx[n++] = v + 2; idx[n++] = v + 3;
    v += 4;
  }
  idx.fill(0, n);
}

export class SceneLighting {
  readonly shadowSprite = new Sprite();
  readonly lightSprite = new Sprite();
  readonly grade = new ColorMatrixFilter();
  private shadowRoot = new Container();
  private lightRoot = new Container();
  private walls = new Graphics();
  private pool: Sprite[] = [];
  private used = 0;
  private bg = new Sprite(Texture.WHITE);
  private clouds = new TilingSprite({ texture: cloudTexture(), width: 16, height: 16 });
  private vig = new Sprite();
  private lights = new Lights(0.9);
  /** Light's additive half, which can brighten past the map's limit. Sits over the actors. */
  private glow = new Lights(0.55);
  /** Add this to the scene where the plain lights go. */
  readonly glowLayer = new Container();
  private meshes: LitShape[] = [];
  private queue: QueuedLight[] = [];
  private queued = 0;
  /** Wall segments in scene px: x1, y1, x2, y2 repeating. */
  private occ: number[] = [];
  private order: QueuedLight[] = [];
  private nearBuf: number[] = [];
  /** This frame's wall shadow lines, relative to the field's corner; rebuilt into the Graphics only when they change. */
  private wallNext: number[] = [];
  private wallDrawn: number[] = [];
  private wallMood: Mood | null = null;
  private fx = 0;
  private fy = 0;
  /** How tall the room's walls are, for the light on their faces. */
  wallHeight = WALL_H;
  private shadowTex: RenderTexture | null = null;
  private lightTex: RenderTexture | null = null;
  private w = 0;
  private h = 0;
  private mood = MOODS.day;
  private shadowCol = 0;

  constructor() {
    this.shadowSprite.blendMode = 'multiply';
    this.lightSprite.blendMode = 'multiply';
    this.shadowRoot.addChild(this.walls);
    this.clouds.tint = 0x000000;
    this.vig.tint = 0x000000;
    this.lightRoot.addChild(this.bg, this.clouds, this.lights.layer, this.vig);
    this.glowLayer.addChild(this.glow.layer);
    this.shadowSprite.position.set(-PAD, -PAD);
    this.lightSprite.position.set(-PAD, -PAD);
    this.shadowRoot.position.set(PAD, PAD);
    this.lightRoot.position.set(PAD, PAD);
    this.bg.position.set(-PAD, -PAD);
    this.clouds.position.set(-PAD, -PAD);
    this.vig.position.set(-PAD, -PAD);
  }

  /** The art-pixel size of the view. Remakes the maps when it changes. */
  fit(w: number, h: number): void {
    if (w === this.w && h === this.h) return;
    this.w = w; this.h = h;
    const W = w + 2 * PAD, H = h + 2 * PAD;
    this.shadowTex?.destroy(true); this.lightTex?.destroy(true);
    const make = () => RenderTexture.create({ width: W, height: H, resolution: 1, scaleMode: 'nearest', antialias: false });
    this.shadowTex = make(); this.lightTex = make();
    this.shadowSprite.texture = this.shadowTex; this.lightSprite.texture = this.lightTex;
    this.bg.width = W; this.bg.height = H;
    this.clouds.width = W; this.clouds.height = H;
    this.vig.texture?.destroy(true);
    this.vig.texture = vignetteTexture(W, H);
  }

  begin(mood: Mood, ct: number, fx0: number, fy0: number): void {
    this.mood = mood;
    this.shadowCol = asNum(mood.shadow);
    this.used = 0;
    this.wallNext.length = 0;
    this.fx = fx0; this.fy = fy0;
    this.bg.tint = asNum(mood.ambient);
    this.clouds.alpha = mood.clouds;
    this.clouds.visible = mood.clouds > 0;
    // cloud shade is anchored to the world and drifts over it
    this.clouds.tilePosition.set(fx0 + ct * 3, fy0 + ct * 1.5);
    this.vig.alpha = mood.vignette;
    this.grade.reset();
    this.grade.saturate(mood.saturate);
    this.lights.begin();
    this.glow.begin();
    this.queued = 0;
    this.occ.length = 0;
  }

  /** A light on the ground at scene x, y: radius in art px, colour, strength. */
  light(x: number, y: number, r: number, col: string, a: number): void {
    if (a <= 0.02 || this.queued >= 200) return;
    let q = this.queue[this.queued];
    if (!q) { q = { x: 0, y: 0, r: 0, col: '', a: 0 }; this.queue.push(q); }
    q.x = x; q.y = y; q.r = r; q.col = col; q.a = a;
    this.queued++;
  }

  /** A wall that stops light, on a ground line in scene px. */
  occluder(x1: number, y1: number, x2: number, y2: number): void { this.occ.push(x1, y1, x2, y2); }

  /** A cast shadow from a sprite standing with its foot at scene x, y. */
  shadow(tex: Texture, footX: number, footY: number, x: number, y: number): void {
    const [sx, sy] = this.mood.sun;
    if (!sx && !sy) return;
    let s = this.pool[this.used];
    if (!s) { s = new Sprite(); this.shadowRoot.addChild(s); this.pool.push(s); }
    s.texture = tex;
    s.visible = true;
    s.tint = this.shadowCol;
    s.pivot.set(footX, footY);
    s.position.set(x, y);
    // height (up the image) is laid along the ground, in the sun's direction
    s.scale.set(1, -Math.hypot(sx, sy));
    s.skew.x = Math.atan2(sx, sy);
    this.used++;
  }

  /** The shadow of a rock wall standing on a line in scene px. */
  wall(x1: number, y1: number, x2: number, y2: number): void {
    this.wallNext.push(x1 - this.fx, y1 - this.fy, x2 - this.fx, y2 - this.fy);
  }

  /** Walls rarely change, and triangulating them is the expensive part: redraw only when they or the mood do. */
  private drawWalls(): void {
    this.walls.position.set(this.fx, this.fy);
    const a = this.wallNext, b = this.wallDrawn;
    let same = a.length === b.length && this.wallMood === this.mood;
    for (let i = 0; same && i < a.length; i++) if (a[i] !== b[i]) same = false;
    if (same) return;
    this.wallDrawn = a.slice();
    this.wallMood = this.mood;
    this.walls.clear();
    const [sx, sy] = this.mood.sun;
    if (!sx && !sy) return;
    const dx = sx * WALL_H, dy = sy * WALL_H;
    for (let i = 0; i < a.length; i += 4) this.walls.poly([a[i], a[i + 1], a[i + 2], a[i + 3], a[i + 2] + dx, a[i + 3] + dy, a[i] + dx, a[i + 1] + dy]).fill(this.shadowCol);
  }

  /** Draws the maps. Call after every shadow and light is in, and after the actors' frames are uploaded. */
  render(renderer: Renderer): void {
    if (!this.shadowTex || !this.lightTex) return;
    for (let i = this.used; i < this.pool.length; i++) this.pool[i].visible = false;
    this.drawWalls();
    this.flushLights();
    this.lights.end();
    this.glow.end();
    renderer.render({ container: this.shadowRoot, target: this.shadowTex, clear: true, clearColor: [1, 1, 1, 1] });
    renderer.render({ container: this.lightRoot, target: this.lightTex, clear: true, clearColor: [1, 1, 1, 1] });
  }

  private shape(i: number): LitShape {
    let s = this.meshes[i];
    if (!s) {
      const pos = new Float32Array(MAX_VERTS * 2), uv = new Float32Array(MAX_VERTS * 2), idx = new Uint32Array(MAX_VERTS * 3);
      const geo = new MeshGeometry({ positions: pos, uvs: uv, indices: idx, topology: 'triangle-list' });
      const map = new Mesh({ geometry: geo, texture: Texture.WHITE }), glow = new Mesh({ geometry: geo, texture: Texture.WHITE });
      map.blendMode = 'add'; glow.blendMode = 'add';
      this.lightRoot.addChildAt(map, this.lightRoot.getChildIndex(this.vig));
      this.glowLayer.addChild(glow);
      s = this.meshes[i] = { geo, map, glow, pos, uv, idx };
    }
    return s;
  }

  /** Lights near a wall become cut shapes, strongest first, up to the budget; the rest are plain discs. */
  private flushLights(): void {
    const order = this.order;
    order.length = 0;
    for (let i = 0; i < this.queued; i++) order.push(this.queue[i]);
    order.sort(strongest);
    let used = 0;
    for (const L of order) {
      const { tex, R } = this.lights.disc(L.r);
      const near = used < MAX_BLOCKED ? nearWalls(this.occ, L.x, L.y, R, this.nearBuf) : null;
      if (!near || !near.length) { this.lights.add(L.x, L.y, L.r, L.col, L.a); this.glow.add(L.x, L.y, L.r, L.col, L.a); continue; }
      const s = this.shape(used++);
      fillShape(s.pos, s.uv, s.idx, L.x, L.y, R, near, this.wallHeight);
      s.geo.getBuffer('aPosition').update();
      s.geo.getBuffer('aUV').update();
      s.geo.getIndex().update();
      const tint = X.hexNum(L.col);
      s.map.texture = tex; s.glow.texture = tex;
      s.map.tint = tint; s.glow.tint = tint;
      s.map.alpha = Math.min(1, L.a * 0.9); s.glow.alpha = Math.min(1, L.a * 0.55);
      s.map.visible = true; s.glow.visible = true;
    }
    for (let i = used; i < this.meshes.length; i++) { this.meshes[i].map.visible = false; this.meshes[i].glow.visible = false; }
  }

  get carry(): number { return this.mood.carry; }
}
