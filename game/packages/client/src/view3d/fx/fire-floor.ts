/**
 * The fire floor in 3D, built to the toon-volume concept (docs/reference/spell-concepts/fire/toon-floor-3.jpg: a low
 * carpet of short flames, like burning oil spilled on the stone, not a campfire), over jets-floor-2.jpg's bed of
 * glowing cracks. It reads the sim's surface grid (fx/from-sim.ts SurfGrid):
 *
 * - **The bed** (a decal): the stone charred dark with a ragged rim, glowing cracks (the painted fire-cracks.png, tiled)
 *   bright under the flames and flickering. When a cell goes out its char stays and fades over CHAR_LIFE.
 * - **The carpet**: three low clusters of short flames (the painted fire-carpet.png) standing on every burning cell,
 *   overlapping; tallest where the patch is solid, lower, sparser and redder at its ragged edge.
 * - **Embers** rising.
 *
 * Its life: a cell flares up over its first ~0.4 s (grow-in), burns, then over its last second (the sim's FLOOR_FADE)
 * the flames sink into the bed and the cracks dim, and its char lingers after.
 *
 * **A cell's age.** The sim keeps only a burning cell's life left (and its starting life depends on the caster's
 * linger, so it can't be worked back). The view notes the sim time it first saw each cell burning, and the time it saw
 * one go out; both are sim times (w.clock), so a frozen frame, a replay or a rewind draws the same: a note later than
 * the clock is dropped and noted again from the next sim state. A floor already burning when the view starts grows in
 * once.
 */
import * as THREE from 'three';
import { CELL_GLSL, MAX_BURNING, type SurfGrid } from './from-sim';
import { GroundDecal } from './decal';
import { ParticleBatch } from './particles';
import { FIRE_TEX, SHEET_GLSL } from './fire-sheets';
import type { SpellLights } from './lights';

/** Flame clusters standing on a burning cell at once, and embers rising off it. */
const PER_CELL = 3, EMBERS_PER_CELL = 2;
/** Seconds a cell's char lingers after it goes out; seconds a lit cell takes to flare up. */
const CHAR_LIFE = 3, GROW = 0.4;

const FLOOR_HEAD = /* glsl */ `
${CELL_GLSL}
uniform sampler2D uBurn, uAge; uniform float uClock;
vec4 burnAt(float ci) { return texelFetch(uBurn, ivec2(int(mod(ci, 64.0)), int(ci / 64.0)), 0); }
// seconds since burning cell ci (its place in the burning list) was lit
float litFor(float ci) { return texelFetch(uAge, ivec2(int(mod(ci, 64.0)), int(ci / 64.0)), 0).r; }
`;

const CARPET = /* glsl */ `${FLOOR_HEAD}
Particle emitParticle(float slot, float back) {
  float ci = floor(slot / ${PER_CELL}.0), j = slot - ci * ${PER_CELL}.0;
  vec4 B = burnAt(ci);
  float cell = B.x, life = 0.7 + 0.35 * rnd(cell * 3.0 + j, 91.0), ph = rnd(cell * 3.0 + j, 90.0);
  float kk = floor(uClock / life + ph), age = (uClock - back - (kk - ph) * life) / life;
  if (back > 0.0) age = max(age, 0.0);
  if (age < 0.0 || age >= 1.0) return P0();
  float id = kk * 4099.0 + cell * 3.0 + j;
  vec3 c = cellAt(cell, B.w);
  Particle p = P0(); p.alive = true;
  p.pos = c + vec3((rnd(id, 1.0) - 0.5) * 0.9, 0.0, (rnd(id, 2.0) - 0.5) * 0.9);
  // solid in the middle of a patch, low and ragged at its edge (some edge flames missing)
  float inner = smoothstep(0.45, 0.98, surfAt(p.pos.xz).r);
  if (inner < 0.25 && rnd(id, 10.0) < 0.35) return P0();
  float grow = smoothstep(0.0, ${GROW.toFixed(2)}, litFor(ci) - rnd(cell, 8.0) * 0.12);
  float h = (0.2 + 0.42 * inner + 0.3 * rnd(id, 3.0) * rnd(id, 11.0)) * (0.85 + 0.3 * B.z) * mix(0.15, 1.0, B.y) * grow;
  p.size = 0.5 * h * (0.6 + 0.4 * sin(3.14159 * pow(age, 0.7)));
  p.aspect = 1.1 + 0.5 * rnd(id, 4.0);
  p.rot = sin(uClock * 2.1 + cell * 0.37) * 0.1 + (rnd(id, 5.0) - 0.5) * 0.16;
  p.col = vec4(age, inner, B.y, smoothstep(0.0, 0.15, age) * smoothstep(1.0, 0.75, age));
  p.data = vec4(rnd(id, 6.0), rnd(id, 7.0), 0.0, 0.0);
  return p;
}`;

const FLOOR_EMBER = /* glsl */ `${FLOOR_HEAD}
Particle emitParticle(float slot, float back) {
  float ci = floor(slot / ${EMBERS_PER_CELL}.0), j = slot - ci * ${EMBERS_PER_CELL}.0;
  vec4 B = burnAt(ci);
  float cell = B.x, life = 1.1, rate = 1.3, ph = rnd(cell, 80.0) * 2.0;
  float kk = floor(uClock * rate + ph) - j, ts = (kk - ph) / rate, age = (uClock - back - ts) / life;
  if (back > 0.0) age = max(age, 0.0);
  if (age < 0.0 || age >= 1.0 || rnd(kk * 4099.0 + cell, 9.0) > 0.4 * B.y) return P0();
  float id = kk * 4099.0 + cell;
  Particle p = P0(); p.alive = true;
  p.pos = cellAt(cell, B.w) + vec3((rnd(id, 1.0) - 0.5) * 0.5 + sin(age * 6.0 + kk) * 0.15 + age * 0.25, 0.3 + age * 1.6, (rnd(id, 2.0) - 0.5) * 0.5);
  p.size = 0.026; p.stretch = 0.05;
  p.col = vec4(0.1 + age * 0.4, 0.0, age, 1.0 - age);
  return p;
}`;

/** One painted cluster (its cell from data.x), its base on the quad's base, redder at the patch's edge and as it dies. */
const LOOK_CARPET = /* glsl */ `
uniform sampler2D uSheet;
${SHEET_GLSL}
vec4 look(vec2 uv, vec4 col, vec4 data) {
  vec3 t = sheetCell(uSheet, vec2(uv.x * 0.5 + 0.5, uv.y), data.x, data.y, 4.0, 4.0);
  float lum = max(t.r, max(t.g, t.b)), a = smoothstep(0.05, 0.4, lum);
  vec3 tint = mix(vec3(1.25, 0.7, 0.5), vec3(1.9, 1.6, 1.25), col.y * col.z);
  return vec4(t * tint * 1.2, a * 0.95) * col.w;
}`;

/** An ember (as the spray's). */
const LOOK_EMBER = /* glsl */ `
vec4 look(vec2 uv, vec4 col, vec4 data) {
  float m = smoothstep(1.0, 0.3, length(uv));
  return vec4(fireRamp(col.x) * 0.9 * m, m * 0.9) * col.w;
}`;

/**
 * The bed: char (uChar g: 1 burning, fading after it goes out) with a ragged rim; under the flames, the painted cracks
 * glow, brightest in the patch's middle, flickering, coming up as the cell flares (uChar r) and dimming as it dies.
 */
const BED = /* glsl */ `
${CELL_GLSL}
uniform sampler2D uChar, uCracks; uniform float uClock;
vec4 decal(vec3 wp) {
  vec2 guv = (wp.xz - uSurfDims.xy) / (uSurfDims.z * uSurfSize);
  vec2 ch = texture(uChar, guv).rg;
  if (ch.g < 0.01) return vec4(0.0);
  vec4 s = texture(uSurf, guv);
  float n = fbm3(vec3(wp.xz * 1.5, 3.0));
  float m = ch.g + (n - 0.5) * 0.7;
  float rim = smoothstep(0.12, 0.5, m);
  vec3 cr = texture(uCracks, wp.xz / 3.2).rgb;
  float crack = smoothstep(0.32, 0.85, cr.r) * smoothstep(0.05, 0.4, cr.g + 0.1);
  float life = s.r > 0.01 ? clamp(s.g / s.r, 0.0, 1.0) : 0.0;
  float bed = smoothstep(0.4, 0.95, s.r + (n - 0.5) * 0.4) * ch.r * mix(0.25, 1.0, life);
  float flick = 0.65 + 0.35 * vnoise3(vec3(wp.xz * 2.5, uClock * 2.2));
  float glow = (crack * 1.1 + 0.3) * flick * bed;
  vec3 charC = cr * 0.12 + vec3(0.012, 0.008, 0.007);
  vec3 glowC = vec3(1.0, 0.38, 0.07) * glow * 1.6;
  float a = rim * 0.88;
  return vec4(charC * a + glowC, a);
}`;

export class FireFloor {
  readonly group = new THREE.Group();
  readonly bed: GroundDecal;
  private carpet: ParticleBatch;
  private embers: ParticleBatch;
  private U: Record<string, THREE.IUniform>;
  /** Seconds each burning cell (in the burning list's order) has been lit. */
  private ages = new THREE.DataTexture(new Float32Array(MAX_BURNING * 4), 64, 64, THREE.RGBAFormat, THREE.FloatType);
  /** Per grid cell: r how far it has flared up (0..1), g its char (1 while burning, fading after). */
  private char: THREE.DataTexture | null = null;
  /** Sim time each burning cell was first seen lit, and each gone-out cell went out. */
  private lit = new Map<number, number>();
  private out = new Map<number, number>();
  /** The char texture is all zero (nothing to upload until a cell lights). */
  private blank = false;
  /** The sim time of the last frame (-Infinity before the first). */
  private lastT = -Infinity;

  /** `look` and `sheets` are the spike's and are ignored (fire.ts FxLook, FireSheets). */
  constructor(readonly look: string, sheets: unknown, private grid: SurfGrid, seed: number) {
    void sheets;
    this.U = {
      uClock: { value: 0 }, uBurn: { value: grid.burning }, uAge: { value: this.ages }, uSurf: { value: null }, uSurfDims: { value: grid.dims }, uSurfSize: { value: grid.gridSize },
    };
    this.bed = new GroundDecal({ look: BED, uniforms: { ...this.U, uChar: { value: null }, uCracks: { value: FIRE_TEX.cracks } } }, grid.heightAt);
    this.carpet = new ParticleBatch({
      motion: CARPET, look: LOOK_CARPET, cap: MAX_BURNING * PER_CELL, upright: true, soft: 0.12, order: 1,
      uniforms: { ...this.U, uSheet: { value: FIRE_TEX.carpet } },
    });
    this.embers = new ParticleBatch({ motion: FLOOR_EMBER, look: LOOK_EMBER, cap: MAX_BURNING * EMBERS_PER_CELL, order: 2, uniforms: this.U });
    this.carpet.u.uSeed.value = seed; this.embers.u.uSeed.value = seed + 7; this.bed.u.uSeed.value = seed + 3;
    this.group.add(this.bed.mesh, this.carpet.mesh, this.embers.mesh);
  }

  /** Quads drawn this frame. */
  get drawn(): number { return this.carpet.count + this.embers.count; }

  /** One frame at time t (sim seconds): the grid must have been updated from the sim this frame. */
  update(t: number, lights: SpellLights | null): void {
    const g = this.grid;
    this.U.uClock.value = t; this.U.uSurf.value = g.grid;
    const box = this.noteAges(t);
    this.bed.u.uChar.value = this.char;
    this.bed.cover(box);
    this.carpet.count = g.count * PER_CELL; this.embers.count = g.count * EMBERS_PER_CELL;
    this.group.visible = !!box;
    if (!lights || !g.count) return;
    // light: the burning cells binned 3 u square, the biggest few bins each a light at their middle
    const L = g.burning.image.data as Float32Array, bins = new Map<number, [number, number, number, number, number]>();
    for (let i = 0; i < g.count; i++) {
      const c = L[i * 4], gw = g.gridSize.x, x = g.dims.x + ((c % gw) + 0.5) * g.dims.z, z = g.dims.y + (Math.floor(c / gw) + 0.5) * g.dims.z;
      const key = Math.floor(x / 3) * 4096 + Math.floor(z / 3), b = bins.get(key) ?? [0, 0, 0, 0, 0];
      b[0] += x; b[1] += z; b[2] += L[i * 4 + 3]; b[3] += L[i * 4 + 1]; b[4]++; bins.set(key, b);
    }
    for (const b of [...bins.values()].sort((p, q) => q[4] - p[4]).slice(0, 4)) {
      const k = b[4], flick = 0.85 + 0.15 * Math.sin(t * 13 + b[0]) * Math.sin(t * 5.1 + b[1]);
      lights.add(b[0] / k, b[2] / k + 1.0, b[1] / k, 0xff8030, Math.min(5, 0.08 * k) * (b[3] / k) * flick, 6);
    }
  }

  /**
   * Notes when each cell lit and went out (see the file's docblock), fills the ages and char textures, and returns the
   * box round everything still drawn (burning or charred), or null.
   */
  private noteAges(t: number): { x0: number; z0: number; x1: number; z1: number } | null {
    const g = this.grid, gw = g.gridSize.x, gh = g.gridSize.y, L = g.burning.image.data as Float32Array, A = this.ages.image.data as Float32Array;
    if (!gw || !gh) return null;
    if (!this.char || this.char.image.width !== gw || this.char.image.height !== gh) {
      this.char?.dispose();
      this.char = new THREE.DataTexture(new Uint8Array(gw * gh * 4), gw, gh, THREE.RGBAFormat);
      this.char.magFilter = this.char.minFilter = THREE.LinearFilter;
      this.lit.clear(); this.out.clear(); this.blank = false;
    }
    // a cell new since the last frame just lit; one the view finds after a gap (its first frame, a frozen shot, a jump)
    // has been burning a while, and is drawn grown
    const watching = t >= this.lastT && t - this.lastT <= 0.25;
    this.lastT = t;
    const px = this.char.image.data as Uint8Array, now = new Set<number>();
    for (let i = 0; i < g.count; i++) {
      const c = L[i * 4];
      now.add(c);
      let t0 = this.lit.get(c);
      if (t0 === undefined || t0 > t) { t0 = watching ? t : -1e9; this.lit.set(c, t0); }
      this.out.delete(c);
      A[i * 4] = t - t0;
    }
    for (const [c, t0] of this.lit) if (!now.has(c)) { this.lit.delete(c); if (t0 <= t) this.out.set(c, t); }
    if (!this.lit.size && !this.out.size && this.blank) return null;
    this.blank = !this.lit.size && !this.out.size;
    px.fill(0);
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    const mark = (c: number, grow: number, char: number) => {
      px[c * 4] = Math.round(Math.min(1, grow) * 255); px[c * 4 + 1] = Math.round(char * 255);
      const x = g.dims.x + ((c % gw) + 0.5) * g.dims.z, z = g.dims.y + (Math.floor(c / gw) + 0.5) * g.dims.z;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
    };
    for (const [c, t0] of this.lit) mark(c, (t - t0) / GROW, Math.min(1, 0.35 + (t - t0) / GROW));
    for (const [c, t1] of this.out) {
      const k = (t - t1) / CHAR_LIFE;
      if (k >= 1 || k < 0) { this.out.delete(c); continue; }
      mark(c, 1, 1 - k);
    }
    this.char.needsUpdate = true;
    if (g.count) this.ages.needsUpdate = true;
    return x0 === Infinity ? null : { x0: x0 - 1.5, z0: z0 - 1.5, x1: x1 + 1.5, z1: z1 + 1.5 };
  }

  dispose(): void { this.bed.dispose(); this.carpet.dispose(); this.embers.dispose(); this.ages.dispose(); this.char?.dispose(); }
}
