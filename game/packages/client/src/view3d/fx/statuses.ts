/**
 * What hangs off a body with a status: the 3D port of the pixel game's status pass (art/vfx.ts `statuses`, the shapes
 * in art/kit.ts burningFx, chilled, iceGlints, shockSparks, drips). The study (docs/explorations/2026-11-25-spell-
 * effects-study.md) found half of each pixel spell's effect is on the bodies it reaches; the models showed only a tint.
 *
 * - Burning: the burning gas of the Fire wave and patch clinging to the body (fx/body-burn.ts; the pixel port's licks,
 *   teardrop sprites re-rolled 14 times a second, read as sprites beside it), and embers peeling off and rising; an
 *   orange light on the body.
 * - Chilled: white glints twinkling on the body (more as the chill builds) and cold breath sinking off the head.
 * - Frozen: slower, bigger glints on the ice; a pale light.
 * - Stunned: short sparks re-rolled 20 times a second, skipping every third frame.
 * - Wet: drips running off to the ground.
 *
 * One batch per layer, `PER` quads a body; each quad reads its body from uniform arrays filled each frame (where it's
 * drawn, its height, its statuses), and everything else is a function of the clock and a seed, as the kit's particles
 * are, so frozen frames and rollback draw it exactly.
 */
import * as THREE from 'three';
import { type World } from '@wizard-sim/sim';
import { ParticleBatch } from './particles';
import { BodyBurn } from './body-burn';
import { type SpellLights } from './lights';
import { bodyHeight } from '../hud-marks';

/** Bodies with a status drawn at once (the rest wait; the pixel game draws all, but a screen rarely has more). */
const MAX = 40;

const COMMON = /* glsl */ `
uniform vec4 uP[${MAX}];   // x, ground, z (sim y), drawn height
uniform vec4 uS[${MAX}];   // burn 0..1, chill 0..1, frozen 0/1, stunned 0/1
uniform vec4 uS2[${MAX}];  // wet 0/1, radius, seed, flare 0..1 (Burn going off: fx/body-burn.ts)
uniform float uClock; uniform float uN;
vec3 toCam(vec3 at) { vec2 d = cameraPosition.xz - at.xz; float l = length(d); return l > 1e-4 ? vec3(d.x / l, 0.0, d.y / l) : vec3(0.0, 0.0, 1.0); }
// a point on the body's surface: angle a round from the camera side, at height hy
vec3 onBody(int i, float a, float hy, float out_) { vec4 P = uP[i]; vec3 c = toCam(P.xyz), s = vec3(-c.z, 0.0, c.x); return P.xyz + vec3(0.0, hy, 0.0) + (c * cos(a) + s * sin(a)) * uS2[i].y * out_; }
`;

/** Embers: a stream per burning body, peeling off its sides and rising. */
const EMBERS = (per: number) => /* glsl */ `
${COMMON}
Particle emitParticle(float slot, float back) {
  float b = floor(slot / ${per}.0), j = slot - b * ${per}.0;
  if (b >= uN) return P0();
  int i = int(b); vec4 P = uP[i]; float k = uS[i].x, seed = uS2[i].z, rad = uS2[i].y;
  if (k < 0.05) return P0();
  float rate = 14.0, life = 0.55, ph = rnd(seed, 8.0);
  float kk = floor(uClock * rate + ph) - j, ts = (kk - ph) / rate, age = (uClock - back - ts) / life;
  if (back > 0.0) age = max(age, 0.0);
  float id = kk * 31.0 + seed;
  if (age < 0.0 || age >= 1.0 || rnd(id, 9.0) > k + 0.2) return P0();
  vec3 c = toCam(P.xyz), s = vec3(-c.z, 0.0, c.x);
  Particle p = P0(); p.alive = true;
  p.pos = P.xyz + c * rad * 0.5 + s * (rnd(id, 1.0) - 0.5) * rad * 2.0
        + vec3(sin(age * 7.0 + kk) * 0.07, P.w * (0.25 + 0.45 * rnd(id, 2.0)) + age * life * 1.9, 0.0);
  p.size = 0.03; p.stretch = 0.04;
  p.col = vec4(0.15 + age * 0.75, 0.0, 0.0, 1.0 - age);
  return p;
}`;

const LOOK_EMBER = /* glsl */ `
vec4 look(vec2 uv, vec4 col, vec4 data) {
  float m = smoothstep(1.0, 0.3, length(uv));
  return vec4(fireRamp(col.x) * 1.1 * m, m * 0.85) * col.w;
}`;

/** Glints: twinkles on a chilled body (kit.ts chilled), slower and bigger on a frozen one (iceGlints). */
const GLINTS = (per: number) => /* glsl */ `
${COMMON}
Particle emitParticle(float slot, float back) {
  float b = floor(slot / ${per}.0), j = slot - b * ${per}.0;
  if (b >= uN) return P0();
  int i = int(b); vec4 P = uP[i], S = uS[i]; float seed = uS2[i].z;
  bool frozen = S.z > 0.5; float g = frozen ? 1.0 : S.y;
  if (g < 0.05) return P0();
  float rate = frozen ? 1.1 : 1.7, sh = uClock * rate + j * 0.37 + seed * 0.13, ph = fract(sh), cyc = floor(sh);
  if (ph > 0.3 || rnd(cyc * 7.0 + j + seed * 13.0, 31.0) > g) return P0();
  Particle p = P0(); p.alive = true;
  p.pos = onBody(i, (rnd(cyc + j * 5.0, 32.0) - 0.5) * 2.4, P.w * (0.15 + 0.8 * rnd(cyc + j * 5.0, 33.0)), 1.4);
  // stepped, as the pixel glint: a full star for the first half of its life, then a dot
  p.size = (ph < 0.15 ? 0.17 : 0.08) * (frozen ? 1.35 : 1.0);
  p.col = vec4(1.0);
  return p;
}`;

const LOOK_GLINT = /* glsl */ `
vec4 look(vec2 uv, vec4 col, vec4 data) {
  float x = abs(uv.x), y = abs(uv.y);
  float star = max(exp(-x * 12.0) * (1.0 - y), exp(-y * 12.0) * (1.0 - x));
  float core = smoothstep(0.3, 0.0, length(uv));
  vec3 c = mix(vec3(0.7, 1.4, 2.0), vec3(3.2, 3.4, 3.6), core);
  float a = clamp(star + core, 0.0, 1.0);
  return vec4(c * a, a * 0.5);
}`;

/** Cold breath: pale puffs sinking off a chilled body's head (kit.ts chilled, its mist). */
const MIST = (per: number) => /* glsl */ `
${COMMON}
Particle emitParticle(float slot, float back) {
  float b = floor(slot / ${per}.0), j = slot - b * ${per}.0;
  if (b >= uN) return P0();
  int i = int(b); vec4 P = uP[i], S = uS[i]; float seed = uS2[i].z, rad = uS2[i].y;
  float k = S.z > 0.5 ? 0.0 : S.y;
  if (k < 0.05) return P0();
  float rate = 4.0, life = 1.1, ph = rnd(seed, 18.0);
  float kk = floor(uClock * rate + ph) - j, ts = (kk - ph) / rate, age = (uClock - back - ts) / life;
  if (back > 0.0) age = max(age, 0.0);
  float id = kk * 29.0 + seed;
  if (age < 0.0 || age >= 1.0 || rnd(id, 19.0) > k) return P0();
  vec3 c = toCam(P.xyz), s = vec3(-c.z, 0.0, c.x);
  Particle p = P0(); p.alive = true;
  p.pos = P.xyz + c * rad * 0.6 + s * (0.15 + (rnd(id, 1.0) - 0.3) * rad + age * 0.3) + vec3(0.0, P.w * 0.8 - age * 0.7, 0.0);
  p.size = 0.13 + age * 0.2; p.rot = rnd(id, 2.0) * 6.28;
  p.col = vec4(0.42 * (1.0 - age) * (0.5 + 0.5 * k));
  return p;
}`;

const LOOK_MIST = /* glsl */ `
uniform float uClock;
vec4 look(vec2 uv, vec4 col, vec4 data) {
  float n = vnoise3(vec3(uv * 2.5, uClock * 0.8 + col.x * 9.0));
  float m = smoothstep(1.0, 0.15, length(uv) * (0.8 + 0.5 * n));
  return vec4(vec3(1.5, 1.75, 1.9), 1.0) * m * col.x;
}`;

/** Sparks crawling over a stunned body: re-rolled 20 times a second, none on every third frame (kit.ts shockSparks). */
const SPARKS = (per: number) => /* glsl */ `
${COMMON}
Particle emitParticle(float slot, float back) {
  float b = floor(slot / ${per}.0), j = slot - b * ${per}.0;
  if (b >= uN) return P0();
  int i = int(b); vec4 P = uP[i]; float seed = uS2[i].z;
  if (uS[i].w < 0.5) return P0();
  float f = floor(uClock * 20.0);
  if (mod(f, 3.0) > 1.5) return P0();
  float id = f * 11.0 + j + seed * 3.0;
  Particle p = P0(); p.alive = true;
  p.pos = onBody(i, (rnd(id, 1.0) - 0.5) * 2.6, P.w * (0.3 + 0.45 * rnd(id, 2.0)), 0.7 + 0.5 * rnd(id, 3.0));
  p.size = 0.09 + 0.05 * rnd(id, 4.0); p.aspect = 0.16; p.rot = rnd(id, 5.0) * 6.28;
  p.col = vec4(1.0);
  return p;
}`;

const LOOK_SPARK = /* glsl */ `
vec4 look(vec2 uv, vec4 col, vec4 data) {
  float m = smoothstep(1.0, 0.2, abs(uv.x)) * smoothstep(1.0, 0.6, abs(uv.y));
  return vec4(vec3(3.2, 3.0, 1.5) * m, 0.0);
}`;

/** Drips running off a wet body to the ground (kit.ts drips). */
const DRIPS = (per: number) => /* glsl */ `
${COMMON}
Particle emitParticle(float slot, float back) {
  float b = floor(slot / ${per}.0), j = slot - b * ${per}.0;
  if (b >= uN) return P0();
  int i = int(b); vec4 P = uP[i]; float seed = uS2[i].z, rad = uS2[i].y;
  if (uS2[i].x < 0.5) return P0();
  float rate = 6.0, life = 0.45, ph = rnd(seed, 28.0);
  float kk = floor(uClock * rate + ph) - j, ts = (kk - ph) / rate, age = (uClock - back - ts) / life;
  if (back > 0.0) age = max(age, 0.0);
  if (age < 0.0 || age >= 1.0) return P0();
  float id = kk * 23.0 + seed;
  vec3 c = toCam(P.xyz), s = vec3(-c.z, 0.0, c.x);
  Particle p = P0(); p.alive = true;
  p.pos = P.xyz + c * rad * 0.8 + s * (rnd(id, 1.0) - 0.5) * rad * 1.6 + vec3(0.0, P.w * 0.5 * (1.0 - age * age), 0.0);
  p.size = 0.03; p.stretch = 0.03;
  p.col = vec4(1.0);
  return p;
}`;

const LOOK_DRIP = /* glsl */ `
vec4 look(vec2 uv, vec4 col, vec4 data) {
  float m = smoothstep(1.0, 0.4, length(uv));
  return vec4(vec3(0.55, 0.9, 1.6) * m, m * 0.8);
}`;

export class BodyStatuses {
  readonly group = new THREE.Group();
  private readonly P = Array.from({ length: MAX }, () => new THREE.Vector4());
  private readonly S = Array.from({ length: MAX }, () => new THREE.Vector4());
  private readonly S2 = Array.from({ length: MAX }, () => new THREE.Vector4());
  private readonly U = { uP: { value: this.P }, uS: { value: this.S }, uS2: { value: this.S2 }, uClock: { value: 0 }, uN: { value: 0 } };
  private readonly batches: { b: ParticleBatch; per: number }[] = [];
  private readonly burn: BodyBurn;
  /** Bodies drawn last frame (the lab's numbers). */
  shown = 0;

  constructor(private heightAt: (x: number, z: number) => number) {
    const add = (per: number, motion: string, look: string, o: { upright?: boolean; order?: number; soft?: number } = {}) => {
      const b = new ParticleBatch({ motion, look, uniforms: this.U, cap: per * MAX, ...o });
      b.mesh.frustumCulled = false;
      this.batches.push({ b, per }); this.group.add(b.mesh);
    };
    add(4, MIST(4), LOOK_MIST, { order: 1 });
    this.burn = new BodyBurn(MAX, this.U);
    this.group.add(this.burn.mesh);
    add(8, EMBERS(8), LOOK_EMBER, { order: 3 });
    add(3, DRIPS(3), LOOK_DRIP, { order: 3 });
    add(6, GLINTS(6), LOOK_GLINT, { order: 4, soft: 0.05 });
    add(5, SPARKS(5), LOOK_SPARK, { order: 4, soft: 0.05 });
  }

  /** Each frame: who has what, where each body is drawn (`bodyAt`, sim u), at effect time t (s). */
  update(w: World, t: number, bodyAt: (i: number) => [number, number], lights: SpellLights | null, flare: (i: number) => number = () => 0): void {
    const b = w.bodies;
    let n = 0;
    for (let i = 0; i < b.kind.length && n < MAX; i++) {
      if (!b.kind[i] || b.hp[i] <= 0) continue;
      const frozen = b.frozen[i] > 0 ? 1 : 0, burn = b.burn[i] > 0 ? (b.burnPool[i] < 10 ? 0.5 : 1) : 0;
      // any chill shows (a three-rune ring leaves a light one): glints and breath by its square root, at least 0.45
      const chill = b.chill[i] > 0.04 ? Math.max(0.45, Math.sqrt(Math.min(1, b.chill[i]))) : 0, stun = b.stun[i] > 0 ? 1 : 0, wet = b.wet[i] > 0 && !frozen ? 1 : 0;
      if (!(burn || chill || frozen || stun || wet)) continue;
      const [x, y] = bodyAt(i), g = this.heightAt(x, y), h = bodyHeight(w, i);
      this.P[n].set(x, g, y, h);
      this.S[n].set(burn, chill, frozen, stun);
      const fl = burn ? flare(i) : 0;
      this.S2[n].set(wet, Math.max(0.3, b.r[i]) * 1.15, i * 7 + 3, fl);
      if (lights && burn) lights.add(x, g + h * 0.5, y, 0xff7020, ((h > 3 ? 2.2 : 1.3) * (0.88 + 0.12 * Math.sin(t * 19 + i)) + 3 * fl) * burn, h > 3 ? 4.5 : 3 + 2 * fl);
      if (lights && frozen) lights.add(x, g + h * 0.5, y, 0xbff4ff, 0.5, 2.5);
      n++;
    }
    this.shown = n;
    this.U.uN.value = n; this.U.uClock.value = t;
    this.group.visible = n > 0;
    for (const { b: batch, per } of this.batches) batch.count = n * per;
    this.burn.count = n;
  }

  dispose(): void { for (const { b } of this.batches) b.dispose(); this.burn.dispose(); }
}
