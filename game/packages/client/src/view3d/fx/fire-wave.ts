/**
 * The Fire ring and the Fire burst in 3D: one travelling wave of flame (the user, 2026-11-26: "I think fire ring and fire
 * burst should be the same animation, just segmented"), run round the full circle for the ring (the Area cast on
 * yourself) and across the aimed fan for the burst (the imbued burst, Shift+LMB). Built from the take-2 concepts
 * (docs/reference/spell-concepts/fire/el-story-ring-2.jpg, el-parts-sheet-2.jpg; Spell Effects Review rounds fire-1 and
 * fire-2) and the user's notes on them:
 *
 * - **A hot, defined front and a tapered interior** ("a slightly more defined / hotter wave front and tapered
 *   interior"): flames are born on the front and live about half a second, so the inside burns out behind it.
 * - **The wave sinks past its reach** ("the wave also tapers down, like the frost wave... fine if it tapers a bit
 *   beyond its aoe"): the front slows, runs on about a tenth past the sim's radius, and its flames shrink to nothing.
 * - **Radial scorch, not a ring** ("Scorch marks probably shouldn't be a singular ring since its a radial movement"):
 *   streaks like spokes and soot blotches, fading over a few seconds (the aftermath, duller and still).
 * - **The burst's two ends** ("a little bit more treatment to handle the edges, since a ring doesn't have an edge"):
 *   toward each end the flames get smaller and redder, and a few spill past the fan, so it frays instead of cutting off.
 *
 * Layers, back to front: the ground (a hot line under the front, then the scorch); smoke; the upright ground flames whose
 * tips leave upward (fire-rise.png), standing tallest on the front; the lopsided puffs breaking up from the inside
 * (fire-puff2.png), riding the front; a white flash where it starts. No layer is a solid shape.
 *
 * Sizes and timing are the sim's: the ring's radius from its burst event (SHAPES.novaRadius + novaPerRune a rune), the
 * burst's reach and half-angle from its imbue event (SHAPES.imbueRange...; effects.ts imbue()). The sim hits the whole
 * area at once; the wave takes the Frost ring's speed to get there (ring-shape.ts). The ring follows a caster who walks
 * (ring-shape.ts); the burst stays where it was thrown.
 *
 * Stateless in the kit's sense: every frame is a function of the clock, the event and the kept path.
 */
import * as THREE from 'three';
import { EL, MAX_SEATS, type SpellSpec, type World } from '@wizard-sim/sim';
import { GroundDecal } from './decal';
import { FIRE_TEX, SHEET_GLSL } from './fire-sheets';
import type { SpellLights } from './lights';
import { ParticleBatch } from './particles';
import { PATH_GLSL, RING, RingTracker, centerAt, fillPath, frontR, pathUniform, runesOf, stretchOf, type RingRec } from './ring-shape';

const TAU = Math.PI * 2;

/** Is this spell the Fire ring (drawn here; the stand-ins skip it)? Mixed rings (steam, a healing ring) aren't, yet. */
export const isFireNova = (s: SpellSpec | null | undefined): boolean =>
  !!s && s.shape === 'nova' && (s.look || s.form) === EL.fire && !s.heal && !s.scald && !s.freeze;

/** Is this imbue event (a `move` with text 'imbue') a pure Fire burst? Its element mask holds Fire alone. */
export const isFireBurst = (e: { text?: string; els?: number }): boolean => e.text === 'imbue' && e.els === 1 << EL.fire;

export const FIRE_WAVE = {
  /** Seconds the front takes to reach a three-unit ring (the Frost ring's 0.32, a touch slower: fire rolls). */
  reach: 0.34,
  /** How far past the sim's reach the sinking front runs on, as a share of it. */
  overrun: 0.12,
  /** Seconds the scorch lies after the cast: whole until `scorchHold`, gone by `scorchEnd`. */
  scorchHold: 1.5, scorchEnd: 5.0,
  /** Flames a unit of the front's arc: the puffs riding it and the ground flames standing on it. */
  puffsPerU: 9, risePerU: 8, smokePerU: 1.3,
};

/** Seconds a wave is drawn for, scorch included. */
const lifeOf = (): number => FIRE_WAVE.scorchEnd + 0.1;

/** A burst's or a ring's wave: a ring is a fan of half-angle π. */
interface Wave { rec: RingRec; face: number; half: number; ring: boolean }

const PUFF_CAP = 700, RISE_CAP = 520, SMOKE_CAP = 90;

/** Shared GLSL: where the front is and how tall it stands at a moment, and the fan's edges. */
const WAVE_GLSL = /* glsl */ `
${PATH_GLSL}
uniform float uFace, uHalf, uN, uCount;
// the front's radius when its flames were born at age a: eased out to the reach, then running on, slowing, a little past it
float frontAt(float a) {
  float q = a / uTr;
  if (q <= 1.0) return frontR(a);
  return uR * (1.0 + ${FIRE_WAVE.overrun.toFixed(3)} * (1.0 - exp(-(q - 1.0) * 2.2)));
}
// how tall the wave stands at age a: up at once, sinking from just before the reach to nothing a little past it
float tallAt(float a) { float q = a / uTr; return smoothstep(0.0, 0.1, q) * (1.0 - smoothstep(0.7, 1.75, q)); }
bool isRing() { return uHalf > 3.1; }
// an angle on the fan: anywhere round a ring; on a burst, across the fan and a little past its ends (the fray)
// stratified (k's share of the arc, jittered inside it) so the front has no random gaps or clumps
float angleOf(float k, float s) { float f = (k + rnd(k, s)) / max(uCount, 1.0); return isRing() ? f * 6.2831853 : uFace + (f * 2.0 - 1.0) * uHalf * 1.1; }
// 1 inside the fan, falling to 0 at and past its ends
float edgeOf(float th) { if (isRing()) return 1.0; float d = abs(atan(sin(th - uFace), cos(th - uFace))) / uHalf; return 1.0 - smoothstep(0.82, 1.1, d); }
`;

/** The puffs: lopsided flames born on the front, carried a little further with it, swelling and breaking up from the inside. */
const PUFFS = /* glsl */ `
${WAVE_GLSL}
Particle emitParticle(float k, float back) {
  if (k >= uCount) return P0();
  float th = angleOf(k, 1.0), e = edgeOf(th);
  // neighbours on the arc are born at staggered times, so the front has no holes where a run of them came together
  float tb = (mod(k, 4.0) + rnd(k, 2.0)) * uTr * (1.3 / 4.0);
  float life = (0.22 + 0.14 * rnd(k, 3.0)) * mix(0.7, 1.0, e);
  float a = uAge - back - tb;
  if (a < 0.0 || a > life) return P0();
  // how tall the wave stands now (not when this flame was born), so the whole wave sinks together
  float t = a / life, h = tallAt(uAge - back);
  if (h * mix(0.35, 1.0, e) < 0.001) return P0();
  // on the front as it is now, falling behind it as it ages: the young hot ones outside, the old ones inside, shrinking
  vec2 c = centerAt(uAge - back), d = vec2(cos(th), sin(th));
  float r = max(0.0, frontAt(uAge - back) - 0.06 - 0.65 * t * t);
  float sz = (0.46 + 0.16 * rnd(k, 5.0)) * h * mix(0.45, 1.0, e) * mix(1.0, 0.42, smoothstep(0.15, 1.0, t)) * (0.88 + 0.06 * uN);
  Particle p = P0(); p.alive = true;
  p.pos = vec3(c.x + d.x * r, uGy + sz * 0.7 + 0.3 * smoothstep(0.45, 1.0, t), c.y + d.y * r);
  p.size = sz;
  // flatter, joined heads (no stretch: the kit turns a stretched quad along its motion, undoing its random rotation)
  p.aspect = 0.85 + 0.15 * rnd(k, 10.0);
  p.rot = rnd(k, 6.0) * 6.2832 + t * (rnd(k, 7.0) - 0.5) * 1.2;
  p.col = vec4(t, h, e, tb / uTr);
  p.data = vec4(rnd(k, 8.0), rnd(k, 9.0), 0.0, 0.0);
  return p;
}`;

/** fire-puff2.png: three rows of six frames; hotter on the front and young, redder at the fan's ends. */
const LOOK_PUFF = /* glsl */ `
uniform sampler2D uSheet;
${SHEET_GLSL}
vec4 look(vec2 uv, vec4 col, vec4 data) {
  float t = col.x, h = col.y, e = col.z;
  vec2 q = uv * 0.5 + 0.5; if (data.y > 0.5) q.x = 1.0 - q.x;
  vec3 s = flipbook(uSheet, q, floor(data.x * 3.0), t, 6.0, 3.0).rgb;
  float lum = max(s.r, max(s.g, s.b));
  float m = smoothstep(0.04, 0.3, lum);
  // a hot head on the front, cooling to a red wake as it falls behind
  vec3 c = s * mix(vec3(4.0, 3.0, 1.35), vec3(1.0, 0.3, 0.06), smoothstep(0.08, 0.65, t));
  c *= mix(vec3(1.0, 0.62, 0.45), vec3(1.0), e);
  float fade = smoothstep(0.0, 0.05, t) * (1.0 - smoothstep(0.7, 1.0, t));
  // the wave going down loses cover (it breaks up) rather than shrinking into crumbs
  float cover = m * fade * mix(0.82, 0.28, smoothstep(0.15, 1.0, t)) * e;
  // covering, so the painted flame holds its body on the pale stone instead of washing through
  return vec4(c * cover, cover);
}`;

/** The ground flames: upright, standing on the front, tallest while it's tall; their tips leave upward as they die. */
const RISE = /* glsl */ `
${WAVE_GLSL}
Particle emitParticle(float k, float back) {
  if (k >= uCount) return P0();
  float th = angleOf(k, 21.0), e = edgeOf(th);
  float tb = (mod(k, 4.0) + rnd(k, 22.0)) * uTr * (1.05 / 4.0);
  float life = 0.2 + 0.12 * rnd(k, 23.0);
  float a = uAge - back - tb;
  if (a < 0.0 || a > life) return P0();
  float t = a / life;
  float h = tallAt(uAge - back) * mix(0.3, 1.0, e);
  if (h < 0.001) return P0();
  vec2 c = centerAt(tb), d = vec2(cos(th), sin(th));
  // left where the front passed: the dying wake behind it
  float r = max(0.0, frontAt(tb) - 0.08);
  Particle p = P0(); p.alive = true;
  // its tip leaves upward as it dies
  p.pos = vec3(c.x + d.x * r, uGy - 0.02 + 0.28 * smoothstep(0.45, 1.0, t), c.y + d.y * r);
  p.size = (0.42 + 0.22 * rnd(k, 25.0)) * h * (0.9 + 0.05 * uN) * (1.0 - 0.55 * smoothstep(0.25, 1.0, t));
  p.aspect = 0.75;
  p.rot = (rnd(k, 26.0) - 0.5) * 0.25;
  p.col = vec4(a / life, h, e, 0.0);
  p.data = vec4(rnd(k, 27.0), rnd(k, 28.0), 0.0, 0.0);
  return p;
}`;

/** fire-rise.png: three rows of six frames, each cell standing on its foot (uv.y 0 at the base). */
const LOOK_RISE = /* glsl */ `
uniform sampler2D uSheet;
${SHEET_GLSL}
vec4 look(vec2 uv, vec4 col, vec4 data) {
  float t = col.x, e = col.z;
  vec2 q = vec2(uv.x * 0.5 + 0.5, uv.y); if (data.y > 0.5) q.x = 1.0 - q.x;
  vec3 s = flipbook(uSheet, q, floor(data.x * 3.0), t, 6.0, 3.0).rgb;
  float lum = max(s.r, max(s.g, s.b)), m = smoothstep(0.05, 0.3, lum);
  vec3 c = s * mix(vec3(1.8, 0.95, 0.3), vec3(0.8, 0.24, 0.06), t);
  c *= mix(vec3(1.0, 0.62, 0.45), vec3(1.0), e);
  float cover = m * smoothstep(0.0, 0.08, t) * 0.8 * (1.0 - smoothstep(0.75, 1.0, t)) * col.y * e;
  return vec4(c * cover, cover);
}`;

/** Smoke: a few dark puffs rising off the burnt ground behind the front (the dark the pale floor needs). */
const SMOKE = /* glsl */ `
${WAVE_GLSL}
Particle emitParticle(float k, float back) {
  if (k >= uCount) return P0();
  float th = angleOf(k, 41.0), e = edgeOf(th);
  float tb = (0.15 + rnd(k, 42.0)) * uTr;
  float life = 1.0 + 0.7 * rnd(k, 43.0);
  float a = uAge - back - tb;
  if (a < 0.0 || a > life || e < 0.2) return P0();
  float t = a / life;
  vec2 c = centerAt(tb), d = vec2(cos(th), sin(th));
  float r = frontAt(tb) - 0.3 * rnd(k, 44.0);
  Particle p = P0(); p.alive = true;
  p.pos = vec3(c.x + d.x * r + 0.3 * t * (rnd(k, 45.0) - 0.5), uGy + 0.35 + t * 1.1, c.y + d.y * r);
  p.size = (0.3 + 0.2 * rnd(k, 46.0)) * (0.8 + 1.2 * t) * tallAt(tb * 0.8 + 0.01);
  p.rot = rnd(k, 47.0) * 6.2832 + t * 0.6;
  p.col = vec4(t, e, 0.0, 1.0);
  p.data = vec4(rnd(k, 48.0), rnd(k, 49.0), 0.0, 0.0);
  return p;
}`;

const LOOK_SMOKE = /* glsl */ `
uniform sampler2D uSheet;
${SHEET_GLSL}
vec4 look(vec2 uv, vec4 col, vec4 data) {
  vec2 q = uv * 0.5 + 0.5; if (data.y > 0.5) q.x = 1.0 - q.x;
  float lum = flipbook(uSheet, q, 0.0, col.x, 4.0, 1.0).r, m = smoothstep(0.03, 0.7, lum);
  vec3 c = mix(vec3(0.006, 0.006, 0.007), vec3(0.03, 0.026, 0.022), smoothstep(0.4, 0.95, lum));
  float a = m * 0.36 * col.y * smoothstep(0.0, 0.15, col.x) * (1.0 - smoothstep(0.6, 1.0, col.x));
  return vec4(c * a, a);
}`;

/** The flash where it starts: at the feet for a ring, at the hands for a burst. One soft white-hot billboard. */
const FLASH = /* glsl */ `
${WAVE_GLSL}
Particle emitParticle(float k, float back) {
  float a = uAge - back;
  if (k > 0.5 || a < 0.0 || a > 0.16) return P0();
  vec2 c = centerAt(0.0), d = isRing() ? vec2(0.0) : vec2(cos(uFace), sin(uFace)) * 0.45;
  Particle p = P0(); p.alive = true;
  p.pos = vec3(c.x + d.x, uGy + (isRing() ? 0.25 : 1.0), c.y + d.y);
  p.size = (isRing() ? 1.1 : 0.7) * (0.6 + 2.5 * a);
  p.col = vec4(a / 0.16, 0.0, 0.0, 1.0);
  return p;
}`;

const LOOK_FLASH = /* glsl */ `
vec4 look(vec2 uv, vec4 col, vec4 data) {
  float m = exp(-dot(uv, uv) * 3.0) * (1.0 - col.x);
  return vec4(vec3(3.2, 2.6, 1.8) * m, 0.0);
}`;

/**
 * The ground: a hot line under the front (light, no cover), then where the front has passed, scorch: streaks running
 * out from the centre like spokes and soot blotches, glowing a moment and cooling dark, then fading.
 */
const GROUND = /* glsl */ `
uniform vec2 uC0, uCn;
uniform float uRn, uRmax, uFront, uScorch, uHot, uFace, uHalf, uN;
vec4 decal(vec3 wp) {
  vec2 v = wp.xz - uC0; float d = length(v), th = atan(v.y, v.x);
  float inArc = 1.0;
  if (uHalf < 3.1) inArc = 1.0 - smoothstep(uHalf * 0.75, uHalf * 1.08, abs(atan(sin(th - uFace), cos(th - uFace))));
  vec4 o = vec4(0.0);
  // the hot line on the floor under the front
  float dn = abs(length(wp.xz - uCn) - uRn);
  float sd = length(wp.xz - uCn) - uRn;
  float g = exp(-sd * sd / 0.025) * uFront * inArc;
  o.rgb += vec3(2.2, 0.9, 0.22) * g * 0.65;
  // just behind the front the stone is freshly sooted: a dark band riding inside it (the dark the pale floor needs)
  float band = exp(-pow((sd + 0.45) / 0.4, 2.0)) * uFront * inArc;
  o.a += band * 0.28; o.rgb += vec3(0.05, 0.015, 0.0) * band;
  // scorch where the front has been, ragged at its outer edge, thin near the caster
  float reach = 1.0 - smoothstep(uRmax - 0.45, uRmax + 0.15, d + (vnoise3(vec3(th * 3.0, 0.0, uSeed)) - 0.5) * 0.5);
  float inner = smoothstep(0.35, 1.1, d);
  // bent a little, so the deposits wander like flame tracks instead of ruled spokes
  float bend = (vnoise3(vec3(v * 0.9, uSeed * 0.11)) - 0.5) * 0.22;
  vec2 ring = vec2(cos(th + bend), sin(th + bend));
  // spokes: noise that changes fast round the circle and slowly outward
  float sp = vnoise3(vec3(ring * 6.0, d * 0.75 + uSeed * 0.13));
  // broken into deposits along their length, so they read as laid down by rolling flame, not ruled
  float spokes = smoothstep(0.49, 0.68, sp) * smoothstep(0.32, 0.63, vnoise3(vec3(ring * 11.0, d * 1.8 + uSeed * 0.19)));
  // blotches where the flames sat
  float bl = smoothstep(0.48, 0.72, vnoise3(vec3(wp.xz * 2.4, uSeed * 0.07)));
  float m = clamp(spokes * 0.55 + bl * 0.45, 0.0, 1.0) * reach * inner * inArc;
  float a = m * 0.65 * uScorch;
  o.a += a;
  o.rgb += vec3(0.018, 0.012, 0.008) * a;
  // a moment of glow in the fresh scorch, cooling
  o.rgb += vec3(1.3, 0.4, 0.08) * m * uHot * 0.12;
  return o;
}`;

/** One wave's drawing (pooled). */
class Slot {
  readonly group = new THREE.Group();
  readonly puffs: ParticleBatch;
  readonly rise: ParticleBatch;
  readonly smoke: ParticleBatch;
  readonly flash: ParticleBatch;
  readonly ground: GroundDecal;
  readonly P = {
    uPath: { value: pathUniform() },
    uAge: { value: 0 }, uR: { value: 3 }, uTr: { value: 0.34 }, uR0: { value: RING.r0 }, uH: { value: 1 }, uGy: { value: 0 },
    uFace: { value: 0 }, uHalf: { value: Math.PI }, uN: { value: 1 },
  };
  readonly D = {
    uC0: { value: new THREE.Vector2() }, uCn: { value: new THREE.Vector2() }, uRn: { value: 0 }, uRmax: { value: 0 },
    uFront: { value: 0 }, uScorch: { value: 0 }, uHot: { value: 0 }, uFace: this.P.uFace, uHalf: this.P.uHalf, uN: this.P.uN,
  };
  wave: Wave | null = null;
  private covered = '';

  constructor() {
    const batch = (motion: string, look: string, cap: number, order: number, extra: Record<string, THREE.IUniform>, upright = false, soft = 0.3) =>
      new ParticleBatch({ motion, look, cap, order, soft, upright, uniforms: { ...this.P, uCount: { value: 0 }, ...extra } });
    this.ground = new GroundDecal({ look: GROUND, uniforms: this.D, order: -1, step: 0.25 });
    this.smoke = batch(SMOKE, LOOK_SMOKE, SMOKE_CAP, 1, { uSheet: { value: FIRE_TEX.smokeburn } }, false, 0.5);
    this.rise = batch(RISE, LOOK_RISE, RISE_CAP, 2, { uSheet: { value: FIRE_TEX.rise } }, true, 0.15);
    this.puffs = batch(PUFFS, LOOK_PUFF, PUFF_CAP, 3, { uSheet: { value: FIRE_TEX.puff2 } });
    this.flash = batch(FLASH, LOOK_FLASH, 1, 4, {}, false, 0.6);
    this.group.add(this.ground.mesh, this.smoke.mesh, this.rise.mesh, this.puffs.mesh, this.flash.mesh);
  }

  /** Draw wave `w` at age `age` s; `heightAt` reads the floor (sim x, y). Returns the light's strength (0: none). */
  draw(w: Wave, age: number, heightAt: (x: number, y: number) => number): number {
    const r = w.rec;
    if (this.wave !== w) { this.wave = w; this.covered = ''; }
    const n = w.ring ? runesOf(r.r) : Math.max(1, Math.min(5, 1 + Math.round((r.r - 2.5) / 0.6)));
    const Tr = FIRE_WAVE.reach * stretchOf(r.r), q = age / Tr;
    const gy = heightAt(r.x, r.y);
    for (const b of [this.puffs, this.rise, this.smoke, this.flash, this.ground]) b.u.uSeed.value = r.seed;
    if (w.ring) fillPath(this.P.uPath.value, r); else for (const v of this.P.uPath.value) v.set(r.x, r.y);
    this.P.uAge.value = age; this.P.uR.value = r.r; this.P.uTr.value = Tr; this.P.uGy.value = gy;
    this.P.uFace.value = w.face; this.P.uHalf.value = w.half; this.P.uN.value = n;
    // flames per unit of the front's arc
    const arc = (w.ring ? TAU : 2 * w.half * 1.1) * r.r;
    const count = (b: ParticleBatch, per: number, cap: number, on: boolean) => {
      b.mesh.visible = on;
      b.u.uCount.value = Math.min(cap, Math.round(arc * per * (0.85 + 0.08 * n)));
      b.count = cap;
    };
    count(this.puffs, FIRE_WAVE.puffsPerU, PUFF_CAP, q < 1.3 + 1.1 / Tr);
    count(this.rise, FIRE_WAVE.risePerU, RISE_CAP, q < 1.25 + 0.6 / Tr);
    count(this.smoke, FIRE_WAVE.smokePerU, SMOKE_CAP, age < Tr * 1.2 + 1.8);
    this.flash.count = 1; this.flash.mesh.visible = age < 0.17;
    // the ground: the hot line under the front, then the scorch
    const qq = Math.min(1, q), Rn = q <= 1 ? frontR(r.r, qq) : r.r * (1 + FIRE_WAVE.overrun * (1 - Math.exp(-(q - 1) * 2.2)));
    const [cx, cy] = w.ring ? centerAt(r, age) : [r.x, r.y];
    this.D.uC0.value.set(r.x, r.y); this.D.uCn.value.set(cx, cy); this.D.uRn.value = Rn; this.D.uRmax.value = Rn;
    const front = Math.min(1, q * 6) * (1 - Math.min(1, Math.max(0, (q - 0.85) / 0.45)));
    this.D.uFront.value = front;
    this.D.uHot.value = Math.exp(-Math.max(0, age - Tr * 0.5) * 2.2) * Math.min(1, q * 2);
    this.D.uScorch.value = Math.min(1, q * 1.5) * (1 - Math.min(1, Math.max(0, (age - FIRE_WAVE.scorchHold) / (FIRE_WAVE.scorchEnd - FIRE_WAVE.scorchHold))));
    const pad = r.r * (1 + FIRE_WAVE.overrun) + 1.5, key = `${r.tick}:${r.who}:${w.ring}`;
    if (this.covered !== key) { this.covered = key; this.ground.heightAt = heightAt; this.ground.cover({ x0: r.x - pad, z0: r.y - pad, x1: r.x + pad, z1: r.y + pad }); }
    this.group.visible = true;
    return front;
  }

  hide(): void { this.group.visible = false; this.wave = null; }

  dispose(): void { for (const d of [this.puffs, this.rise, this.smoke, this.flash, this.ground]) d.dispose(); }
}

/** Every Fire ring and Fire burst in the world. */
export class FireWaves {
  readonly group = new THREE.Group();
  private readonly rings = new RingTracker(isFireNova, lifeOf);
  /** Bursts don't follow anyone: kept as plain records with their face and half-angle. */
  private bursts: Wave[] = [];
  private ringWaves = new Map<RingRec, Wave>();
  private slots: Slot[] = [];
  /** The floor's height (u) under sim point (x, y). */
  heightAt: (x: number, y: number) => number = () => 0;

  /** After each sim step (shown or replayed): new rings and bursts, and every ring's caster's spot this tick. */
  afterStep(w: World): void {
    this.rings.afterStep(w);
    const tick = w.clock[0];
    for (const e of w.events) {
      if (e.kind !== 'move' || !isFireBurst(e) || e.who < 0 || e.who >= MAX_SEATS) continue;
      if (this.bursts.some((b) => b.rec.tick === tick && b.rec.who === e.who)) continue;
      const face = Math.atan2((e.y2 ?? e.y) - e.y, (e.x2 ?? e.x) - e.x);
      this.bursts.push({ rec: { tick, who: e.who, x: e.x, y: e.y, r: e.amount ?? 2.5, seed: (tick * 37 + e.who * 11) % 9973, path: [] }, face, half: (e.half ?? 0.17) * TAU, ring: false });
    }
    this.bursts = this.bursts.filter((b) => (tick - b.rec.tick) / 60 < lifeOf() + 0.1);
  }

  /** A rewind put the world back to `tick`: waves cast after it go. */
  rewind(tick: number): void {
    this.rings.rewind(tick);
    this.bursts = this.bursts.filter((b) => b.rec.tick <= tick);
  }

  /** Draw every live wave at time t (s, the sim clock). */
  update(t: number, lights: SpellLights | null): void {
    const live: Wave[] = [];
    for (const r of this.rings.live(t)) {
      let wv = this.ringWaves.get(r);
      if (!wv) { wv = { rec: r, face: 0, half: Math.PI, ring: true }; this.ringWaves.set(r, wv); }
      live.push(wv);
    }
    for (const k of this.ringWaves.keys()) if (!this.rings.recs.includes(k)) this.ringWaves.delete(k);
    for (const b of this.bursts) { const a = t - b.rec.tick / 60; if (a >= 0 && a <= lifeOf()) live.push(b); }
    live.sort((a, b) => b.rec.tick - a.rec.tick);
    while (this.slots.length < live.length && this.slots.length < 8) { const s = new Slot(); this.slots.push(s); this.group.add(s.group); }
    this.slots.forEach((s, i) => {
      const wv = live[i];
      if (!wv) { s.hide(); return; }
      const age = t - wv.rec.tick / 60, front = s.draw(wv, age, this.heightAt);
      if (!lights) return;
      const r = wv.rec, [cx, cy] = wv.ring ? centerAt(r, age) : [r.x, r.y];
      if (age < 0.12) lights.add(cx, this.heightAt(cx, cy) + 0.9, cy, 0xffd9a0, age < 0.05 ? 6 : 3.5, r.r + 2);
      if (front > 0) {
        // the light rides the front: on a burst, out along the aim
        const R = s.D.uRn.value * (wv.ring ? 0 : 0.7), lx = cx + Math.cos(wv.face) * R, ly = cy + Math.sin(wv.face) * R;
        lights.add(lx, this.heightAt(lx, ly) + 0.8, ly, 0xff8a30, 3.2 * front, r.r + 2.5);
      }
    });
  }

  /** Forget every wave (a lab drawing another world). */
  reset(): void { this.rings.reset(); this.bursts = []; this.ringWaves.clear(); for (const s of this.slots) s.hide(); }

  dispose(): void { for (const s of this.slots) s.dispose(); }
}
