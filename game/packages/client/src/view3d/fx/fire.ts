/**
 * The Fire family in 3D, first cut (the fx3d spike, docs/explorations/2026-11-25-fx3d-spike.md): the Fire spray and the
 * fire floor, each in two looks to put in front of the user:
 *
 * - **A, code-driven mediums:** soft particles shaped by noise and coloured from the heat ramp in the shader.
 * - **B, painted sheet:** the same motion, each flame drawing a cell of a Codex-painted sheet (content/generated/fx/:
 *   fire-wisps.png for the spray, fire-tongues.png for the floor), tinted as it cools.
 *
 * The spray follows art/spray-jet.ts's model: every particle flies along the aim it was born with (AimTrail), inside the
 * sim's fan (half-angle and range grow per rune) and out to where the channel stops; flames slow and billow at the far
 * end, embers carry past and fall, smoke rises off the far two thirds; from four runes a flame is born blue-white. The
 * floor reads the sim's surface grid: a charred, glowing bed (a decal) with flames standing on every burning cell, lower
 * at the edges, and embers rising.
 *
 * Everything is a pure function of the clock, the sim's state and seeds, as the pixel effects are.
 */
import * as THREE from 'three';
import { AIM_GLSL, AimTrail } from './aim-trail';
import { CELL_GLSL, MAX_BURNING, type SprayIn, type SurfGrid } from './from-sim';
import { GroundDecal } from './decal';
import { ParticleBatch, streamMotion } from './particles';
import type { SpellLights } from './lights';

export type FxLook = 'a' | 'b';

/** The painted sheets look B draws from (4 × 4 cells each), or null until loaded. */
export interface FireSheets { wisps: THREE.Texture | null; tongues: THREE.Texture | null }

/** How the spray sits on the caster: forward offset of the staff's tip from the middle, its height, the far end's height (u). */
export const NOZZLE = { forward: 0.55, height: 1.3, endHeight: 0.55 };

// ---- the spray ---------------------------------------------------------------------------------------------------

const SPRAY_HEAD = /* glsl */ `
${AIM_GLSL}
uniform float uN, uHalf, uHot, uBorn;
uniform vec4 uNoz;   // forward offset, nozzle height, far-end height (over the floor), floor y
float fan(float u, float p) { return sign(u) * pow(abs(u), p); }
// a point of the spray as aimed at A: s of the way out, a rad off the middle, l u across, h u over the floor
vec3 sprayAt(vec4 A, float s, float a, float l, float h) {
  float ang = A.z + a; vec2 d = vec2(cos(ang), sin(ang)), nn = vec2(-d.y, d.x);
  vec2 g = A.xy + d * (uNoz.x + s * max(A.w - uNoz.x, 0.0)) + nn * l;
  return vec3(g.x, uNoz.w + h, g.y);
}
float axisH(float s) { return mix(uNoz.y, uNoz.z, clamp(s, 0.0, 1.0)); }
`;

/** Each layer's emission: births a second and life (s) at n runes (g = n here: art/spray-jet.ts's knobs at 1). */
const RATE = {
  core: (g: number) => 220 + 50 * g, coreLife: 0.16,
  flame: (g: number) => 120 + 28 * g, flameLife: (g: number) => 0.56 - 0.08 * ((g - 1) / 4),
  smoke: (g: number) => 12 + 6 * g, smokeLife: 1.4,
  ember: (g: number) => (16 + 12 * g) * (g >= 5 ? 1.8 : 1), emberLife: 0.9,
};

const CORE = streamMotion(/* glsl */ `${SPRAY_HEAD}
Particle particle(float k, float age, float ts) {
  vec4 A = aimAt(uTime - ts);
  float g = uN, s = age * 0.36, off = (rnd(k, 31.0) * 2.0 - 1.0) * (0.03 + s * 0.35);
  Particle p = P0(); p.alive = true;
  p.pos = sprayAt(A, s, 0.0, off, axisH(s) + sin(k * 1.7 + uTime * 40.0) * 0.03);
  p.size = (0.07 + s * 0.32) * (0.9 + 0.08 * g);
  p.stretch = 0.012;
  float heat = max(0.0, age * 0.42 + rnd(k, 32.0) * 0.12 - uHot * 0.5);
  p.col = vec4(heat, age < uBorn ? 1.0 - age / max(uBorn, 1e-3) * 0.5 : 0.0, age, 1.0);
  p.data = vec4(rnd(k, 33.0), rnd(k, 34.0), 0.0, 0.0);
  return p;
}`);

const FLAME = streamMotion(/* glsl */ `${SPRAY_HEAD}
uniform float uStretch, uSizeK;
Particle particle(float k, float age, float ts) {
  float life = 0.75 + 0.25 * rnd(k, 1.0), a = age / life;
  if (a >= 1.0) return P0();
  vec4 A = aimAt(uTime - ts);
  float g = uN, reach = 0.86 + 0.24 * rnd(k, 2.0), s = (1.0 - pow(1.0 - a, 1.8)) * reach;
  float side = rnd(k, 3.0) * 2.0 - 1.0, ang = fan(side, 1.15) * uHalf * 0.95;
  float l = sin(a * 11.0 + k * 0.7) * 0.14 * s;
  float h = axisH(s) + a * a * 0.6 + sin(a * 9.0 + k * 1.3) * 0.1 * s;
  Particle p = P0(); p.alive = true;
  p.pos = sprayAt(A, s, ang, l, h);
  float sz = (0.13 + s * 0.7 * (0.6 + 0.6 * rnd(k, 5.0))) * (0.9 + 0.08 * g) * uSizeK;
  if (a > 0.78) sz *= 1.0 - (a - 0.78) * 2.2;
  p.size = sz; p.stretch = uStretch;
  p.rot = (rnd(k, 7.0) - 0.5) * 0.6;
  float heat = max(0.0, a * (0.85 + 0.3 * rnd(k, 4.0)) + abs(side) * 0.25 * s - uHot);
  p.col = vec4(heat, a * 3.0 < uBorn ? 1.0 - a * 3.0 / max(uBorn, 1e-3) : 0.0, a, smoothstep(1.0, 0.8, a));
  p.data = vec4(rnd(k, 6.0), rnd(k, 8.0), 0.0, 0.0);
  return p;
}`);

const SMOKE = streamMotion(/* glsl */ `${SPRAY_HEAD}
Particle particle(float k, float age, float ts) {
  if (ts < 0.12) return P0();
  vec4 A = aimAt(uTime - ts);
  float g = uN, a = age, sb = 0.32 + 0.78 * sqrt(rnd(k, 11.0)), side = rnd(k, 12.0) * 2.0 - 1.0, s = sb + a * 0.12;
  Particle p = P0(); p.alive = true;
  p.pos = sprayAt(A, s, side * uHalf * 0.8 * (0.6 + a * 0.4), 0.0, axisH(sb) + 0.25 + a * 2.0 + sin(a * 5.0 + k) * 0.12);
  p.size = (0.18 + sb * 0.15 + a * 0.55) * (0.8 + 0.1 * g);
  p.rot = rnd(k, 13.0) * 6.283 + a * 0.8;
  p.col = vec4(a, 0.0, 0.0, smoothstep(0.0, 0.15, a) * (1.0 - a));
  p.data = vec4(rnd(k, 14.0), 0.0, 0.0, 0.0);
  return p;
}`);

const EMBER = streamMotion(/* glsl */ `${SPRAY_HEAD}
Particle particle(float k, float age, float ts) {
  if (mod(k + floor(uTime * 18.0), 5.0) < 1.0) return P0();   // a flicker
  vec4 A = aimAt(uTime - ts);
  float a = age, s = (1.0 - pow(1.0 - a, 1.5)) * (0.95 + 0.35 * rnd(k, 21.0)), ang = (rnd(k, 22.0) * 2.0 - 1.0) * uHalf;
  float h = axisH(s) + sin(a * 3.14159) * 0.6 - a * a * 1.1;
  Particle p = P0(); p.alive = true;
  p.pos = sprayAt(A, s, ang, 0.0, max(0.03, h));
  p.size = 0.03; p.stretch = 0.02;
  p.col = vec4(0.05 + 0.25 * rnd(k, 23.0) + a * 0.3, 0.0, a, 1.0 - a * a);
  return p;
}`);

// ---- looks -------------------------------------------------------------------------------------------------------

/**
 * A: a soft flame body, its outline broken by noise, hot in the middle, coloured from the ramp. Mostly covering (alpha),
 * a little added light: on the court's warm sunlit stone a purely additive flame washes out to a pale glare.
 */
const LOOK_A_FLAME = /* glsl */ `
vec4 look(vec2 uv, vec4 col, vec4 data) {
  // a teardrop along its motion: round at the head (uv.y = 1), thinning to a ragged tail
  float n = fbm3(vec3(uv * 1.7 + data.x * 13.0, col.z * 2.5 + data.y * 7.0));
  float wd = mix(0.3, 1.0, smoothstep(-1.0, 0.4, uv.y));
  float m = smoothstep(0.95, 0.5, length(vec2(uv.x / wd, uv.y)) + (n - 0.5) * 0.9);
  float heat = col.x + 0.12 + (1.0 - m) * 0.3 + (0.5 - uv.y * 0.5) * 0.15;
  vec3 c = mix(fireRamp(heat) * 0.8, blueFlame(1.0 - col.y) * 0.6, col.y);
  // in sunlight a flame has to cover what's under it to keep its colour; cooling, it thins out instead of turning to smoke
  return vec4(c * m, m * clamp(1.05 - 0.7 * heat, 0.2, 0.97)) * col.w;
}`;

/** B: one painted wisp (its cell from data.x), its own colour warmed or cooled by the particle's heat. */
const LOOK_B_FLAME = /* glsl */ `
uniform sampler2D uSheet;
vec4 look(vec2 uv, vec4 col, vec4 data) {
  float f = floor(data.x * 16.0), fx = mod(f, 4.0), fy = floor(f / 4.0);
  vec2 q = uv * 0.5 + 0.5;
  if (data.y > 0.5) q.x = 1.0 - q.x;
  vec3 t = texture(uSheet, vec2((fx + q.x) / 4.0, 1.0 - (fy + 1.0 - q.y) / 4.0)).rgb;
  float lum = max(t.r, max(t.g, t.b)), a = smoothstep(0.04, 0.45, lum);
  vec3 tint = mix(vec3(1.7, 1.5, 1.2), vec3(0.75, 0.32, 0.2), clamp(col.x, 0.0, 1.0));
  vec3 c = mix(t * tint, blueFlame(1.0 - col.y) * 0.5 * lum, col.y * 0.8);
  return vec4(c, a * 0.9) * col.w;
}`;

const LOOK_SMOKE = /* glsl */ `
vec4 look(vec2 uv, vec4 col, vec4 data) {
  float n = fbm3(vec3(uv * 1.3 + data.x * 11.0, col.x * 1.5));
  float m = smoothstep(1.0, 0.1, length(uv) + (n - 0.5) * 0.9);
  float a = m * 0.3 * col.w;
  return vec4(vec3(0.03, 0.026, 0.026) * a, a);
}`;

/** An ember: a hot spark, covering (it has to show on bright stone) with a little glow. */
const LOOK_EMBER = /* glsl */ `
vec4 look(vec2 uv, vec4 col, vec4 data) {
  float m = smoothstep(1.0, 0.3, length(uv));
  return vec4(fireRamp(col.x) * 0.8 * m, m * 0.9) * col.w;
}`;

/**
 * The spray's light on the floor: a warm fan exactly the sim's (its half-angle, out to where the channel stops), with heat
 * flowing outward through it, so where it burns reads on the ground even though the flames fly at chest height.
 */
const FAN = /* glsl */ `
uniform vec4 uFan; uniform float uHalf, uFanOn, uClock;
vec4 decal(vec3 wp) {
  vec2 d = wp.xz - uFan.xy; float r = length(d);
  if (r > uFan.w + 0.3 || uFanOn <= 0.0) return vec4(0.0);
  float a = atan(d.y, d.x) - uFan.z; a = mod(a + 3.14159265, 6.2831853) - 3.14159265;
  float side = 1.0 - smoothstep(uHalf * 0.8, uHalf, abs(a)), end = 1.0 - smoothstep(uFan.w - 0.5, uFan.w + 0.15, r);
  vec2 dir = vec2(cos(uFan.z), sin(uFan.z));
  float n = fbm3(vec3(wp.xz * 1.3 - dir * uClock * 3.5, uClock * 0.7));
  float k = side * end * smoothstep(0.3, 1.2, r) * (0.35 + 0.65 * n) * uFanOn;
  return vec4(vec3(1.0, 0.36, 0.07) * k * 0.45, k * 0.1);
}`;

/** Its runes' heat: shifts the ramp hotter (art/spray-jet.ts: hot = 0.035 per rune past the first). */
const hotOf = (n: number): number => 0.035 * (n - 1);
/** Share of a flame's life spent blue-white: from four runes (art/spray-jet.ts `born`). */
const bornOf = (n: number): number => (n >= 4 ? 0.3 + 0.12 * (n - 4) : 0);

export class FireSpray {
  readonly group = new THREE.Group();
  private trail = new AimTrail();
  /** The channel as seen: its start and (once it stopped) its end, on the effect clock; null when nothing is drawn. */
  private rec: { t0: number; end: number; last: number; n: number } | null = null;
  private U = {
    uTime: { value: 0 }, uEnd: { value: 1e9 }, uN: { value: 1 }, uHalf: { value: 0.5 }, uHot: { value: 0 }, uBorn: { value: 0 },
    uNoz: { value: new THREE.Vector4(NOZZLE.forward, NOZZLE.height, NOZZLE.endHeight, 0) }, uAim: this.trail.uniform,
  };
  private layers: { b: ParticleBatch; rate: (g: number) => number; life: (g: number) => number }[] = [];
  /** The warm fan on the floor (FAN). */
  readonly fan: GroundDecal;
  private F = { uFan: { value: new THREE.Vector4() }, uFanOn: { value: 0 }, uClock: { value: 0 } };

  constructor(readonly look: FxLook, sheets: FireSheets, seed: number) {
    const L = (life: number | ((g: number) => number)) => (typeof life === 'number' ? () => life : life);
    const add = (motion: string, lookSrc: string, rate: (g: number) => number, life: number | ((g: number) => number), order: number, extra: Record<string, THREE.IUniform> = {}) => {
      const cap = Math.ceil(rate(5) * L(life)(1)) + 2;
      const b = new ParticleBatch({ motion, look: lookSrc, cap, order, uniforms: { ...this.U, uRate: { value: 1 }, uLife: { value: 1 }, ...extra } });
      b.u.uSeed.value = seed + order * 101;
      this.layers.push({ b, rate, life: L(life) });
      this.group.add(b.mesh);
    };
    const flameLook = look === 'b' ? LOOK_B_FLAME : LOOK_A_FLAME, sheet = { uSheet: { value: sheets.wisps } };
    add(SMOKE, LOOK_SMOKE, RATE.smoke, RATE.smokeLife, 0);
    // B's painted wisps stand upright (their tips are painted pointing up); A's soft bodies smear along their motion
    add(FLAME, flameLook, RATE.flame, RATE.flameLife, 1, { uStretch: { value: look === 'b' ? 0 : 0.05 }, uSizeK: { value: look === 'b' ? 1.25 : 1 }, ...sheet });
    add(CORE, flameLook, RATE.core, RATE.coreLife, 2, sheet);
    add(EMBER, LOOK_EMBER, RATE.ember, RATE.emberLife, 3);
    this.fan = new GroundDecal({ look: FAN, uniforms: { ...this.F, uHalf: this.U.uHalf } });
    this.group.add(this.fan.mesh);
  }

  /** Particles drawn at most, all layers (the batches' caps). */
  get cap(): number { return this.layers.reduce((s, l) => s + l.b.spec.cap, 0); }

  /**
   * One frame at time t (seconds, the effect clock): `spray` is this seat's spray from the sim (from-sim.ts sprays()),
   * or null when it isn't channelling. The floor's height under the caster is `groundY`.
   */
  update(t: number, spray: SprayIn | null, groundY: number, lights: SpellLights | null): void {
    let r = this.rec;
    if (r && t < r.t0) { r = this.rec = null; this.trail.clear(); }
    if (spray) {
      const t0 = t - spray.age;
      if (!r || r.end < t || Math.abs(r.t0 - t0) > 0.05) { r = this.rec = { t0, end: Infinity, last: t, n: spray.n }; }
      r.last = t; r.n = spray.n;
      this.U.uHalf.value = spray.half;
      this.trail.record(t, { x: spray.x, z: spray.z, ang: spray.ang, reach: spray.reach });
    } else if (r && r.end === Infinity) r.end = r.last;
    if (r && t > r.end + 1.5) { r = this.rec = null; }
    this.group.visible = !!r;
    if (!r) return;
    const g = r.n;
    this.trail.fill(t);
    this.U.uTime.value = t - r.t0; this.U.uEnd.value = r.end === Infinity ? 1e9 : r.end - r.t0;
    this.U.uN.value = g; this.U.uHot.value = hotOf(g); this.U.uBorn.value = bornOf(g); this.U.uNoz.value.w = groundY;
    for (const l of this.layers) { l.b.u.uRate.value = l.rate(g); l.b.u.uLife.value = l.life(g); }
    const now = this.trail.at(t), on = t <= r.end ? Math.min(1, (t - r.t0) / 0.15) : Math.max(0, 1 - (t - r.end) / 0.25);
    this.F.uFan.value.set(now.x, now.z, now.ang, now.reach); this.F.uFanOn.value = on * (0.7 + 0.075 * g); this.F.uClock.value = t;
    this.fan.heightAt = () => groundY;
    this.fan.cover({ x0: now.x - now.reach - 0.5, z0: now.z - now.reach - 0.5, x1: now.x + now.reach + 0.5, z1: now.z + now.reach + 0.5 });
    // light: the staff's flare and the stream, brighter with more runes, only while it's running
    if (lights && t <= r.end) {
      const A = this.trail.at(t), cs = Math.cos(A.ang), sn = Math.sin(A.ang), on = Math.min(1, (t - r.t0) / 0.12);
      const at = (f: number) => NOZZLE.forward + f * Math.max(0, A.reach - NOZZLE.forward);
      const flick = 0.85 + 0.15 * Math.sin(t * 23) * Math.sin(t * 7.3);
      lights.add(A.x + cs * at(0), groundY + NOZZLE.height, A.z + sn * at(0), 0xffb060, (1.2 + 0.4 * g) * on * flick, 4 + g);
      lights.add(A.x + cs * at(0.65), groundY + 1.2, A.z + sn * at(0.65), 0xff7a2a, (2 + 0.8 * g) * on * flick, 6 + 1.5 * g);
    }
  }

  dispose(): void { for (const l of this.layers) l.b.dispose(); this.fan.dispose(); }
}

// ---- the floor ---------------------------------------------------------------------------------------------------

/** Flames standing on a burning cell at once, and embers rising off it. */
const PER_CELL = 3, EMBERS_PER_CELL = 2;

const FLOOR_HEAD = /* glsl */ `
${CELL_GLSL}
uniform sampler2D uBurn; uniform float uClock;
vec4 burnAt(float ci) { return texelFetch(uBurn, ivec2(int(mod(ci, 64.0)), int(ci / 64.0)), 0); }
`;

const TONGUE = /* glsl */ `${FLOOR_HEAD}
uniform float uTall;
Particle emitParticle(float slot, float back) {
  float ci = floor(slot / ${PER_CELL}.0), j = slot - ci * ${PER_CELL}.0;
  vec4 B = burnAt(ci);
  float cell = B.x, life = 0.75 + 0.35 * rnd(cell, 91.0), rate = ${PER_CELL}.0 / life, ph = rnd(cell, 90.0) * ${PER_CELL}.0;
  float kk = floor(uClock * rate + ph) - j, ts = (kk - ph) / rate, age = (uClock - back - ts) / life;
  if (back > 0.0) age = max(age, 0.0);
  if (age < 0.0 || age >= 1.0) return P0();
  float id = kk * 4099.0 + cell;
  vec3 c = cellAt(cell, B.w);
  Particle p = P0(); p.alive = true;
  p.pos = c + vec3((rnd(id, 1.0) - 0.5) * 0.5, 0.0, (rnd(id, 2.0) - 0.5) * 0.5);
  // the middle of a patch burns tall, its edge low and ragged; a dying floor (its last second) shrinks
  float inner = smoothstep(0.35, 0.95, surfAt(p.pos.xz).r);
  float h = (0.3 + (0.45 + 0.6 * rnd(id, 3.0)) * inner) * (0.75 + 0.35 * B.z) * B.y * uTall;
  float grow = sin(3.14159 * pow(age, 0.7));
  p.size = 0.5 * h * (0.35 + 0.65 * grow);
  p.aspect = 0.55 + 0.3 * rnd(id, 4.0);
  p.rot = sin(uClock * 2.3 + cell * 0.37) * 0.18 + (rnd(id, 5.0) - 0.5) * 0.3;
  p.col = vec4(age, inner, B.y, smoothstep(0.0, 0.12, age) * smoothstep(1.0, 0.7, age));
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
  if (age < 0.0 || age >= 1.0 || rnd(kk * 4099.0 + cell, 9.0) > 0.45 * B.y) return P0();
  float id = kk * 4099.0 + cell;
  Particle p = P0(); p.alive = true;
  p.pos = cellAt(cell, B.w) + vec3((rnd(id, 1.0) - 0.5) * 0.5 + sin(age * 6.0 + kk) * 0.15 + age * 0.25, 0.35 + age * 1.6, (rnd(id, 2.0) - 0.5) * 0.5);
  p.size = 0.024; p.stretch = 0.05;
  p.col = vec4(0.1 + age * 0.4, 0.0, age, 1.0 - age);
  return p;
}`;

/** A: a flame tongue: narrowing to a ragged tip, the noise climbing it, gold at the root and red at the tip. */
const LOOK_A_TONGUE = /* glsl */ `
uniform float uClock;
vec4 look(vec2 uv, vec4 col, vec4 data) {
  float y = uv.y, n = fbm3(vec3(uv.x * 1.6 + data.x * 9.0, y * 2.2 - uClock * 3.2, data.y * 5.0));
  float w = (1.0 - y * 0.92) * (0.75 + 0.5 * n);
  float m = smoothstep(w, w * 0.35, abs(uv.x)) * smoothstep(0.0, 0.1, y) * smoothstep(1.0, 0.55, y + (n - 0.5) * 0.7);
  float heat = 0.38 + y * 0.5 + (1.0 - m) * 0.2 - col.y * 0.12;
  return vec4(fireRamp(heat) * 0.8 * m, m * clamp(1.1 - 0.6 * heat, 0.3, 0.97)) * col.w;
}`;

/** B: one painted cluster of tongues (its cell from data.x), its base on the quad's base. */
const LOOK_B_TONGUE = /* glsl */ `
uniform sampler2D uSheet;
vec4 look(vec2 uv, vec4 col, vec4 data) {
  float f = floor(data.x * 16.0), fx = mod(f, 4.0), fy = floor(f / 4.0);
  vec2 q = vec2(uv.x * 0.5 + 0.5, uv.y * 0.96 + 0.045);
  if (data.y > 0.5) q.x = 1.0 - q.x;
  vec3 t = texture(uSheet, vec2((fx + q.x) / 4.0, 1.0 - (fy + 1.0 - q.y) / 4.0)).rgb;
  float lum = max(t.r, max(t.g, t.b));
  return vec4(t * 1.4 * vec3(1.0, 0.95, 0.85), smoothstep(0.04, 0.45, lum) * 0.9) * col.w;
}`;

/**
 * The burning bed under the flames (both looks): the floor charred dark, glowing cracks of embers running through it,
 * brightest in the middle. Look A also draws bright tongues crawling over it (uTongues).
 */
const BED = /* glsl */ `
${CELL_GLSL}
uniform float uClock, uTongues;
vec4 decal(vec3 wp) {
  vec4 s = surfAt(wp.xz);
  if (s.r < 0.02) return vec4(0.0);
  float n = fbm3(vec3(wp.xz * 1.4, 3.0));
  float m = s.r + (n - 0.5) * 0.6, life = s.g / max(s.r, 1e-3);
  float rim = smoothstep(0.1, 0.45, m), bed = smoothstep(0.35, 0.8, m);
  // cracks: the ridges of a slowly shifting noise
  float v = fbm3(vec3(wp.xz * 2.2, uClock * 0.25)), crack = pow(1.0 - abs(v * 2.0 - 1.0), 7.0);
  float flick = 0.6 + 0.4 * vnoise3(vec3(wp.xz * 3.0, uClock * 2.5));
  float crawl = uTongues * pow(fbm3(vec3(wp.x * 2.6, wp.z * 2.6 + uClock * 1.4, uClock * 0.6)), 3.0) * 3.0;
  float glow = (crack * 1.2 + 0.25 + crawl) * flick * bed * life;
  vec3 c = fireRamp(0.62 - glow * 0.35) * 0.6 * glow;
  return vec4(c, rim * 0.82 * mix(0.5, 1.0, life));
}`;

export class FireFloor {
  readonly group = new THREE.Group();
  readonly bed: GroundDecal;
  private tongues: ParticleBatch;
  private embers: ParticleBatch;
  private U: Record<string, THREE.IUniform>;

  constructor(readonly look: FxLook, sheets: FireSheets, private grid: SurfGrid, seed: number) {
    this.U = {
      uClock: { value: 0 }, uBurn: { value: grid.burning }, uSurf: { value: null }, uSurfDims: { value: grid.dims }, uSurfSize: { value: grid.gridSize },
    };
    this.bed = new GroundDecal({ look: BED, uniforms: { ...this.U, uTongues: { value: look === 'a' ? 1 : 0 } } }, grid.heightAt);
    this.tongues = new ParticleBatch({
      motion: TONGUE, look: look === 'b' ? LOOK_B_TONGUE : LOOK_A_TONGUE, cap: MAX_BURNING * PER_CELL, upright: true, soft: 0.12, order: 1,
      uniforms: { ...this.U, uTall: { value: look === 'b' ? 1.35 : 1 }, uSheet: { value: sheets.tongues } },
    });
    this.embers = new ParticleBatch({ motion: FLOOR_EMBER, look: LOOK_EMBER, cap: MAX_BURNING * EMBERS_PER_CELL, order: 2, uniforms: this.U });
    this.tongues.u.uSeed.value = seed; this.embers.u.uSeed.value = seed + 7; this.bed.u.uSeed.value = seed + 3;
    this.group.add(this.bed.mesh, this.tongues.mesh, this.embers.mesh);
  }

  /** Quads drawn this frame. */
  get drawn(): number { return this.tongues.count + this.embers.count; }

  /** One frame at time t: the grid must have been updated from the sim this frame. */
  update(t: number, lights: SpellLights | null): void {
    const g = this.grid;
    this.U.uClock.value = t; this.U.uSurf.value = g.grid;
    this.bed.cover(g.box);
    this.tongues.count = g.count * PER_CELL; this.embers.count = g.count * EMBERS_PER_CELL;
    this.group.visible = g.count > 0;
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
      lights.add(b[0] / k, b[2] / k + 1.2, b[1] / k, 0xff8030, Math.min(5, 0.08 * k) * (b[3] / k) * flick, 6);
    }
  }

  dispose(): void { this.bed.dispose(); this.tongues.dispose(); this.embers.dispose(); }
}
