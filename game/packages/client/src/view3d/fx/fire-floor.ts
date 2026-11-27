/**
 * The fire floor in 3D, built to the toon-volume concept (docs/reference/spell-concepts/fire/toon-floor-3.jpg: a low
 * carpet of short flames, like burning oil spilled on the stone, not a campfire), over jets-floor-2.jpg's bed of
 * glowing cracks. It reads the sim's surface grid (fx/from-sim.ts SurfGrid):
 *
 * - **The bed** (a decal): the stone charred dark with a ragged rim, glowing cracks (the painted fire-cracks.png, tiled)
 *   bright under the flames and flickering. When a cell goes out its char stays and fades over CHAR_LIFE.
 * - **The flames**: one low sheet draped over the burning cells whose points rise into tongues (noise rising through it),
 *   cut into toon bands (hot at the base, deep red at the tips) and eroded at its tips and ragged edge; tallest where
 *   the patch is solid. (It was a carpet of painted flame sprites, fire-carpet.png, which read as sprites.)
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
import { ParticleBatch, premulMaterial } from './particles';
import { FX_U } from './stage';
import { FIRE_TEX } from './fire-sheets';
import { HASH, NOISE } from './glsl';
import type { SpellLights } from './lights';

/** Embers rising off a burning cell at once. */
const EMBERS_PER_CELL = 2;
/** Seconds a cell's char lingers after it goes out; seconds a lit cell takes to flare up. */
const CHAR_LIFE = 3, GROW = 0.4;
/** How tall (u) the tongues stand where the patch burns hardest. */
const FLAME_H = 0.95;
/** The cells (u across) the licks and spits are dealt in: at most one tongue in each at a time. */
const LICK_CELL = 1.8;

const FLOOR_HEAD = /* glsl */ `
${CELL_GLSL}
uniform sampler2D uBurn, uAge; uniform float uClock;
vec4 burnAt(float ci) { return texelFetch(uBurn, ivec2(int(mod(ci, 64.0)), int(ci / 64.0)), 0); }
// seconds since burning cell ci (its place in the burning list) was lit
float litFor(float ci) { return texelFetch(uAge, ivec2(int(mod(ci, 64.0)), int(ci / 64.0)), 0).r; }
`;

/**
 * The flames: a low volume of burning gas over the burning cells, ray-marched like the Fire wave (fire-wave.ts), so the
 * patch is the same stuff as the ring (the user on the sheet before it, for the wave: "a solid sheet with holes through
 * it, rather than something composed of gas/plasma"). Tongues rise through it (noise climbing, bent by a slower noise),
 * gathered into clusters that drift slowly, so the charred bed and its glowing cracks show between them; hot at their
 * base, red at their tips. Its height follows each cell's burn: up as a cell flares, down over its last second.
 */
const GAS_STEPS = 24;

const GAS_COMMON = /* glsl */ `
${HASH}
${NOISE}
${CELL_GLSL}
uniform sampler2D uChar; uniform float uClock, uGy, uH;
// the ignition at a ground point, blurred over a cell round it (read raw, each 0.5 u cell flashed as a square)
float ignAt(vec2 xz) {
  float k = 0.0;
  for (int i = 0; i < 5; i++) {
    vec2 o = i == 0 ? vec2(0.0) : vec2(i == 1 ? 0.6 : i == 2 ? -0.6 : 0.0, i == 3 ? 0.6 : i == 4 ? -0.6 : 0.0);
    k += texture(uChar, (xz + o - uSurfDims.xy) / (uSurfDims.z * uSurfSize)).b;
  }
  return k / 5.0;
}
uniform vec3 uBoxC, uBoxH;
`;

const GAS_VERT = /* glsl */ `
${GAS_COMMON}
out vec3 vWorld;
void main() {
  vec3 wp = uBoxC + position * uBoxH;
  vWorld = wp;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;

const GAS_FRAG = /* glsl */ `
#include <packing>
${GAS_COMMON}
uniform sampler2D uDepth; uniform vec2 uRes; uniform float uNear, uFar;
in vec3 vWorld;
out vec4 fxColor;
// 0 hottest .. 1 going out: saturated, as the wave's (fire-wave.ts gasRamp)
vec3 gasRamp(float h) {
  h = clamp(h, 0.0, 1.0);
  vec3 c0 = vec3(3.2, 1.6, 0.08), c1 = vec3(2.5, 0.8, 0.03), c2 = vec3(1.6, 0.3, 0.012), c3 = vec3(0.7, 0.08, 0.01), c4 = vec3(0.12, 0.02, 0.01);
  if (h < 0.2) return mix(c0, c1, h / 0.2);
  if (h < 0.45) return mix(c1, c2, (h - 0.2) / 0.25);
  if (h < 0.7) return mix(c2, c3, (h - 0.45) / 0.25);
  return mix(c3, c4, (h - 0.7) / 0.3);
}
// how hard the patch burns at ground point xz (0..1): its cells' fire, roughened so it never follows the grid
float burnAt(vec2 xz) {
  vec2 guv = (xz - uSurfDims.xy) / (uSurfDims.z * uSurfSize);
  vec4 s = texture(uSurf, guv);
  float life = s.r > 0.01 ? clamp(s.g / s.r, 0.0, 1.0) : 0.0;
  float rough = vnoise3(vec3(xz * 1.7, 5.0)) - 0.5;
  return smoothstep(0.3, 0.85, s.r + rough * 0.45) * texture(uChar, guv).r * mix(0.25, 1.0, life);
}
// licks and spits (the user, take 1: "maybe we should vary some fire effects like we did with the wave. Like some spits
// / licks of fire coming up outside of the effect"): the ground is cut into cells LICK_CELL u across; now and then a
// cell standing in the fire shoots up a tall thin tongue that rises, lets go of the ground and dies. Near the patch's
// edge it leans outward (down the burn's slope), so tongues reach out over the clean stone. Only a sample's own cell
// is looked at, so their number costs nothing; a tongue stays inside its cell.
float lickBase(vec3 p, float y) {
  vec2 cell = floor(p.xz / ${LICK_CELL.toFixed(2)});
  float id = cell.x * 157.0 + cell.y * 311.0;
  float period = 1.1 + 1.3 * rnd(id, 70.0), t = fract(uClock / period + rnd(id, 71.0)) / 0.45;
  if (t > 1.0 || rnd(id + floor(uClock / period + rnd(id, 71.0)) * 17.0, 72.0) > 0.7) return -1.0;
  // kept well inside its cell (it is only ever drawn there: past the cell's edge it would be cut off straight)
  vec2 base = (cell + 0.5 + (vec2(rnd(id, 73.0), rnd(id, 74.0)) - 0.5) * 0.1) * ${LICK_CELL.toFixed(2)};
  float bb = burnAt(base);
  if (bb < 0.35) return -1.0;
  // outward: down the slope of the burn; leaning further the nearer the edge
  vec2 g = vec2(burnAt(base + vec2(0.45, 0.0)) - burnAt(base - vec2(0.45, 0.0)), burnAt(base + vec2(0.0, 0.45)) - burnAt(base - vec2(0.0, 0.45)));
  float edge = clamp(length(g) * 1.4, 0.0, 1.0);
  vec2 out2 = length(g) > 1e-3 ? -normalize(g) : vec2(cos(id), sin(id));
  float H = (1.4 + 1.0 * rnd(id, 75.0)) * bb, lean = 0.1 + 0.3 * edge;
  // up fast, then the foot lifts off and it thins away
  float top = H * min(1.0, t / 0.3), foot = H * smoothstep(0.35, 1.0, t) * 0.9;
  if (y < foot - 0.2 || y > top + 0.2) return -1.0;
  float k = clamp(y / max(H, 0.05), 0.0, 1.0);
  // a wiggle climbing up it, so it licks rather than standing as a column
  vec2 side = vec2(-out2.y, out2.x);
  vec2 c = base + out2 * lean * k * k * ${LICK_CELL.toFixed(2)} * 0.5 + side * sin(y * 4.5 - uClock * 9.0 + id) * 0.09 * k;
  // narrowing to a point at its tip
  float rad = 0.22 * (1.0 - 0.8 * k) * (1.0 - 0.4 * t);
  float s = 1.0 - length(p.xz - c) / rad;
  // falling off steeply outside its radius, so the noise can't swell it past its cell
  if (s < 0.0) s *= 4.0;
  s -= smoothstep(top - 0.3, top + 0.1, y) + (1.0 - smoothstep(foot - 0.2, foot + 0.2, y)) * step(0.01, foot);
  // light enough that the noise tears it
  return s * 0.95 - 0.9 * smoothstep(0.7, 1.0, t);
}
vec2 gas(vec3 p) {
  float y = p.y - uGy;
  float lick = lickBase(p, y);
  float burn = burnAt(p.xz);
  if (burn < 0.02 && lick < -0.5) return vec2(0.0, 1.0);
  vec2 guv = (p.xz - uSurfDims.xy) / (uSurfDims.z * uSurfSize);
  float heatRunes = texture(uSurf, guv).b;
  // ignition (the user, take 2: "more like a flash of ignition across the whole thing"): as a cell lights, its gas
  // flares up tall and hot all at once, then settles into the patch's slow burn
  // (broken by noise, so a cell lighting later as the fire spreads doesn't flare in the grid's square)
  float ig = ignAt(p.xz), ign = sin(3.14159 * clamp(1.0 - ig, 0.0, 1.0)) * step(0.004, ig) * smoothstep(0.25, 0.75, fbm3(vec3(p.xz * 2.2, 11.0)));
  // clusters where the flames gather, drifting slowly; between them only low licks
  float cl = smoothstep(0.45, 0.75, vnoise3(vec3(p.xz * 0.95, uClock * 0.15 + uSeed * 0.01)));
  float tall = max(uH * burn * mix(0.3, 1.0, cl) * (0.85 + 0.3 * heatRunes) * (1.0 + 1.3 * ign), 0.05);
  if (y > tall + 0.35 && lick < -0.5) return vec2(0.0, 1.0);
  // tongues: noise climbing through the gas, bent by a slower noise
  vec3 q = vec3(p.xz * 2.1, y * 1.25 - uClock * 2.3);
  q.xy += (vec2(vnoise3(q * 0.45 + 3.1), vnoise3(q * 0.45 + 7.7)) - 0.5) * 1.0;
  float n = fbm3(q);
  // thick in the clusters, thin between them, so the charred bed and its glowing cracks show through
  float body = burn > 0.02 ? (1.0 - y / tall) * burn * mix(0.3, 1.25, cl) - 0.82 + 0.3 * cl + 0.45 * ign : -1.0;
  float d = max(body, lick) + (n - 0.5) * 1.7;
  if (d <= 0.0) return vec2(0.0, 1.0);
  float heat = 1.0 - clamp(d * 1.5, 0.0, 1.0) + (lick > body ? 0.12 + 0.45 * clamp(y / 1.6, 0.0, 1.0) : 0.38 * clamp(y / tall, 0.0, 1.0));
  // a lick stays orange to red (its dense core would otherwise read as a pale pill)
  if (lick > body) heat = max(heat, 0.4);
  return vec2(d, heat);
}
void main() {
  vec3 ro = cameraPosition, rd = normalize(vWorld - ro);
  vec3 inv = 1.0 / rd, t0 = (uBoxC - uBoxH - ro) * inv, t1 = (uBoxC + uBoxH - ro) * inv;
  vec3 tn = min(t0, t1);
  float tIn = max(max(max(tn.x, tn.y), tn.z), 0.0), tOut = length(vWorld - ro);
  vec3 fwd = -vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
  float scene = -perspectiveDepthToViewZ(texture(uDepth, gl_FragCoord.xy / uRes).r, uNear, uFar);
  tOut = min(tOut, scene / max(dot(rd, fwd), 1e-3));
  if (tOut <= tIn) discard;
  float dt = (tOut - tIn) / ${GAS_STEPS}.0;
  float t = tIn + dt * fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  vec3 col = vec3(0.0); float acc = 0.0;
  for (int i = 0; i < ${GAS_STEPS}; i++) {
    vec2 g = gas(ro + rd * t);
    if (g.x > 0.0) {
      float a = 1.0 - exp(-g.x * 12.0 * dt);
      col += (1.0 - acc) * a * gasRamp(g.y) * smoothstep(0.02, 0.25, g.x);
      acc += (1.0 - acc) * a;
      if (acc > 0.98) break;
    }
    t += dt;
  }
  if (acc < 0.004) discard;
  fxColor = vec4(col, acc);
}`;

/** The gas's box: one draw call (a cube's back faces, placed and sized by uniforms). */
function gasMesh(u: Record<string, THREE.IUniform>): THREE.Mesh {
  const m = premulMaterial(new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: u, vertexShader: GAS_VERT, fragmentShader: GAS_FRAG, side: THREE.BackSide }));
  m.depthTest = false;   // the march stops at the world's depth itself
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), m);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  return mesh;
}

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
float ignAt(vec2 xz) {
  float k = 0.0;
  for (int i = 0; i < 5; i++) {
    vec2 o = i == 0 ? vec2(0.0) : vec2(i == 1 ? 0.6 : i == 2 ? -0.6 : 0.0, i == 3 ? 0.6 : i == 4 ? -0.6 : 0.0);
    k += texture(uChar, (xz + o - uSurfDims.xy) / (uSurfDims.z * uSurfSize)).b;
  }
  return k / 5.0;
}
vec4 decal(vec3 wp) {
  vec2 guv = (wp.xz - uSurfDims.xy) / (uSurfDims.z * uSurfSize);
  vec2 ch = texture(uChar, guv).rg;
  if (ch.g < 0.01) return vec4(0.0);
  vec4 s = texture(uSurf, guv);
  // a fuzzy, ragged rim (the user, round 1: "edges can be a little fuzzier"): two scales of noise, a wide soft ramp
  float n = fbm3(vec3(wp.xz * 1.5, 3.0)), nf = vnoise3(vec3(wp.xz * 6.0, 9.0));
  float m = ch.g + (n - 0.5) * 0.6 + (nf - 0.5) * 0.25;
  float rim = smoothstep(0.1, 0.9, m);
  vec3 cr = texture(uCracks, wp.xz / 3.2).rgb;
  float crack = smoothstep(0.32, 0.85, cr.r) * smoothstep(0.05, 0.4, cr.g + 0.1);
  float life = s.r > 0.01 ? clamp(s.g / s.r, 0.0, 1.0) : 0.0;
  float bed = smoothstep(0.4, 0.95, s.r + (n - 0.5) * 0.4) * ch.r * mix(0.25, 1.0, life);
  float flick = 0.65 + 0.35 * vnoise3(vec3(wp.xz * 2.5, uClock * 2.2));
  // the bed alive between the flames (the user, take 1: "the background looks a bit static where there is no fire"):
  // a dull red underglow beneath the flame clusters (the gas's own cluster noise, same seed), heat moving through the
  // cracks in slow waves, and patches of embers glowing up and dimming
  float cl = smoothstep(0.45, 0.75, vnoise3(vec3(wp.xz * 0.95, uClock * 0.15 + uSeed * 0.01)));
  // heat running through the cracks: two crossing trains of waves, sharpened so the bright bands are narrow and travel
  float w1 = 0.5 + 0.5 * sin(dot(wp.xz, vec2(0.83, 0.56)) * 1.6 - uClock * 2.6 + n * 5.0);
  float w2 = 0.5 + 0.5 * sin(dot(wp.xz, vec2(-0.47, 0.88)) * 1.1 - uClock * 1.9 + n * 3.0);
  float wave = pow(max(w1, w2), 4.0);
  // molten pockets: rare pools of glow that swell and fade, with a speckle of embers round them
  // (layered and bent noise: one octave of value noise cut sharply shows its square lattice)
  vec2 pw = wp.xz * 1.5 + (vec2(vnoise3(vec3(wp.xz * 0.7, 2.0)), vnoise3(vec3(wp.xz * 0.7, 6.0))) - 0.5) * 1.6;
  float pocket = smoothstep(0.56, 0.74, fbm3(vec3(pw, uClock * 0.7 + 4.0)));
  float embers = pocket * (0.55 + 0.45 * vnoise3(vec3(wp.xz * 9.0, uClock * 2.0)));
  // embers twinkling all over the char: fine points flaring up and going dark
  float twinkle = smoothstep(0.78, 0.95, vnoise3(vec3(wp.xz * 14.0, uClock * 3.0))) * smoothstep(0.4, 0.7, vnoise3(vec3(wp.xz * 2.2, uClock * 0.4 + 9.0)));
  float glow = (crack * (0.35 + 2.6 * wave) + 0.04) * flick * bed;
  vec3 charC = cr * 0.06 + vec3(0.008, 0.006, 0.005);
  vec3 glowC = vec3(1.0, 0.38, 0.07) * glow * 1.6 + vec3(0.55, 0.09, 0.02) * cl * bed * 0.9 + vec3(1.5, 0.3, 0.03) * embers * bed * 1.6 + vec3(2.4, 0.8, 0.1) * twinkle * bed * 1.5;
  // the ignition's flash over everything that just lit
  float ign = ignAt(wp.xz) * smoothstep(0.25, 0.75, fbm3(vec3(wp.xz * 2.2, 11.0)));
  glowC += vec3(2.0, 0.65, 0.08) * ign * ign * (0.7 + 0.3 * n);
  // smoky toward the rim: the char's dark thins out into a soot haze rather than ending
  float a = rim * mix(0.55, 0.96, smoothstep(0.35, 0.9, m));
  return vec4(charC * a + glowC, a);
}`;

export class FireFloor {
  readonly group = new THREE.Group();
  readonly bed: GroundDecal;
  /** The flames: a low volume of burning gas (GAS_FRAG), as the wave's; not a sheet, not a carpet of sprites. */
  readonly flames: THREE.Mesh;
  private G: Record<string, THREE.IUniform>;
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
  /** Seconds the most recently lit cell has burned (Infinity when none). */
  private youngest = Infinity;
  /** The sim time of the last frame (-Infinity before the first). */
  private lastT = -Infinity;

  /** `look` and `sheets` are the spike's and are ignored (fire.ts FxLook, FireSheets). */
  constructor(readonly look: string, sheets: unknown, private grid: SurfGrid, seed: number) {
    void sheets;
    this.U = {
      uClock: { value: 0 }, uBurn: { value: grid.burning }, uAge: { value: this.ages }, uSurf: { value: null }, uSurfDims: { value: grid.dims }, uSurfSize: { value: grid.gridSize },
    };
    this.bed = new GroundDecal({ look: BED, uniforms: { ...this.U, uChar: { value: null }, uCracks: { value: FIRE_TEX.cracks } } }, grid.heightAt);
    this.G = { ...this.U, ...FX_U, uSeed: { value: seed }, uChar: { value: null }, uGy: { value: 0 }, uH: { value: FLAME_H }, uBoxC: { value: new THREE.Vector3() }, uBoxH: { value: new THREE.Vector3(1, 1, 1) } };
    this.flames = gasMesh(this.G);
    this.embers = new ParticleBatch({ motion: FLOOR_EMBER, look: LOOK_EMBER, cap: MAX_BURNING * EMBERS_PER_CELL, order: 2, uniforms: this.U });
    this.embers.u.uSeed.value = seed + 7; this.bed.u.uSeed.value = seed;   // the bed's underglow follows the gas's clusters
    this.group.add(this.bed.mesh, this.flames, this.embers.mesh);
  }

  /** Quads drawn this frame. */
  get drawn(): number { return this.embers.count; }

  /** One frame at time t (sim seconds): the grid must have been updated from the sim this frame. */
  update(t: number, lights: SpellLights | null): void {
    const g = this.grid;
    this.U.uClock.value = t; this.U.uSurf.value = g.grid;
    const box = this.noteAges(t);
    this.bed.u.uChar.value = this.char; this.G.uChar.value = this.char;
    this.bed.cover(box);
    this.flames.visible = !!box && g.count > 0;
    if (box) {
      // the gas's box: over everything burning, from the floor to above the tallest tongue
      const cx = (box.x0 + box.x1) / 2, cz = (box.z0 + box.z1) / 2, gy = g.heightAt(cx, cz), H = FLAME_H * 1.5 + 0.4;
      this.G.uGy.value = gy;
      (this.G.uBoxC.value as THREE.Vector3).set(cx, gy + H / 2 - 0.1, cz);
      (this.G.uBoxH.value as THREE.Vector3).set((box.x1 - box.x0) / 2, H / 2, (box.z1 - box.z0) / 2);
    }
    this.embers.count = g.count * EMBERS_PER_CELL;
    this.group.visible = !!box;
    if (!lights || !g.count) return;
    // light: the burning cells binned 3 u square, the biggest few bins each a light at their middle
    const L = g.burning.image.data as Float32Array, bins = new Map<number, [number, number, number, number, number]>();
    for (let i = 0; i < g.count; i++) {
      const c = L[i * 4], gw = g.gridSize.x, x = g.dims.x + ((c % gw) + 0.5) * g.dims.z, z = g.dims.y + (Math.floor(c / gw) + 0.5) * g.dims.z;
      const key = Math.floor(x / 3) * 4096 + Math.floor(z / 3), b = bins.get(key) ?? [0, 0, 0, 0, 0];
      b[0] += x; b[1] += z; b[2] += L[i * 4 + 3]; b[3] += L[i * 4 + 1]; b[4]++; bins.set(key, b);
    }
    // the ignition's flash of light, while the newest cells are still flaring
    if (this.youngest < GROW && box) {
      const cx = (box.x0 + box.x1) / 2, cz = (box.z0 + box.z1) / 2;
      lights.add(cx, g.heightAt(cx, cz) + 1.2, cz, 0xffc070, 9 * (1 - this.youngest / GROW), Math.max(box.x1 - box.x0, box.z1 - box.z0) / 2 + 3);
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
    this.youngest = Infinity;
    for (let i = 0; i < g.count; i++) {
      const c = L[i * 4];
      now.add(c);
      let t0 = this.lit.get(c);
      if (t0 === undefined || t0 > t) { t0 = watching ? t : -1e9; this.lit.set(c, t0); }
      this.out.delete(c);
      A[i * 4] = t - t0;
      this.youngest = Math.min(this.youngest, t - t0);
    }
    for (const [c, t0] of this.lit) if (!now.has(c)) { this.lit.delete(c); if (t0 <= t) this.out.set(c, t); }
    if (!this.lit.size && !this.out.size && this.blank) return null;
    this.blank = !this.lit.size && !this.out.size;
    px.fill(0);
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    // b: the ignition, 1 as a cell lights, gone after GROW (its own channel: read from r, the filtered grid's edges
    // looked freshly lit and flashed)
    const mark = (c: number, grow: number, char: number, ign = 0) => {
      px[c * 4] = Math.round(Math.min(1, grow) * 255); px[c * 4 + 1] = Math.round(char * 255); px[c * 4 + 2] = Math.round(Math.max(0, Math.min(1, ign)) * 255);
      const x = g.dims.x + ((c % gw) + 0.5) * g.dims.z, z = g.dims.y + (Math.floor(c / gw) + 0.5) * g.dims.z;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
    };
    for (const [c, t0] of this.lit) mark(c, (t - t0) / GROW, Math.min(1, 0.35 + (t - t0) / GROW), 1 - (t - t0) / GROW);
    for (const [c, t1] of this.out) {
      const k = (t - t1) / CHAR_LIFE;
      if (k >= 1 || k < 0) { this.out.delete(c); continue; }
      mark(c, 1, 1 - k);
    }
    this.char.needsUpdate = true;
    if (g.count) this.ages.needsUpdate = true;
    return x0 === Infinity ? null : { x0: x0 - 1.5, z0: z0 - 1.5, x1: x1 + 1.5, z1: z1 + 1.5 };
  }

  dispose(): void { this.bed.dispose(); this.flames.geometry.dispose(); (this.flames.material as THREE.Material).dispose(); this.embers.dispose(); this.ages.dispose(); this.char?.dispose(); }
}
