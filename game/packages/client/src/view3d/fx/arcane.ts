/**
 * The Arcane beam in 3D, built to the crisp concept the user picked on 2026-11-25
 * (docs/reference/spell-concepts/arcane/crisp-beam-1.jpg: "the thinner version looks a bit more elegant"; record:
 * docs/explorations/2026-11-25-spell-concepts-tone.md). A thin, straight line of violet-magenta energy from the staff to
 * where the sim's beam stops.
 *
 * From the back to the front:
 *
 * 1. **The floor strip**: a narrow strip of magenta light on the floor under the beam (beam-strip.ts GroundStrip), with
 *    the surges flowing through it and a small pool where it lands. Never a wide wash.
 * 2. **The halo**: soft added light round the line; faint at one and two runes, a real halo from three.
 * 3. **The rim**: a thin dark violet edge, at least a pixel wide at any distance, so the line reads on pale stone.
 * 4. **The body**: saturated magenta, paling to pink toward the middle, with a slow scrolling shimmer.
 * 5. **The core**: a white-hot centre line, violet-white to three runes, pure white and wider from four.
 * 6. **Surges**: bright packets racing from the staff to the end, more and faster with runes; they brighten and widen
 *    the core and the body a little (not beads: toon-beam-4 showed bulges turn a beam into a string of objects).
 * 7. **Flares**: a glow and a small four-point star at the staff; at five runes rings pulse off it.
 * 8. **Sparks** shed off the line's sides from three runes.
 * 9. **The impact**, where the beam is stopped (a body or a wall; none when it runs out in the air), in two variants the
 *    user will pick from motion (`ImpactLook`): `a`, restrained, a small bright splash and a few sparks; `b`, fuller, the
 *    concept's burst: a big four-point star with a second one turning inside it, rings pulsing out and a spray of sparks.
 * 10. **Light**: a spell light at the staff and one at the impact (fx/lights.ts), small.
 *
 * The line itself is the sim's at every frame, so it follows the aim as the caster turns; the sparks fly from where the
 * beam was when they were born (AimTrail), so a sweep leaves them behind. Runes (the spell's queue length, 1..5, as the
 * pixel game's beam tiers): a thicker line, more and faster surges, the halo from three, the white core from four, the
 * staff's rings and a bigger impact at five. Every particle is a pure function of the clock and seeds.
 */
import * as THREE from 'three';
import { EL, KIND, MAX_SEATS, PHASE, SHAPES, specOf, type World } from '@wizard-sim/sim';
import { AIM_GLSL, AimTrail } from './aim-trail';
import { BeamStrip, GroundStrip } from './beam-strip';
import type { HeightAt } from './decal';
import { ParticleBatch, streamMotion } from './particles';
import type { SpellLights } from './lights';

/** The impact's two variants (cast3d.html ?impact=a|b): a restrained splash, or the concept's fuller burst. */
export type ImpactLook = 'a' | 'b';

/** Where the beam leaves the caster: the staff's tip forward of the middle and its height over the floor (u). */
export const BEAM_FROM = { forward: 0.4, height: 1.35 };

/** One Arcane beam the sim is channelling this tick. */
export interface BeamIn {
  /** Which beam: seat × 2, + 1 for the seat's Double's echo. */
  slot: number;
  /** Runes in the spell, 1..5. */
  n: number;
  /** Seconds the channel has run. */
  age: number;
  /** The caster's middle (three's x, z), the beam's angle (rad, from +x toward +z), and how far from the middle it ends (u). */
  x: number; z: number; ang: number; reach: number;
  /** Stopped by something (a body, a wall): it ends in an impact. */
  hit: boolean;
}

/** Every Arcane beam (not a heal; its look Arcane) the sim is channelling, and its Double's echo. */
export function arcaneBeams(w: World): BeamIn[] {
  const s = w.seats, b = w.bodies, out: BeamIn[] = [];
  for (let i = 0; i < MAX_SEATS; i++) {
    if (!s.active[i] || s.phase[i] !== PHASE.channel) continue;
    const spec = specOf(w, i);
    if (spec.shape !== 'beam' || spec.heal || (spec.look || spec.form) !== EL.arcane) continue;
    const n = Math.max(1, Math.min(5, spec.power || 1)), age = s.chanTicks[i] / 60, d = s.double[i];
    const one = (slot: number, x: number, y: number, ex: number, ey: number, aim: number) => {
      // the channel's end isn't set before its first tick (it reads as the room's origin): nothing yet
      const fresh = s.chanTicks[i] < 1, reach = fresh ? 0 : Math.min(SHAPES.beamRange, Math.hypot(ex - x, ey - y));
      out.push({ slot, n, age, x, z: y, ang: fresh || reach < 0.05 ? aim : Math.atan2(ey - y, ex - x), reach, hit: !fresh && reach < SHAPES.beamRange - 0.05 });
    };
    one(i * 2, b.x[i], b.y[i], s.chanEndX[i], s.chanEndY[i], Math.atan2(s.aimY[i], s.aimX[i]));
    if (d >= 0 && b.kind[d] === KIND.double) one(i * 2 + 1, b.x[d], b.y[d], s.dblEndX[i], s.dblEndY[i], Math.atan2(s.dblEndY[i] - b.y[d], s.dblEndX[i] - b.x[d]));
  }
  return out;
}

// ---- the line -----------------------------------------------------------------------------------------------------

/** The surges: spacing (u), speed (u/s) and length (u) at n runes; slower and softer than the pixel beam (art/kit.ts beamSurge) since round 3 (the user and Codex: racing white blocks read as beads). */
const surgeOf = (n: number) => { const v = 16.5 + 2.25 * n; return { v, sp: 2.4, len: 1.5 + 0.15 * n }; };
/** The body's and the core's half-widths (u) at n runes; the halo's reach and strength. A wizard is 2.7 u tall. */
const widthOf = (n: number) => ({
  body: 0.1 + 0.02 * n,
  core: n >= 4 ? 0.035 + 0.01 * n : 0.025 + 0.008 * n,
  halo: 0.45 + 0.09 * n,
  haloK: 0.55 + 0.1 * n,
});

const LINE = /* glsl */ `
uniform float uClock, uBody, uCore, uHalo, uHaloK, uWide, uWhite, uSurgeSp, uSurgeV, uSurgeL;
// Round 6, the user's pick: plasma core take 2. A white-hot core with no border, falling off sharply into magenta;
// around it a wispy violet plasma cloud peeling off the beam and drifting outward, thicker toward what it hits; pulses
// racing down the beam that brighten the core and light up the plasma round them (the user's Disintegrate description).
vec4 look(float along, float across, float len) {
  float ax = along < 0.0 ? -along : max(along - len, 0.0);
  float ends = smoothstep(-0.05, 0.35, along) * smoothstep(len + 0.3, len - 0.1, along);
  float d = length(vec2(ax, across)), side = abs(across);
  // pulses: fast packets racing out from the staff; one in seven skipped so they don't tick like a clock
  float ph = (along - uClock * uSurgeV) / uSurgeSp, f = fract(ph), L = min(uSurgeL / uSurgeSp, 0.9);
  // a long, soft pulse: a bright head and a long tail of light behind it
  float pulse = (f > 1.0 - L ? pow((f - (1.0 - L)) / L, 1.4) * smoothstep(1.0, 0.82, f) : 0.0) * step(0.14, rnd(floor(ph) + 4096.0, 5.0)) * ends;
  // the core and the body: gaussian falloffs, no edge to read as a border
  // a bulging glow where it leaves the staff (Diablo 3's Disintegrate), swelling core, body and plasma there
  float bulge = exp(-along * along / 0.35);
  float cw = uCore * uWide * (1.0 + 0.9 * pulse + 1.6 * bulge) + 0.008, bw = uBody * uWide * (1.0 + 2.2 * bulge);
  float core = exp(-(d * d) / (cw * cw) * 1.5) * ends, body = exp(-(d * d) / (bw * bw) * 1.2) * ends;
  // the plasma: two noises flowing slowly along and outward from the line, cut into wisps, inside an envelope that
  // widens toward the hit
  float reachW = uHalo * uWide * (0.7 + 0.8 * smoothstep(0.2 * len, len, along) + 1.2 * bulge + 0.7 * exp(-pow(along - len, 2.0) / 0.25));
  vec3 pq = vec3(along * 1.3 - uClock * 1.2, side * 2.4 - uClock * 1.1, uClock * 0.45 + sign(across) * 3.7);
  // tendrils: ridged noise (bright where the noise crosses its middle) gives thin curling filaments with gaps between
  float n = fbm3(pq), n2 = fbm3(pq * 2.2 + vec3(5.0, 1.0, uClock * 0.8));
  float ridge = 1.0 - abs(n * 2.0 - 1.0), ridge2 = 1.0 - abs(n2 * 2.0 - 1.0);
  float env = exp(-(side * side) / (reachW * reachW) * 1.4);
  float wisp = (smoothstep(0.78, 0.97, ridge) + 0.6 * smoothstep(0.82, 0.98, ridge2)) * env * ends;
  float haze = env * env * 0.18 * ends;
  float lit = 0.55 + 1.1 * pulse + 0.8 * bulge;
  float cloudW = reachW * 0.75, around = exp(-(side * side) / (cloudW * cloudW) * 1.8);
  float pulseCloud = pulse * around * (0.75 + 0.5 * n);
  float dHit = length(vec2(along - len, across)), hitR = uHalo * uWide * 1.6;
  float hitCloud = exp(-(dHit * dHit) / (hitR * hitR) * 1.6) * (0.65 + 0.7 * n2) * step(0.3, len) * uWide;
  vec3 c = vec3(1.2, 0.06, 2.0) * wisp * lit * uHaloK * 1.8 + vec3(0.7, 0.03, 1.0) * haze * lit;
  c += mix(vec3(1.5, 0.18, 1.9), vec3(2.4, 0.9, 2.8), body) * body * (1.0 + 0.4 * pulse + 0.6 * bulge);
  c += mix(vec3(3.0, 2.2, 3.4), vec3(5.0, 4.8, 5.2), max(uWhite, pulse)) * core;
  c += vec3(1.7, 0.25, 2.3) * pulseCloud * 1.2 + vec3(2.0, 0.45, 2.6) * hitCloud * 1.4;
  float a = clamp(body * 0.85 + wisp * 0.55 * uHaloK + haze * 0.5 + pulseCloud * 0.35 + hitCloud * 0.45, 0.0, 0.95);
  return vec4(c, a);
}`;

/**
 * The haze round the beam (drawn into the stage's distortion pass): a pixel offset from two noises flowing along it,
 * strongest a little outside the bright body, none inside it, fading at both ends.
 */
const HAZE = /* glsl */ `
uniform float uClock, uHazeW, uOnH;
vec4 look(float along, float across, float len) {
  float x = abs(across);
  float env = smoothstep(uHazeW, uHazeW * 0.45, x) * smoothstep(uHazeW * 0.12, uHazeW * 0.3, x)
            * smoothstep(-0.2, 0.6, along) * smoothstep(len + 0.3, len - 0.5, along);
  vec3 p = vec3(along * 2.3 - uClock * 5.0, across * 4.5, uClock * 1.4);
  float n1 = vnoise3(p) - 0.5, n2 = vnoise3(p * 1.9 + vec3(17.0, 5.0, uClock * 0.7)) - 0.5;
  float amp = 2.4 * env * uOnH;
  return vec4((n1 * 1.4 + n2 * 0.6) * amp, (n2 * 1.4 - n1 * 0.6) * amp * 0.6, 0.001 + env, 0.0);
}`;

const FLOOR = /* glsl */ `
uniform float uFW, uOnG, uClock, uSurgeSp, uSurgeV, uHitG, uFK;
vec4 look(float along, float across, float len) {
  float k = exp(-(across * across) / (uFW * uFW) * 2.5);
  float ends = smoothstep(-0.3, 0.9, along) * (1.0 - smoothstep(len - 0.1, len + 0.3, along));
  float f = fract((along - uClock * uSurgeV) / uSurgeSp), surge = smoothstep(0.55, 1.0, f) * smoothstep(1.0, 0.97, f);
  float strip = k * ends * (0.85 + 0.0 * surge);
  float dl = along - len, pool = uHitG * exp(-(dl * dl + across * across) / 0.3);
  float e = (strip * uFK + pool * 0.9) * uOnG;
  return vec4(vec3(1.0, 0.14, 1.15) * e, 0.0);
}`;

// ---- particles -----------------------------------------------------------------------------------------------------

/**
 * Shared by the particle layers: the beam's trail (x, z of the caster, angle, reach; reach is negative where nothing
 * stopped the beam) and its level: x the staff's forward offset, y the beam's height, z the floor's.
 */
const HEAD = /* glsl */ `
${AIM_GLSL}
uniform vec4 uLev;
uniform float uN, uImp;
vec3 beamPt(vec4 A, float d) { vec2 dir = vec2(cos(A.z), sin(A.z)), g = A.xy + dir * d; return vec3(g.x, uLev.y, g.y); }
`;

/** Each layer's births a second and life (s), at n runes and impact variant (0 a, 1 b). */
const RATE = {
  hit: (n: number, b: number) => (b ? 26 + 6 * n : 34 + 8 * n), hitLife: (b: number) => (b ? 0.42 : 0.32),
  shed: (n: number) => 8 + 6 * n, shedLife: 0.4,
};

/** Sparks off the impact, thrown back toward the caster (a: a narrow splash; b: wide, faster, more). */
const HIT_SPARKS = streamMotion(/* glsl */ `${HEAD}
Particle particle(float k, float age, float ts) {
  vec4 A = aimAt(uTime - ts);
  if (A.w <= 0.0 || ts < 0.08) return P0();
  float tt = age * uLife, back = A.z + 3.14159265;
  float a = back + (rnd(k, 1.0) * 2.0 - 1.0) * mix(1.7, 2.4, uImp);
  float v = mix(3.0, 3.0, uImp) + rnd(k, 2.0) * mix(5.5, 6.5, uImp), up = (rnd(k, 3.0) * 1.6 - 0.45) * v * 0.55;
  Particle p = P0(); p.alive = true;
  p.pos = beamPt(A, A.w) + vec3(cos(a) * v, up, sin(a) * v) * tt + vec3(0.0, -5.0 * tt * tt, 0.0);
  p.pos.y = max(p.pos.y, uLev.z + 0.03);
  p.size = mix(0.03, 0.03, uImp) * (1.0 - 0.5 * age);
  p.stretch = 0.03;
  p.col = vec4(age, rnd(k, 4.0), 0.0, 1.0 - age * age);
  return p;
}`);

/** Sparks shed off the line's sides from three runes, from where the beam was when they were born. */
const SHED = streamMotion(/* glsl */ `${HEAD}
Particle particle(float k, float age, float ts) {
  vec4 A = aimAt(uTime - ts);
  float L = abs(A.w) - uLev.x;
  if (L < 0.6) return P0();
  float tt = age * uLife, d = uLev.x + 0.3 + rnd(k, 11.0) * (L - 0.3), side = rnd(k, 12.0) < 0.5 ? -1.0 : 1.0, v = 0.5 + rnd(k, 13.0) * 1.3;
  vec2 dir = vec2(cos(A.z), sin(A.z)), nn = vec2(-dir.y, dir.x) * side;
  Particle p = P0(); p.alive = true;
  p.pos = beamPt(A, d) + vec3(nn.x, 0.0, nn.y) * (0.05 + v * tt) + vec3(0.0, (rnd(k, 14.0) - 0.35) * v * tt - 2.2 * tt * tt, 0.0);
  p.size = 0.018; p.stretch = 0.03;
  p.col = vec4(age, rnd(k, 15.0), 0.0, 1.0 - age);
  return p;
}`);

/** A spark: covering, so it shows on pale stone; white-pink cooling to magenta. */
const LOOK_SPARK = /* glsl */ `
vec4 look(vec2 uv, vec4 col, vec4 data) {
  float m = smoothstep(1.0, 0.25, length(uv));
  vec3 c = mix(vec3(4.0, 2.6, 4.2), vec3(1.3, 0.12, 1.5), smoothstep(0.1, 0.7, col.x));
  return vec4(c * m, m * 0.85) * col.w;
}`;

/**
 * The flares (not a stream: eight fixed shapes, each one surface, never a cluster). 0 the staff's flash, 1 its star; 2 the
 * impact's flash, 3 its star; 4 the second star turning inside it (b); 5, 6 shockwave rings pulsing out of the impact
 * (b); 7 a ring pulsing off the staff (five runes). data.x is the kind: 1 a four-point star, 2 a shockwave ring, 3 a
 * flash disc (toon bands, its edge eroded by noise); data.y a seed for its noise.
 */
const FLARE = /* glsl */ `
uniform float uTime, uOnF, uHitOn;
uniform vec3 uStaff, uHit;
${HEAD}
Particle emitParticle(float slot, float back) {
  Particle p = P0();
  float t = uTime - back, fl = 0.88 + 0.12 * sin(t * 37.0) * sin(t * 13.0 + 1.0);
  p.alive = true; p.col = vec4(1.0);
  if (slot < 0.5) { p.pos = uStaff; p.size = (0.38 + 0.06 * uN) * fl * uOnF; p.data = vec4(3.0, 1.0, 0.0, 0.0); }
  else if (slot < 1.5) { p.pos = uStaff; p.size = (0.2 + 0.04 * uN) * fl * uOnF; p.data.x = 1.0; }
  else if (slot < 2.5) { p.pos = uHit; p.size = 0.0; p.data = vec4(3.0, 2.0, 0.0, 0.0); }
  else if (slot < 3.5) { p.pos = uHit; p.size = (0.12 + 0.02 * uN) * fl * uHitOn; p.rot = 0.06 * sin(t * 5.0); p.data.x = 1.0; }
  else if (slot < 4.5) { p.pos = uHit; p.size = (0.32 + 0.06 * uN) * (0.8 + 0.2 * sin(t * 19.0)) * uHitOn * step(0.5, uImp); p.rot = 0.785 + t * 0.9; p.data.x = 1.0; p.col.w = 0.7; }
  else if (slot < 6.5) {
    float ph = fract(t * 2.4 + (slot - 5.0) * 0.5);
    p.pos = uHit; p.size = (0.2 + ph * (0.6 + 0.12 * uN)) * uHitOn * step(0.5, uImp); p.data = vec4(2.0, slot, ph, 0.0); p.col.w = 1.0 - ph;
  } else {
    float ph = fract(t * 2.2);
    p.pos = uStaff; p.size = (0.12 + ph * 0.6) * uOnF * step(4.5, uN); p.data = vec4(2.0, 9.0, ph, 0.0); p.col.w = 1.0 - ph;
  }
  return p;
}`;

const LOOK_FLARE = /* glsl */ `
uniform float uTime;
vec4 look(vec2 uv, vec4 col, vec4 data) {
  float r = length(uv), aa = fwidth(r) * 1.2;
  // the edge's wobble round the circle (seamless: noise sampled on a circle), moving with time
  vec2 cs = r > 1e-4 ? uv / r : vec2(1.0, 0.0);
  float wob = vnoise3(vec3(cs * 1.8 + data.y * 7.0, uTime * 7.0 + data.y)) * 0.65 + vnoise3(vec3(cs * 4.0 - data.y * 3.0, uTime * 11.0)) * 0.35;
  if (data.x > 2.5) {
    // a flash disc in toon bands (white, pale pink, magenta, a thin dark violet rim) with a soft translucent fringe
    float R = 0.62 + 0.3 * wob, q = r / R;
    float b1 = smoothstep(0.4 + aa, 0.4 - aa, q), b2 = smoothstep(0.7 + aa, 0.7 - aa, q), b3 = smoothstep(0.92 + aa, 0.92 - aa, q), b4 = smoothstep(1.0 + aa, 1.0 - aa, q);
    vec3 c = mix(vec3(0.16, 0.015, 0.24), mix(vec3(1.2, 0.1, 1.45), mix(vec3(2.6, 0.9, 2.9), vec3(4.6, 4.0, 4.9), b1), b2), b3);
    float fringe = (1.0 - b4) * smoothstep(1.45, 1.0, q) * 0.35;
    return vec4(c * b4 + vec3(1.0, 0.1, 1.2) * fringe, b4 * 0.92) * col.w;
  }
  if (data.x < 1.5) {
    // four sharp rays tapering to their tips, white down the middle, magenta at their edges, a dark violet outline
    float ax = abs(uv.x), ay = abs(uv.y);
    float wh = 0.11 * pow(max(1.0 - ax, 0.0), 1.6), wv = 0.11 * pow(max(1.0 - ay, 0.0), 1.6);
    float aa = fwidth(uv.x) * 1.2;
    float h = smoothstep(wh + aa, wh - aa, ay), v = smoothstep(wv + aa, wv - aa, ax);
    float ho = smoothstep(wh * 1.6 + aa + 0.012, wh * 1.6 - aa + 0.012, ay) * step(ax, 0.97), vo = smoothstep(wv * 1.6 + aa + 0.012, wv * 1.6 - aa + 0.012, ax) * step(ay, 0.97);
    float ray = max(h, v), out1 = max(ho, vo), inner = max(h * smoothstep(wh, 0.0, ay), v * smoothstep(wv, 0.0, ax));
    float core = exp(-r * r * 30.0);
    vec3 c = mix(vec3(1.5, 0.15, 1.7), vec3(4.5, 3.8, 4.8), max(inner, core));
    vec3 rgb = mix(vec3(0.14, 0.015, 0.22), c, ray) * out1 + vec3(1.0, 0.1, 1.2) * exp(-r * r * 6.0) * 0.4;
    return vec4(rgb, out1 * 0.95) * col.w;
  }
  // a shockwave ring: a white leading edge, a magenta band behind it, broken by the noise as it thins out
  float w = mix(0.16, 0.05, data.z), d = r - 0.85;
  float band = smoothstep(aa, -aa, d) * smoothstep(-w - aa, -w + aa, d);
  float lead = smoothstep(aa, -aa, d) * smoothstep(-w * 0.35 - aa, -w * 0.35 + aa, d);
  float keep = step(data.z * 0.8, wob);
  vec3 c = mix(vec3(1.3, 0.12, 1.5), vec3(4.2, 3.4, 4.5), lead);
  return vec4(c * band * keep, band * keep * 0.6) * col.w;
}`;

/** One beam slot's drawing: the line, its floor strip, the flares and sparks, and its two lights. */
export class ArcaneBeam {
  readonly group = new THREE.Group();
  private trail = new AimTrail();
  /** The channel as seen (effect clock), the caster's floor height, and its runes; null when nothing is drawn. */
  private rec: { t0: number; end: number; last: number; n: number; groundY: number } | null = null;
  private line: BeamStrip;
  /** The heat haze round the line (the stage's distortion pass; ArcaneBeams.haze holds it). */
  readonly haze: BeamStrip;
  private H = { uClock: { value: 0 }, uHazeW: { value: 0.6 }, uOnH: { value: 0 } };
  private floor: GroundStrip;
  private flare: ParticleBatch;
  private sparks: ParticleBatch;
  private shed: ParticleBatch;
  private U = {
    uTime: { value: 0 }, uEnd: { value: 1e9 }, uN: { value: 1 }, uImp: { value: 0 }, uLev: { value: new THREE.Vector4(BEAM_FROM.forward, BEAM_FROM.height, 0, 0) }, uAim: this.trail.uniform,
  };
  private L = {
    uClock: { value: 0 }, uBody: { value: 0.1 }, uCore: { value: 0.03 }, uHalo: { value: 0.15 }, uHaloK: { value: 0.2 }, uWide: { value: 1 }, uWhite: { value: 0 },
    uSurgeSp: { value: 3 }, uSurgeV: { value: 20 }, uSurgeL: { value: 0.5 },
  };
  private G = { uFW: { value: 0.5 }, uOnG: { value: 0 }, uHitG: { value: 0 }, uFK: { value: 0.5 } };
  private F = { uOnF: { value: 0 }, uHitOn: { value: 0 }, uStaff: { value: new THREE.Vector3() }, uHit: { value: new THREE.Vector3() } };
  private a = new THREE.Vector3();
  private b = new THREE.Vector3();

  constructor(seed: number, heightAt: HeightAt) {
    this.line = new BeamStrip({ look: LINE, uniforms: this.L, order: 3 });
    this.haze = new BeamStrip({ look: HAZE, uniforms: this.H, soft: 0.4 });
    this.haze.mesh.visible = false;
    this.floor = new GroundStrip({ look: FLOOR, uniforms: { ...this.G, uClock: this.L.uClock, uSurgeSp: this.L.uSurgeSp, uSurgeV: this.L.uSurgeV } }, heightAt);
    this.flare = new ParticleBatch({ motion: FLARE, look: LOOK_FLARE, cap: 8, order: 5, soft: 0.2, uniforms: { ...this.U, ...this.F } });
    this.sparks = new ParticleBatch({ motion: HIT_SPARKS, look: LOOK_SPARK, cap: Math.ceil(RATE.hit(5, 1) * RATE.hitLife(1)) + 2, order: 4, soft: 0.1, uniforms: { ...this.U, uRate: { value: 1 }, uLife: { value: 1 } } });
    this.sparks.u.uSeed.value = seed + 1;
    this.shed = new ParticleBatch({ motion: SHED, look: LOOK_SPARK, cap: Math.ceil(RATE.shed(5) * RATE.shedLife) + 2, order: 4, soft: 0.1, uniforms: { ...this.U, uRate: { value: 1 }, uLife: { value: 1 } } });
    this.shed.u.uSeed.value = seed + 2;
    this.group.add(this.floor.mesh, this.line.mesh, this.sparks.mesh, this.shed.mesh, this.flare.mesh);
    this.group.visible = false;
  }

  /**
   * One frame at time t (s, the effect clock): `beam` is this slot's beam from the sim (arcaneBeams()), or null when it
   * isn't channelling; `groundY` the floor's height under the caster.
   */
  update(t: number, beam: BeamIn | null, groundY: number, impact: ImpactLook, lights: SpellLights | null): void {
    let r = this.rec;
    if (r && t < r.t0) { r = this.rec = null; this.trail.clear(); }
    if (beam) {
      const t0 = t - beam.age;
      if (!r || r.end < t || Math.abs(r.t0 - t0) > 0.05) { r = this.rec = { t0, end: Infinity, last: t, n: beam.n, groundY }; this.trail.clear(); }
      r.last = t; r.n = beam.n; r.groundY = groundY;
      this.trail.record(t, { x: beam.x, z: beam.z, ang: beam.ang, reach: beam.hit ? beam.reach : -beam.reach });
    } else if (r && r.end === Infinity) r.end = r.last;
    if (r && t > r.end + RATE.hitLife(1) + 0.05) r = this.rec = null;
    this.group.visible = !!r;
    if (!r) { this.haze.mesh.visible = false; return; }
    const n = r.n, imp = impact === 'b' ? 1 : 0, gy = r.groundY;
    this.trail.fill(t);
    const now = this.trail.at(t), hit = now.reach > 0, reach = Math.abs(now.reach);
    const grow = 1 - (1 - Math.min(1, Math.max(0, (t - r.t0) / 0.1))) ** 2;
    const wide = t <= r.end ? 1 : Math.max(0, 1 - (t - r.end) / 0.14);
    const cs = Math.cos(now.ang), sn = Math.sin(now.ang), len = Math.max(0, reach - BEAM_FROM.forward) * grow;
    this.a.set(now.x + cs * BEAM_FROM.forward, gy + BEAM_FROM.height, now.z + sn * BEAM_FROM.forward);
    this.b.set(this.a.x + cs * len, this.a.y, this.a.z + sn * len);
    // the line
    const W = widthOf(n), S = surgeOf(n);
    this.L.uClock.value = t; this.L.uBody.value = W.body; this.L.uCore.value = W.core; this.L.uHalo.value = W.halo; this.L.uHaloK.value = W.haloK;
    this.L.uWide.value = Math.sqrt(wide); this.L.uWhite.value = n >= 4 ? 1 : 0; this.L.uSurgeSp.value = S.sp; this.L.uSurgeV.value = S.v; this.L.uSurgeL.value = S.len;
    this.line.mesh.visible = wide > 0 && len > 0.01;
    this.line.set(this.a, this.b, W.halo * 2.6 + 0.2, W.halo * 1.8 + 0.3);
    // its haze: a band about a wizard's arm either side of the line
    this.H.uClock.value = t; this.H.uHazeW.value = 0.5 + 0.04 * n; this.H.uOnH.value = wide * grow;
    this.haze.mesh.visible = this.line.mesh.visible;
    this.haze.set(this.a, this.b, this.H.uHazeW.value + 0.05, 0.3);
    // the floor strip
    const hitOn = hit && grow >= 1 ? wide : 0;
    this.G.uFW.value = 0.7 + 0.1 * n; this.G.uOnG.value = wide * grow; this.G.uHitG.value = hitOn * (imp ? 1.3 : 0.8); this.G.uFK.value = 0.45 + 0.06 * n;
    this.floor.mesh.visible = this.line.mesh.visible;
    this.floor.set(this.a.x, this.a.z, this.b.x, this.b.z, Math.max(this.G.uFW.value * 1.6, 1.2), 1.2);
    // particles
    this.U.uTime.value = t - r.t0; this.U.uEnd.value = r.end === Infinity ? 1e9 : r.end - r.t0; this.U.uN.value = n; this.U.uImp.value = imp;
    this.U.uLev.value.set(BEAM_FROM.forward, gy + BEAM_FROM.height, gy, 0);
    this.F.uOnF.value = wide * Math.min(1, (t - r.t0) / 0.06); this.F.uHitOn.value = hitOn; this.F.uStaff.value.copy(this.a); this.F.uHit.value.copy(this.b);
    this.sparks.u.uRate.value = RATE.hit(n, imp); this.sparks.u.uLife.value = RATE.hitLife(imp);
    this.shed.u.uRate.value = Math.max(1e-3, RATE.shed(n)); this.shed.u.uLife.value = RATE.shedLife;
    // light: small, at the staff and where it lands
    if (lights && wide > 0) {
      const flick = 0.85 + 0.15 * Math.sin(t * 31) * Math.sin(t * 11.7);
      lights.add(this.a.x, this.a.y, this.a.z, 0xd050ff, (0.9 + 0.25 * n) * wide * flick, 3);
      if (hitOn > 0) lights.add(this.b.x, this.b.y, this.b.z, 0xff50f0, (imp ? 2.4 + 0.8 * n : 1.4 + 0.4 * n) * hitOn * flick, imp ? 4 + 0.4 * n : 3 + 0.2 * n);
    }
  }

  dispose(): void { this.line.dispose(); this.haze.dispose(); this.floor.dispose(); this.flare.dispose(); this.sparks.dispose(); this.shed.dispose(); }
}

/** Every seat's Arcane beam and its Double's echo: a fixed pool of slots, each drawn while its beam runs. */
export class ArcaneBeams {
  readonly group = new THREE.Group();
  /** The impact variant drawn (cast3d.html ?impact=). */
  impact: ImpactLook = 'a';
  private slots: ArcaneBeam[] = [];
  /** Every beam's haze strip: the host adds it to the stage's distortion scene (FxStage.distort). */
  readonly haze = new THREE.Group();

  constructor(private heightAt: HeightAt) {
    for (let k = 0; k < MAX_SEATS * 2; k++) { const s = new ArcaneBeam(31 + k * 13, heightAt); this.slots.push(s); this.group.add(s.group); this.haze.add(s.haze.mesh); }
  }

  /** One frame: the world's beams at effect time t. */
  update(w: World, t: number, lights: SpellLights | null): void {
    const all = arcaneBeams(w);
    for (let k = 0; k < this.slots.length; k++) {
      const b = all.find((q) => q.slot === k) ?? null;
      this.slots[k].update(t, b, b ? this.heightAt(b.x, b.z) : 0, this.impact, lights);
    }
  }

  dispose(): void { for (const s of this.slots) s.dispose(); }
}
