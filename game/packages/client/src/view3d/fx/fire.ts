/**
 * The Fire family in 3D: the Fire spray, built to the toon-volume concept the user picked on 2026-11-25
 * (docs/reference/spell-concepts/fire/toon-spray-2.jpg; record: docs/explorations/2026-11-25-spell-concepts-fire.md).
 * The floor it burns is fire-floor.ts.
 *
 * One stream from one point. From the back to the front, the layers are:
 *
 * 1. **Smoke**, soft translucent warm grey-brown puffs (painted, fire-smoke.png) off the far end only, rising: the
 *    contrast on pale stone.
 * 2. **The outline**: a slightly bigger deep-red shell of the body (fire-body.ts), so a dark red edge shows round the
 *    flame (the concept's rim, which keeps the fire off the warm floor).
 * 3. **The body**: one volume, a mesh from the staff to where the channel stops (fire-body.ts), with noise flowing
 *    outward through it cut into toon bands (white-hot, yellow, orange, deep red) and eroded into tongues at its edges.
 * 3b. **Tongues**: many small painted licks (fire-licks.png) racing out through the body, a quarter of a second each,
 *    their picture re-picked 12 times a second: the speed (the effects study's round 2).
 * 4. **The core**: a white-hot stream of soft glows from the staff's tip, the first third of the way out, drawn a little
 *    nearer the camera so it shows over a caster who faces away.
 * 5. **Embers**, a few, carrying past the end and falling.
 * 6. **Light**: a warm pool and fan on the floor (a decal) and two spell lights.
 *
 * The fan is the sim's: the body and every particle follow the aim the flame left the staff with (AimTrail, so a sweep
 * bends like a hose), inside the sim's half-angle and out to where the channel stops (a wall cuts it short).
 * More runes: the sim's wider, longer fan, a hotter body, a longer core, more smoke and embers.
 *
 * Everything is a pure function of the clock, the sim's state and seeds, as the pixel effects are.
 */
import * as THREE from 'three';
import { AIM_GLSL, AimTrail } from './aim-trail';
import { type SprayIn } from './from-sim';
import { GroundDecal } from './decal';
import { ParticleBatch, streamMotion } from './particles';
import { FIRE_TEX, SHEET_GLSL } from './fire-sheets';
import { FireBody } from './fire-body';
import type { SpellLights } from './lights';

export { FireFloor } from './fire-floor';

/** The spike's two looks (fx3d.html ?look=); both were rejected and replaced by this one, which ignores it. */
export type FxLook = 'a' | 'b';

/** The spike's painted sheets, still passed by the hosts; the fire now draws from fire-sheets.ts and ignores these. */
export interface FireSheets { wisps: THREE.Texture | null; tongues: THREE.Texture | null }

/** How the spray sits on the caster: forward offset of the staff's tip from the middle, its height, the far end's height (u). */
export const NOZZLE = { forward: 0.55, height: 1.3, endHeight: 0.6 };

/**
 * The body mesh (fire-body.ts): off since round 5. The user, round 4: "there are fire particles that spit out, but
 * there's also an animated sheet under. I think the sheet has problems. It bends in a way that looks weird, it ends
 * abruptly, the holes don't look realistic." Painted flame puffs (PUFF) now fill the cone over a soft glow; true draws
 * the mesh again.
 */
const BODY_MESH = false;

const SPRAY_HEAD = /* glsl */ `
${AIM_GLSL}
uniform float uN, uHalf, uHot, uRange, uRb;
uniform vec4 uNoz;   // forward offset, nozzle height, far-end height (over the floor), floor y
// the spray's raindrop (the sim's geom.ts inDrop): its half-width d u out, along straight edges then round the bulb
float dropW(float d) {
  float c = uRange - uRb, at = (c * c - uRb * uRb) / max(c, 1e-3);
  return d < at ? d * tan(min(uHalf, 1.4)) : sqrt(max(uRb * uRb - (d - c) * (d - c), 0.0));
}
// a point of the spray as aimed at A: s of the way out, a off the middle (as a share of uHalf: +-uHalf is the drop's
// edge there), l u across, h u over the floor
vec3 sprayAt(vec4 A, float s, float a, float l, float h) {
  vec2 d = vec2(cos(A.z), sin(A.z)), nn = vec2(-d.y, d.x);
  float dd = uNoz.x + s * max(A.w - uNoz.x, 0.0);
  vec2 g = A.xy + d * dd + nn * (l + a / max(uHalf, 1e-3) * dropW(dd));
  return vec3(g.x, uNoz.w + h, g.y);
}
float axisH(float s) { return mix(uNoz.y, uNoz.z, clamp(s, 0.0, 1.0)); }
// the drop's half-width (u) s of the way out
float fanW(vec4 A, float s) { return dropW(uNoz.x + s * max(A.w - uNoz.x, 0.0)); }
`;

/** Each layer's births a second and life (s) at n runes. */
const RATE = {
  core: () => 90, coreLife: 0.18,
  smoke: (n: number) => 5 + 2 * n, smokeLife: 1.0,
  puff: (n: number) => 36 + 8 * n, puffLife: 0.72,
  ember: (n: number) => (24 + 6 * n) * (n >= 5 ? 1.6 : 1), emberLife: 1.1,
  glow: (n: number) => 12 + 3 * n, glowLife: 0.3,
};

/** The core: soft white-hot glows from the staff's tip, out to uCore of the way (0.3 at one rune to 0.46 at five). */
const CORE = streamMotion(/* glsl */ `${SPRAY_HEAD}
uniform float uCore;
Particle particle(float k, float age, float ts) {
  vec4 A = aimAt(uTime - ts);
  float s = age * uCore, side = rnd(k, 31.0) * 2.0 - 1.0;
  Particle p = P0(); p.alive = true;
  p.pos = sprayAt(A, s, side * uHalf * 0.04 * smoothstep(0.0, 0.4, s), 0.0, axisH(s) + (rnd(k, 35.0) - 0.5) * 0.05 * s);
  // drawn as if 1.1 u nearer the camera (along its own line of sight, so it stays where it is on screen): the staff's
  // white-hot start shows over the caster's own hat and back when he faces away from the camera
  p.pos += normalize(cameraPosition - p.pos) * 1.1;
  p.size = 0.07 + 0.28 * pow(age, 0.85);
  p.stretch = 0.02;
  p.col = vec4(s / uCore, 0.0, age, 1.0);
  return p;
}`);

const SMOKE = streamMotion(/* glsl */ `${SPRAY_HEAD}
Particle particle(float k, float age, float ts) {
  if (ts < 0.15) return P0();
  vec4 A = aimAt(uTime - ts);
  float a = age, sb = 0.65 + 0.25 * rnd(k, 11.0), side = rnd(k, 12.0) * 2.0 - 1.0, w = fanW(A, sb);
  Particle p = P0(); p.alive = true;
  p.pos = sprayAt(A, sb + a * 0.08, side * uHalf * 0.6, 0.0, axisH(sb) + 0.1 + a * 1.6);
  // scales out fast at first, then slowly (1 - (1 - a)^3)
  p.size = (0.5 + w * 0.42) * (0.65 + 1.4 * (1.0 - pow(1.0 - a, 3.0)));
  p.rot = rnd(k, 13.0) * 6.2832 + a * (rnd(k, 15.0) > 0.5 ? 0.7 : -0.7);
  p.col = vec4(a, 0.0, 0.0, smoothstep(0.0, 0.1, a) * (1.0 - smoothstep(0.3, 1.0, a)));
  p.data = vec4(rnd(k, 14.0), rnd(k, 16.0), 0.0, 0.0);
  return p;
}`);

const EMBER = streamMotion(/* glsl */ `${SPRAY_HEAD}
Particle particle(float k, float age, float ts) {
  vec4 A = aimAt(uTime - ts);
  float a = age, s = (1.0 - pow(1.0 - a, 1.5)) * (0.95 + 0.35 * rnd(k, 21.0)), ang = (rnd(k, 22.0) * 2.0 - 1.0) * uHalf * 0.9;
  float h = axisH(s) + 0.3 + sin(a * 3.14159) * 0.8 - a * a * 1.2;
  Particle p = P0(); p.alive = true;
  p.pos = sprayAt(A, s, ang, 0.0, max(0.03, h));
  p.size = 0.035; p.stretch = 0.015;
  p.col = vec4(0.25 + 0.2 * rnd(k, 23.0) + a * 0.35, 0.0, a, 1.0 - a * a);
  return p;
}`);

const GLOW = streamMotion(/* glsl */ `${SPRAY_HEAD}
Particle particle(float k, float age, float ts) {
  vec4 A = aimAt(uTime - ts);
  float s = 0.1 + 0.75 * rnd(k, 61.0) + age * 0.3;
  if (s > 1.02) return P0();
  float side = (rnd(k, 62.0) * 2.0 - 1.0) * uHalf * 0.6 * smoothstep(0.0, 0.3, s), w = fanW(A, s);
  Particle p = P0(); p.alive = true;
  p.pos = sprayAt(A, s, side, 0.0, mix(axisH(s), w * 0.3 + 0.2, smoothstep(0.0, 0.6, s)));
  p.size = 0.2 + w * 0.28;
  p.col = vec4(s, age, 0.0, 1.0);
  return p;
}`);

/**
 * Puffs: the body since round 7 (the user's Magicka 1 recording: "flame particles that move outwards, scale up, fade
 * out, change color from bright yellow to more orange/red at the end"; Magicka 2's "blotches of fire that pulse large
 * then fade"). Born along the jet, carried out to the cone's end, growing about three times, mostly added light.
 */
const PUFF = streamMotion(/* glsl */ `${SPRAY_HEAD}
Particle particle(float k, float age, float ts) {
  vec4 A = aimAt(uTime - ts);
  // fast out of the jet, slowing (drag) so most of its life is spent burning out near the cone's end, a little past it
  float s = 0.04 + 0.96 * (1.0 - pow(1.0 - age, 1.4));
  float sd = rnd(k, 73.0) * 2.0 - 1.0, side = sd * uHalf * 1.0 * smoothstep(0.0, 0.5, s), w = fanW(A, s);
  Particle p = P0(); p.alive = true;
  // rising as it burns (Magicka 1's flame has negative gravity)
  p.pos = sprayAt(A, s, side, 0.0, axisH(s) + age * age * 0.5 + (rnd(k, 74.0) - 0.5) * w * 0.1);
  // swells fast and keeps growing as it slows: a blotch that pulses large, then fades
  // grows about three times over its life
  p.size = (0.2 + w * 0.14) * (0.7 + 1.2 * (1.0 - pow(1.0 - age, 2.0)));
  p.stretch = 0.025;
  p.rot = rnd(k, 75.0) * 6.2832 + age * (rnd(k, 76.0) > 0.5 ? 0.35 : -0.35);
  p.col = vec4(age, s, 0.0, 1.0);
  p.data = vec4(rnd(k, 77.0), rnd(k, 78.0), 0.0, 0.0);
  return p;
}`);

const LOOK_PUFF = /* glsl */ `
uniform sampler2D uSheet;
${SHEET_GLSL}
vec4 look(vec2 uv, vec4 col, vec4 data) {
  float age = col.x;
  // its own burn-out, frame by frame: one of three painted flipbooks (fire-burn.png), picked per particle
  vec2 q = uv * 0.5 + 0.5; if (data.y > 0.5) q.x = 1.0 - q.x;
  vec3 t = flipbook(uSheet, q, floor(data.x * 3.0), age, 8.0, 3.0).rgb;
  float lum = max(t.r, max(t.g, t.b)), m = smoothstep(0.03, 0.3, lum);
  // the painting's own flame, warmer when young and redder as it ends (Magicka 1)
  vec3 c = t * mix(vec3(2.0, 1.75, 1.35), vec3(1.1), age);   // the painting already cools from white to red; lifted a little into HDR
  float fade = smoothstep(0.0, 0.04, age) * (1.0 - smoothstep(0.65, 1.0, age));
  // covering, so the painted curls hold their colour on the pale stone instead of adding up to a glare or a fog
  float cover = m * fade * 0.68;
  return vec4(c * cover, cover);
}`;

// ---- looks -------------------------------------------------------------------------------------------------------

/** The glow under the puffs: soft warm light riding out with them, the body's warmth without a surface. */
const LOOK_GLOW = /* glsl */ `
vec4 look(vec2 uv, vec4 col, vec4 data) {
  float m = exp(-dot(uv, uv) * 2.6) * sin(min(col.y, 0.999) * 3.14159);
  return vec4(fireRamp(0.3 + col.x * 0.5) * 0.1 * m, 0.04 * m);
}`;

/** The core: a soft white-hot glow, mostly added light, cooling to pale gold where it hands over to the body. */
const LOOK_CORE = /* glsl */ `
uniform float uTime;
vec4 look(vec2 uv, vec4 col, vec4 data) {
  // a jet that widens and breaks up into the body as it cools, not a hard tube (Codex's critique, iteration 0)
  float h = clamp(col.x, 0.0, 1.0);
  float noise = vnoise3(vec3(uv * 7.0, uTime * 24.0 - h * 8.0));
  float r = length(uv);
  // narrow, and dissolving into the flames as it cools rather than ending in a blunt white tip (Codex, iteration 11)
  float m = (1.0 - smoothstep(0.18, 0.92 + (noise - 0.5) * 0.35 * h, r)) * (1.0 - smoothstep(0.45, 1.0, h));
  m *= mix(1.0, smoothstep(0.25, 0.65, noise), smoothstep(0.35, 0.9, h));
  vec3 c = mix(vec3(4.0, 3.4, 2.2), vec3(2.2, 1.25, 0.35), h);
  return vec4(c * m * 0.5, 0.1 * m);
}`;

/** Smoke: a painted puff's shape and shading, tinted dark warm grey-brown, capped so what's behind it still shows. */
const LOOK_SMOKE = /* glsl */ `
uniform sampler2D uSheet;
${SHEET_GLSL}
vec4 look(vec2 uv, vec4 col, vec4 data) {
  vec2 q = uv * 0.5 + 0.5; if (data.y > 0.5) q.x = 1.0 - q.x;
  float lum = flipbook(uSheet, q, 0.0, col.x, 4.0, 1.0).r, m = smoothstep(0.03, 0.7, lum);
  // dark, the contrast Magicka 2's flame sits against (iteration 7's lighter smoke washed the fire out)
  vec3 c = mix(vec3(0.006, 0.006, 0.007), vec3(0.03, 0.026, 0.022), smoothstep(0.4, 0.95, lum));
  float a = m * 0.48 * col.w;
  return vec4(c * a, a);
}`;

/** An ember: a hot spark, covering (it has to show on bright stone) with a little glow. */
export const LOOK_EMBER = /* glsl */ `
vec4 look(vec2 uv, vec4 col, vec4 data) {
  float m = 1.0 - smoothstep(0.3, 1.0, length(uv));
  return vec4(fireRamp(col.x) * 1.3 * m, m * 0.95) * col.w;
}`;

/**
 * The spray's light on the floor: a warm pool round the staff's tip and a fan exactly the sim's (its half-angle, out
 * to where the channel stops), with heat flowing outward through it, so where it burns reads on the ground even though
 * the flames fly above it.
 */
const FAN = /* glsl */ `
uniform vec4 uFan; uniform float uHalf, uFanOn, uSootOn, uClock, uNozF, uRange, uRb;
float dropW(float d) {
  float c = uRange - uRb, at = (c * c - uRb * uRb) / max(c, 1e-3);
  return d < at ? d * tan(min(uHalf, 1.4)) : sqrt(max(uRb * uRb - (d - c) * (d - c), 0.0));
}
vec4 decal(vec3 wp) {
  vec2 d = wp.xz - uFan.xy; float r = length(d);
  if (r > uFan.w + 3.0 || (uFanOn <= 0.0 && uSootOn <= 0.0)) return vec4(0.0);
  vec2 dir = vec2(cos(uFan.z), sin(uFan.z));
  float along = dot(d, dir), across = abs(d.x * dir.y - d.y * dir.x);
  // the light follows the raindrop (where the flames are), spilling a little past it, never further
  float w = dropW(clamp(along, 0.0, uRange)) + 0.15 * max(along, 0.0);
  float side = (1.0 - smoothstep(w * 0.8, w * 1.25 + 0.3, across)) * step(-0.5, along), end = 1.0 - smoothstep(uFan.w - 0.2, uFan.w + 1.6, r);
  float n = fbm3(vec3(wp.xz * 1.1 - dir * uClock * 3.0, uClock * 0.7));
  float fan = side * end * smoothstep(0.2, 1.0, r) * (0.7 + 0.3 * n);
  float pool = exp(-dot(wp.xz - uFan.xy - dir * uNozF, wp.xz - uFan.xy - dir * uNozF) / 7.0);
  // as wide as the pixel spray's glow (the study): a pool round the caster and the fan, spilling past the flames
  float k = (fan * 1.15 + pool * 1.0) * uFanOn;
  // soot under the far half (Magicka 2's char): dark, blotchy, taking the stone's colour away
  vec2 bc = uFan.xy + dir * max(min(uFan.w, uRange) - uRb * 1.1, 0.5);
  float br = length(wp.xz - bc), wob = fbm3(vec3(wp.xz * 0.7, 9.0)), grain = fbm3(vec3(wp.xz * 2.3, 3.0));
  float soot = (1.0 - smoothstep(uRb * 0.45, uRb * 1.25, br * (0.75 + 0.6 * wob))) * smoothstep(0.3, 0.65, grain) * uSootOn * 0.85;
  // a warm glaze: it takes a little of the pale stone's own colour away (alpha) and puts saturated firelight back, so the
  // floor under the fire turns orange rather than just brighter (which the tone map would wash to cream)
  vec3 c = mix(vec3(1.0, 0.45, 0.1), vec3(1.0, 0.24, 0.04), clamp(r / max(uFan.w, 1.0), 0.0, 1.0));
  return vec4(c * k * 0.35 * (1.0 - soot) + vec3(0.035, 0.022, 0.014) * soot * 0.55, clamp(k * 0.12 + soot * 0.9, 0.0, 0.95));
}`;

/** Its runes' heat: shifts the colours hotter (art/spray-jet.ts: hot = 0.035 per rune past the first). */
const hotOf = (n: number): number => 0.035 * (n - 1);

export class FireSpray {
  readonly group = new THREE.Group();
  private trail = new AimTrail();
  /** The channel as seen: its start and (once it stopped) its end, on the effect clock; null when nothing is drawn. */
  private rec: { t0: number; end: number; last: number; n: number } | null = null;
  private U = {
    uTime: { value: 0 }, uEnd: { value: 1e9 }, uN: { value: 1 }, uHalf: { value: 0.5 }, uHot: { value: 0 }, uCore: { value: 0.35 },
    uNoz: { value: new THREE.Vector4(NOZZLE.forward, NOZZLE.height, NOZZLE.endHeight, 0) }, uAim: this.trail.uniform,
    uRange: { value: 7.5 }, uRb: { value: 1.8 },
  };
  private layers: { b: ParticleBatch; rate: (n: number) => number; life: (n: number) => number }[] = [];
  /** The warm pool and fan on the floor (FAN). */
  readonly fan: GroundDecal;
  /** The body: the flame as one volume (fire-body.ts). */
  private body: FireBody;
  private F = { uFan: { value: new THREE.Vector4() }, uFanOn: { value: 0 }, uSootOn: { value: 0 }, uClock: { value: 0 }, uNozF: { value: NOZZLE.forward + 0.6 } };

  /** `look` and `sheets` are the spike's and are ignored (see FxLook, FireSheets). */
  constructor(readonly look: FxLook, sheets: FireSheets | null, seed: number) {
    void sheets;
    const L = (life: number | ((n: number) => number)) => (typeof life === 'number' ? () => life : life);
    const add = (motion: string, lookSrc: string, rate: (n: number) => number, life: number | ((n: number) => number), order: number, extra: Record<string, THREE.IUniform> = {}, seedOf = order) => {
      const cap = Math.ceil(rate(5) * L(life)(5)) + 2;
      const b = new ParticleBatch({ motion, look: lookSrc, cap, order, soft: order >= 1 && order < 4 ? 0.9 : undefined, uniforms: { ...this.U, uRate: { value: 1 }, uLife: { value: 1 }, ...extra } });
      b.u.uSeed.value = seed + seedOf * 101;
      this.layers.push({ b, rate, life: L(life) });
      this.group.add(b.mesh);
    };
    add(SMOKE, LOOK_SMOKE, RATE.smoke, RATE.smokeLife, 0, { uSheet: { value: FIRE_TEX.smokeburn } });
    // the body: one volume, a mesh (fire-body.ts), its deep-red outline shell first, then the flame
    add(GLOW, LOOK_GLOW, RATE.glow, RATE.glowLife, 2, {}, 7);
    add(PUFF, LOOK_PUFF, RATE.puff, RATE.puffLife, 3, { uSheet: { value: FIRE_TEX.burn } }, 8);
    this.body = new FireBody(SPRAY_HEAD, this.U, seed);
    this.body.group.visible = BODY_MESH;
    this.group.add(this.body.group);
    add(CORE, LOOK_CORE, RATE.core, RATE.coreLife, 4);
    add(EMBER, LOOK_EMBER, RATE.ember, RATE.emberLife, 5);
    this.fan = new GroundDecal({ look: FAN, uniforms: { ...this.F, uHalf: this.U.uHalf, uRange: this.U.uRange, uRb: this.U.uRb } });
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
      this.U.uHalf.value = spray.half; this.U.uRange.value = spray.range; this.U.uRb.value = spray.rb;
      // the channel's end isn't set on its first tick (it reads as the room's origin): never past the sim's range
      this.trail.record(t, { x: spray.x, z: spray.z, ang: spray.ang, reach: Math.min(spray.reach, spray.range) });
    } else if (r && r.end === Infinity) r.end = r.last;
    if (r && t > r.end + 6.2) { r = this.rec = null; }
    this.group.visible = !!r;
    if (!r) return;
    const n = r.n;
    this.trail.fill(t);
    this.U.uTime.value = t - r.t0; this.U.uEnd.value = r.end === Infinity ? 1e9 : r.end - r.t0;
    // the body swells over the channel's first second, and once it stops, fades as its tail runs out after the head
    this.body.uGrow.value = Math.min(1, (t - r.t0) / 1.0);
    // the release erodes outward in the body's shader; this only cleans up after it
    this.body.uOn.value = r.end === Infinity ? 1 : Math.max(0, 1 - Math.max(0, t - r.end - 0.8) / 0.3);
    this.U.uN.value = n; this.U.uHot.value = hotOf(n); this.U.uCore.value = 0.34 + 0.02 * n; this.U.uNoz.value.w = groundY;
    for (const l of this.layers) { l.b.u.uRate.value = l.rate(n); l.b.u.uLife.value = l.life(n); }
    const now = this.trail.at(t), on = t <= r.end ? Math.min(1, (t - r.t0) / 0.15) : Math.max(0, 1 - (t - r.end) / 0.3);
    // the light on the floor runs out with the flames (full length in about 0.45 s), not ahead of them
    const grown = Math.min(1, (t - r.t0) / 0.45);
    this.F.uFan.value.set(now.x, now.z, now.ang, NOZZLE.forward + (now.reach - NOZZLE.forward) * grown); this.F.uFanOn.value = on * (0.75 + 0.07 * n); this.F.uClock.value = t;
    this.F.uSootOn.value = t <= r.end ? Math.min(1, (t - r.t0) / 0.3) : Math.max(0, 1 - (t - r.end) / 6.0);
    this.fan.heightAt = () => groundY;
    this.fan.cover({ x0: now.x - now.reach - 3, z0: now.z - now.reach - 3, x1: now.x + now.reach + 3, z1: now.z + now.reach + 3 });
    // light: the staff's flare and the stream, brighter with more runes, only while it's running
    if (lights && t <= r.end) {
      const A = now, cs = Math.cos(A.ang), sn = Math.sin(A.ang), on2 = Math.min(1, (t - r.t0) / 0.12);
      const at = (f: number) => NOZZLE.forward + f * Math.max(0, A.reach - NOZZLE.forward);
      const flick = 0.85 + 0.15 * Math.sin(t * 23) * Math.sin(t * 7.3);
      lights.add(A.x + cs * at(0.1), groundY + NOZZLE.height, A.z + sn * at(0.1), 0xffc070, (2.2 + 0.5 * n) * on2 * flick, 5 + n);
      lights.add(A.x + cs * at(0.6), groundY + 1.1, A.z + sn * at(0.6), 0xff7a2a, (3.4 + 1.0 * n) * on2 * flick, 6 + 1.5 * n);
    }
  }

  dispose(): void { for (const l of this.layers) l.b.dispose(); this.body.dispose(); this.fan.dispose(); }
}
