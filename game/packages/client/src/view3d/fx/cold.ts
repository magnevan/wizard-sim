/**
 * The Cold family in 3D: the Frost ring (Cold, Area), built to the crisp concept the user picked on 2026-11-25
 * (docs/reference/spell-concepts/cold/crisp-nova-1.jpg, toned down: "it feels a bit intense"; record:
 * docs/explorations/2026-11-25-spell-concepts-tone.md, "The build: the Frost ring").
 *
 * A thin, glassy, serrated frost front that sweeps outward and shatters where it stops. From the floor up:
 *
 * 1. **Rime**: a pale grey-blue film with fine white veins on the stone the front passed over, round where the ring
 *    was cast; it stays put (the caster may walk off) and melts unevenly over a few seconds.
 * 2. **The front's light on the floor**: a thin cool band just under the front (additive, dim), and one dim cyan
 *    spell light while it sweeps. Light hugs the ring; no wash.
 * 3. **The front** (nova-ring.ts): one connected mesh band of ice teeth, knee-high at most, its top edge cut into
 *    sharp crystals (big teeth, a finer saw between them, a low connected band under both), shaded in three stepped
 *    toon bands and by facet (the side left of each tip lit), a white band under a soft translucent outline, a dark
 *    steel line at the foot. It leans a little outward. Its teeth break one by one where it stops; at five runes it
 *    stands a moment first.
 * 4. **Mist**: a second, lower ring band just outside the front, translucent and eroded by rolling noise: one soft
 *    veil at the edge, never puffs, never inside the ring.
 * 5. **Glints**: a few glassy slivers (8 + 3 a rune) thrown off as the teeth break; the only particles in it.
 *
 * Round 2 (the effects study, 2026-11-25; the user: "a blast wave in a snowy landscape") adds a wall of snow powder
 * riding over the teeth (LOOK_BLAST), snow puffs thrown with it, flakes settling after it, a flash at the caster, three
 * times the shards and a nearly opaque frost.
 *
 * No layer is a cluster of sprites (the user's verdict on the first built fire, 2026-11-25).
 *
 * Sizes and timing are the sim's: the radius from the burst event (SHAPES.novaRadius + novaPerRune a rune), the sim
 * hits the whole disc at once, and the front takes the pixel game's time to get there (art/novas.ts: 0.38 s for a
 * three-unit ring, a bigger ring slower in proportion, so the front always travels at the same speed). The front
 * follows a caster who walks, most of the way (0.8, as the pixel game's vfx.ts novaDepth); the rime stays where it was
 * cast.
 *
 * Stateless in the kit's sense: every frame is a function of the clock, the event and the caster's path, which is
 * kept per sim tick and cut back on a rewind, so rollback and the lab's frozen moments draw the same thing.
 */
import * as THREE from 'three';
import { EL, MAX_SEATS, SHAPES, specOf, type SpellSpec, type World } from '@wizard-sim/sim';
import { GroundDecal } from './decal';
import type { SpellLights } from './lights';
import { NovaRing } from './nova-ring';
import { ParticleBatch } from './particles';

/** Is this spell the Frost ring (drawn here; the stand-ins skip its burst)? Ice's ring and the mixed rings aren't, yet. */
export const isColdNova = (s: SpellSpec | null | undefined): boolean =>
  !!s && s.shape === 'nova' && (s.look || s.form) === EL.cold && !s.heal && !s.scald && !s.freeze;

/** How the front moves, in seconds and u (art/novas.ts cold(), in 3D units). */
export const COLD = {
  /** Seconds the front takes to reach a three-unit ring; a ring of radius r takes stretch(r) times that. */
  reach: 0.32,
  /** Where the front starts (u from the centre). */
  r0: 0.35,
  /** The front's height at one rune and per extra rune (u: knee-high at three, a 2.7 u wizard). */
  height: 0.66, heightPerRune: 0.12,
  /** How far the top leans out, as a share of the height. */
  lean: 0.22,
  /** Teeth: one big tooth about every `tooth` u of the final ring. */
  tooth: 0.42,
  /** How much of the caster's walk the front follows (vfx.ts novaDepth's drag). */
  follow: 0.8,
  /** The rime: whole until `rimeHold` s, melted by `rimeHold + rimeMelt + rimePerRune × (n - 1)`. */
  rimeHold: 1.1, rimeMelt: 1.9, rimePerRune: 0.25,
  /** The snow wall riding over the ice: its height at one rune and per extra rune (u), and how far its top leans out. */
  blast: 0.95, blastPerRune: 0.15, blastLean: 0.45,
};

/** How much slower than the tuned timing a ring of radius r plays (art/novas.ts novaStretch, without its knob). */
export const stretchOf = (r: number): number => Math.min(3, Math.max(0.7, r / SHAPES.novaRadius));
/** The runes behind a ring of radius r (the sim's radius ladder, read back). */
export const runesOf = (r: number): number => Math.max(1, Math.min(5, Math.round((r - SHAPES.novaRadius) / SHAPES.novaPerRune) + 1));
/** At five runes the front stands this much longer (in units of its reach time) before it breaks. */
const holdOf = (n: number): number => (n >= 5 ? 0.55 : 0);
/** Seconds a ring of radius r is drawn for, rime included. */
export const lifeOf = (r: number): number => COLD.rimeHold + COLD.rimeMelt + COLD.rimePerRune * (runesOf(r) - 1) + 0.2;

/** Glints at most a ring: a few slivers as the teeth break, the only particles in it. */
const SHARD_CAP = 72;
/** Snow puffs riding the blast, and flakes settling after it, at most a ring. */
const PUFF_CAP = 300, FLAKE_CAP = 70;

/** Ticks of the caster's path kept a ring, and the spacing of its samples on the GPU. */
const PATH_TICKS = 120, PATH_N = 32, PATH_STEP = 4;

/** Shared GLSL: the teeth (the wall and the shards must agree on where a tooth is and when it breaks). */
const TEETH = /* glsl */ `
uniform float uNt, uHold;
// a tooth's tip position (0..1 across it), height share and break moment (in reach times)
float toothTip(float ti) { return 0.28 + 0.44 * rnd(ti, 2.0); }
float toothH(float ti) { float r = rnd(ti, 1.0); return 0.45 + 0.55 * r * r; }
float toothBreak(float ti) { return 0.86 + uHold + 0.32 * rnd(ti, 3.0); }
float tri(float u, float c) { return u < c ? u / c : (1.0 - u) / (1.0 - c); }
`;

/** The front: the ring's look (nova-ring.ts). uQ: the age in reach times; uGrow: how much of its height it has. */
const LOOK_FRONT = /* glsl */ `
uniform float uQ, uGrow;
${TEETH}
vec4 look(vec2 p) {
  float a = p.x / 6.2831853;
  float f = a * uNt, ti = floor(f), u = fract(f), c = toothTip(ti);
  float brk = clamp((uQ - toothBreak(ti)) / 0.12, 0.0, 1.0);
  float big = toothH(ti) * pow(tri(u, c), 0.65);
  float f2 = a * uNt * 2.6, t2 = floor(f2), u2 = fract(f2);
  float brk2 = clamp((uQ - 0.84 - uHold - 0.3 * rnd(t2, 6.0)) / 0.1, 0.0, 1.0);
  float small = (0.3 + 0.22 * rnd(t2, 4.0)) * tri(u2, 0.3 + 0.4 * rnd(t2, 5.0));
  float band = 0.3;
  float gone = max(brk, clamp((uQ - 0.8 - uHold) / 0.4, 0.0, 1.0));
  if (vnoise3(vec3(a * uNt * 3.0, p.y * 5.0, ti * 0.37)) < gone) return vec4(0.0);
  float h = max(band, max(big, small));
  float top = uHeight * uGrow * h, d = top - p.y;
  float aa = fwidth(p.y) + 1e-4;
  float inside = smoothstep(-aa, aa, d);
  if (inside <= 0.0 || top <= 0.002) return vec4(0.0);
  float yN = clamp(p.y / max(uHeight * uGrow, 1e-3), 0.0, 1.0);
  // toon facets: the face left of a tooth's tip catches the light, the right is in shade
  float onBig = big >= small && big >= band ? 1.0 : 0.0;
  float lit = onBig > 0.5 ? (u < c ? 1.0 : 0.62) : (u2 < 0.5 ? 0.9 : 0.68);
  // stepped toon bands (three tones up the crystal, stepped again by the facet), not a smooth gradient; nearly opaque
  // in the body (see-through ice over the warm floor mixes to grey)
  float glint = vnoise3(vec3(a * uNt * 4.0, p.y * 1.5, ti));
  float tone = (yN + 0.25 * (glint - 0.5)) * lit;
  float band3 = tone < 0.3 ? 0.0 : tone < 0.62 ? 0.5 : 1.0;
  vec3 body = band3 < 0.25 ? vec3(0.04, 0.3, 0.75) : band3 < 0.75 ? vec3(0.16, 0.62, 1.1) : vec3(0.5, 1.0, 1.4);
  float alpha = 0.86;
  // the edge: a white band just inside the top, then the outline itself soft and translucent (no hard cut-out)
  float white = smoothstep(0.08, 0.05, d);
  vec3 col = mix(body, vec3(1.5, 1.7, 1.8), white * 0.9);
  float soft = smoothstep(0.0, 0.035, d);
  alpha = mix(alpha, 0.92, white) * mix(0.35, 1.0, soft);
  // a thin darker steel line low on the crystal where it meets the floor
  col = mix(col, vec3(0.03, 0.12, 0.25), smoothstep(0.06, 0.0, p.y) * 0.7);
  return vec4(col * alpha, alpha) * inside;
}`;

/** The caster's path and the front's radius, for the particles: `centerAt(age)`, `frontR(age)`. */
const PATH_GLSL = /* glsl */ `
uniform vec2 uPath[${PATH_N}];
uniform float uAge, uR, uTr, uR0, uH, uGy;
vec2 centerAt(float a) {
  float f = clamp(a * 60.0 / ${PATH_STEP}.0, 0.0, ${PATH_N - 1}.0); int i = int(floor(f)), j = min(i + 1, ${PATH_N - 1});
  return mix(uPath[i], uPath[j], fract(f));
}
float frontR(float a) { float q = clamp(a / uTr, 0.0, 1.0); return mix(uR0, uR, 1.0 - pow(1.0 - q, 1.3)); }
`;

/** Shards: slivers off each tooth as it breaks (most), and off the crest as it runs (a few). */
const SHARDS = /* glsl */ `
${TEETH}
${PATH_GLSL}
uniform float uShards;
Particle emitParticle(float k, float back) {
  if (k >= uShards) return P0();
  float ti = floor(rnd(k, 11.0) * uNt), early = rnd(k, 12.0) < 0.2 ? 1.0 : 0.0;
  float th = (ti + toothTip(ti) + (rnd(k, 13.0) - 0.5) * 1.6) / uNt * 6.2831853;
  float born = early > 0.5 ? (0.25 + 0.6 * rnd(k, 14.0)) * uTr : (toothBreak(ti) + 0.05 * rnd(k, 14.0)) * uTr;
  float life = 0.45 + 0.35 * rnd(k, 15.0), a = uAge - back - born;
  if (a < 0.0 || a > life) return P0();
  vec2 d = vec2(cos(th), sin(th)), c = centerAt(born);
  float r = frontR(born), h0 = uH * (0.25 + 0.6 * rnd(k, 16.0)) * toothH(ti);
  float sp = 1.2 + 2.4 * rnd(k, 17.0), up = 1.2 + 2.2 * rnd(k, 18.0);
  float y = h0 + up * a - 4.9 * a * a;
  if (y < 0.0) return P0();
  Particle p = P0(); p.alive = true;
  // out from the ring, and a little along it, so a tooth's slivers fan out instead of flying in one line
  vec2 tang = vec2(-d.y, d.x) * (rnd(k, 21.0) - 0.5) * 2.4;
  p.pos = vec3(c.x + (d.x * (r + sp * a)) + tang.x * a, uGy + y, c.y + (d.y * (r + sp * a)) + tang.y * a);
  p.size = 0.06 + 0.07 * rnd(k, 19.0); p.aspect = 0.45; p.stretch = 0.02;
  p.col = vec4(a / life, 0.0, 0.0, 1.0 - smoothstep(0.6, 1.0, a / life));
  p.data = vec4(rnd(k, 20.0), 0.0, 0.0, 0.0);
  return p;
}`;

const LOOK_SHARD = /* glsl */ `
vec4 look(vec2 uv, vec4 col, vec4 data) {
  float m = 1.0 - (abs(uv.x) + abs(uv.y));
  if (m <= 0.0) return vec4(0.0);
  float edge = smoothstep(0.0, 0.25, m), core = smoothstep(0.35, 0.7, m);
  vec3 c = mix(vec3(0.04, 0.2, 0.42), mix(vec3(0.4, 0.8, 1.1), vec3(1.25, 1.4, 1.5), core), edge);
  float a = smoothstep(0.0, 0.08, m) * 0.9 * col.w;
  return vec4(c * a, a);
}`;

/**
 * Mist: a low translucent veil just outside the front (a second ring band, nova-ring.ts), eroded by noise that rolls
 * outward and up, thinning toward its top: one soft layer, no puffs to count. uMist: how much there is (0..1).
 */
const LOOK_MIST = /* glsl */ `
uniform float uMist, uClock;
vec4 look(vec2 p) {
  float y = clamp(p.y / max(uHeight, 1e-3), 0.0, 1.0);   // (unclamped, pow() below gives NaN at the top: black dots)
  // wraps round the ring without a seam: noise on the circle
  vec3 q = vec3(cos(p.x) * 3.2, sin(p.x) * 3.2, p.y * 2.6 - uClock * 0.9);
  float n = fbm3(q + uSeed * 0.01), n2 = vnoise3(q * 2.3 + 4.0);
  float m = smoothstep(0.38 + 0.5 * y, 0.75 + 0.3 * y, n * 0.8 + n2 * 0.3) * pow(1.0 - y, 1.4) * smoothstep(0.0, 0.08, y);
  float al = m * 0.32 * uMist;
  return vec4(vec3(0.82, 0.93, 1.0) * al, al);
}`;

/**
 * The blast: a wall of snow powder racing out over the ice (a second ring band), its top a line of rolling billows,
 * leaning outward like a breaking wave, white on top and pale cyan in its shade, and eaten away by noise as it dies
 * (uFade 0..1): the user's "blast wave in a snowy landscape".
 */
const LOOK_BLAST = /* glsl */ `
uniform float uClock, uFade, uGrow;
vec4 look(vec2 p) {
  float H = max(uHeight, 1e-3), y = p.y / H;
  vec3 q = vec3(cos(p.x) * 4.0, sin(p.x) * 4.0, uClock * 1.6 + uSeed * 0.01);
  float lump = fbm3(q), lump2 = vnoise3(vec3(cos(p.x) * 13.0, sin(p.x) * 13.0, uClock * 3.0 + 5.0));
  float top = (0.5 + 0.5 * lump + 0.18 * (lump2 - 0.5)) * uGrow;
  float d = top - y, aa = fwidth(y) + 1e-4;
  float inside = smoothstep(-aa, aa, d);
  if (inside <= 0.0 || top <= 0.01) return vec4(0.0);
  // dying: holes open where the noise is low, from the bottom up
  float n = fbm3(vec3(cos(p.x) * 7.0, sin(p.x) * 7.0, y * 3.0 - uClock * 2.2) + 3.0);
  float er = uFade * 1.15 - 0.08 + (vnoise3(vec3(cos(p.x) * 1.6, sin(p.x) * 1.6, 7.0 + uSeed * 0.01)) - 0.5) * 0.35 * step(0.001, uFade);
  float keep = smoothstep(er, er + 0.1, n * 0.75 + y * 0.35 + 0.05);
  if (keep <= 0.0) return vec4(0.0);
  // stepped toon tones up the billow, broken by the fine lumps; a bright crest just under the top
  float tone = y / max(top, 1e-3) + (lump2 - 0.5) * 0.35;
  vec3 c = tone > 0.66 ? vec3(1.7, 1.85, 1.95) : tone > 0.36 ? vec3(0.55, 1.05, 1.55) : vec3(0.12, 0.45, 1.0);
  c = mix(c, vec3(1.3, 1.4, 1.5), smoothstep(0.1, 0.0, d) * 0.8);
  float a = mix(0.78, 0.96, smoothstep(0.0, 0.55, y / max(top, 1e-3))) * keep * inside * mix(0.4, 1.0, smoothstep(0.0, 0.05, d));
  a *= 1.0 - uFade * uFade;
  return vec4(c * a, a);
}`;

/** Snow puffs: thrown out with the blast at every height, riding the front, then hanging and sinking as they thin. */
const PUFFS = /* glsl */ `
${PATH_GLSL}
uniform float uPuffs;
Particle emitParticle(float k, float back) {
  if (k >= uPuffs) return P0();
  float th = rnd(k, 31.0) * 6.2831853, born = (0.05 + 0.95 * rnd(k, 32.0)) * uTr;
  float life = 0.45 + 0.3 * rnd(k, 33.0), a = uAge - back - born;
  if (a < 0.0 || a > life) return P0();
  float al = a / life, tau = 0.2, v = 2.0 + 2.0 * rnd(k, 34.0);
  vec2 d = vec2(cos(th), sin(th)), c = centerAt(born);
  float rr = frontR(born) * (0.85 + 0.2 * rnd(k, 40.0)) + v * tau * (1.0 - exp(-a / tau));
  float y = (0.15 + 1.0 * rnd(k, 35.0)) * uH + a * 0.4;
  Particle p = P0(); p.alive = true;
  p.pos = vec3(c.x + d.x * rr, uGy + max(0.06, y), c.y + d.y * rr);
  p.size = (0.28 + 0.25 * rnd(k, 36.0)) * (0.8 + 1.0 * al);
  p.rot = rnd(k, 37.0) * 6.28;
  p.col = vec4(al, 0.0, 0.0, smoothstep(0.0, 0.08, al) * (1.0 - smoothstep(0.25, 1.0, al)));
  p.data = vec4(rnd(k, 38.0), rnd(k, 39.0), 0.0, 0.0);
  return p;
}`;

const LOOK_PUFF = /* glsl */ `
uniform float uClock;
vec4 look(vec2 uv, vec4 col, vec4 data) {
  float n = vnoise3(vec3(uv * 2.3 + data.xy * 9.0, uClock * 1.3));
  float m = smoothstep(1.0, 0.4, length(uv) * (0.72 + 0.55 * n));
  vec3 c = mix(vec3(0.25, 0.65, 1.2), vec3(1.6, 1.75, 1.85), smoothstep(-0.4, 0.6, uv.y + (n - 0.5)));
  float a = m * col.w * 0.5;
  return vec4(c * a, a);
}`;

/** Flakes settling inside the ring after the blast, twinkling on whole frames. */
const FLAKES = /* glsl */ `
${PATH_GLSL}
uniform float uFlakes;
Particle emitParticle(float k, float back) {
  if (k >= uFlakes) return P0();
  float born = uTr * 0.5 + rnd(k, 51.0) * 0.8, life = 0.7 + 0.5 * rnd(k, 52.0), a = uAge - back - born;
  if (a < 0.0 || a > life) return P0();
  float th = rnd(k, 53.0) * 6.2831853, rr = sqrt(rnd(k, 54.0)) * uR;
  vec2 c = centerAt(born);
  Particle p = P0(); p.alive = true;
  p.pos = vec3(c.x + cos(th) * rr + sin(a * 4.0 + k) * 0.12, uGy + (0.9 + 1.2 * rnd(k, 55.0)) * (1.0 - a / life) + 0.05, c.y + sin(th) * rr);
  float tw = rnd(k * 3.0 + floor(uAge * 10.0), 56.0);
  p.size = tw > 0.7 ? 0.07 : 0.04;
  p.col = vec4(1.0, 0.0, 0.0, 1.0 - smoothstep(0.7, 1.0, a / life));
  return p;
}`;

const LOOK_FLAKE = /* glsl */ `
vec4 look(vec2 uv, vec4 col, vec4 data) {
  float m = smoothstep(1.0, 0.2, length(uv));
  return vec4(vec3(1.9, 2.0, 2.1) * m, m * 0.7) * col.w;
}`;

/** The flash at the caster as the ring goes off: a burst of cold white for a few frames, stepped. */
const FLASH = /* glsl */ `
${PATH_GLSL}
Particle emitParticle(float k, float back) {
  float a = uAge - back;
  if (k > 0.5 || a < 0.0 || a > 0.12) return P0();
  vec2 c = centerAt(0.0);
  Particle p = P0(); p.alive = true;
  p.pos = vec3(c.x, uGy + 0.9, c.y);
  p.size = (1.1 + 0.12 * uR) * (a < 0.05 ? 1.0 : 0.75);
  p.col = vec4(a < 0.05 ? 1.0 : 0.45);
  return p;
}`;

const LOOK_FLASH = /* glsl */ `
vec4 look(vec2 uv, vec4 col, vec4 data) {
  float r = length(uv), m = smoothstep(1.0, 0.0, r);
  vec3 c = mix(vec3(1.2, 1.8, 2.4), vec3(3.5, 3.6, 3.7), smoothstep(0.6, 0.0, r));
  return vec4(c * m * m * col.x, m * m * 0.25 * col.x);
}`;

/**
 * The rime round the cast point (uM), out to how far the front has gone, melting unevenly; and the front's thin
 * band of light round where the front stands now (uC, uRn).
 */
const RIME = /* glsl */ `
uniform vec2 uM, uC; uniform float uRn, uRf, uMelt, uN, uFront;
vec4 decal(vec3 wp) {
  vec2 d = wp.xz - uM; float rr = length(d);
  float ang = atan(d.y, d.x);
  float edge = min(uRn, uRf) * (0.94 + 0.06 * vnoise3(vec3(cos(ang) * 3.0, sin(ang) * 3.0, uSeed * 0.01)));
  vec4 o = vec4(0.0);
  if (rr < edge + 1.0) {
    float broad = fbm3(vec3(cos(ang) * 2.0, sin(ang) * 2.0, uSeed * 0.01 + 3.0));
    edge -= (0.1 + 0.4 * broad) * smoothstep(0.6 * uRf, uRf, uRn);
    // no clean circle: each streak runs out on its own, up to 0.8 u past the ring (the user: "clipped in a circle which
    // looks wrong")
    float runOut = 0.8 * vnoise3(vec3(cos(ang) * 9.0, sin(ang) * 9.0, uSeed * 0.01 + 21.0));
    float inside = smoothstep(edge + runOut, edge - 0.4, rr);
    // uneven melt: patches go first where the noise is low
    float m = fbm3(vec3(wp.xz * 1.2, uSeed * 0.013));
    float keep = smoothstep(uMelt - 0.05, uMelt + 0.1, m);
    // thicker towards the edge (the front laid more there), and with runes
    float dens = (0.7 + 0.3 * smoothstep(0.3 * edge, edge, rr)) * (0.8 + 0.06 * uN);
    // a few fine cracks, not a maze: thin ridges of low-frequency noise, broken up by a mask
    float v = 1.0 - abs(vnoise3(vec3(wp.xz * 1.6, 2.0)) * 2.0 - 1.0), v2 = 1.0 - abs(vnoise3(vec3(wp.xz * 4.3, 5.0)) * 2.0 - 1.0);
    float veins = max(smoothstep(0.955, 0.99, v), smoothstep(0.965, 0.993, v2) * 0.55) * smoothstep(0.35, 0.6, vnoise3(vec3(wp.xz * 0.9, 9.0)));
    // frost grain: a fine mottle so the film reads as rime, not glass
    float grain = vnoise3(vec3(wp.xz * 9.0, 3.0));
    float k = inside * keep * dens;
    // full strength (the study): nearly opaque, since see-through cyan over the warm stone mixes to grey
    // (the decal isn't lit, so its colour is lifted to the sunlit stone's level, or it reads as a grey film)
    // deposits: about half the stone left bare from the start, frost thrown in radial streaks and patches
    float patchN = fbm3(vec3(wp.xz * 0.8, uSeed * 0.02 + 11.0));
    float streak = vnoise3(vec3(cos(ang) * 9.0, sin(ang) * 9.0, rr * 0.45 + uSeed * 0.01));
    float dep = patchN * 0.65 + streak * 0.5;
    float cov = smoothstep(0.5, 0.62, dep), ridge = smoothstep(0.66, 0.74, dep);
    float a = (0.22 * cov + 0.33 * ridge + 0.06 * grain * cov) * k;
    vec3 film = vec3(0.25, 0.6, 0.95) * 1.6 * (0.22 * cov) * k + vec3(0.95, 1.1, 1.25) * 1.5 * (0.33 * ridge) * k + vec3(1.0, 1.1, 1.15) * veins * k * cov * 0.4;
    o = vec4(film, a);
  }
  // the front's light on the floor: a thin cool band right under it, tinting the stone (a little alpha) and lighting it
  float dc = abs(length(wp.xz - uC) - uRn), g = exp(-dc * dc / 0.06) * uFront;
  o += vec4(vec3(0.16, 0.45, 0.8) * g * 0.45, g * 0.22);
  return o;
}`;

/** A ring as the sim cast it, and the caster's path since (sim x, y per tick). */
interface Rec { tick: number; who: number; x: number; y: number; r: number; seed: number; path: number[] }

/** One ring's drawing (pooled). */
class Slot {
  readonly group = new THREE.Group();
  readonly front: NovaRing;
  readonly shards: ParticleBatch;
  readonly mist: NovaRing;
  readonly rime: GroundDecal;
  readonly blast: NovaRing;
  readonly puffs: ParticleBatch;
  readonly flakes: ParticleBatch;
  readonly flash: ParticleBatch;
  readonly B = { uClock: { value: 0 }, uFade: { value: 0 }, uGrow: { value: 0 } };
  readonly M = { uMist: { value: 0 }, uClock: { value: 0 } };
  readonly P = {
    uPath: { value: Array.from({ length: PATH_N }, () => new THREE.Vector2()) },
    uAge: { value: 0 }, uR: { value: 3 }, uTr: { value: 0.38 }, uR0: { value: COLD.r0 }, uH: { value: 0.7 }, uGy: { value: 0 },
    uNt: { value: 56 }, uHold: { value: 0 },
  };
  readonly F = { uQ: { value: 0 }, uGrow: { value: 0 } };
  readonly D = { uM: { value: new THREE.Vector2() }, uC: { value: new THREE.Vector2() }, uRn: { value: 0 }, uRf: { value: 3 }, uMelt: { value: 0 }, uN: { value: 1 }, uFront: { value: 0 } };
  rec: Rec | null = null;
  private covered = '';

  constructor() {
    this.rime = new GroundDecal({ look: RIME, uniforms: this.D, order: -1 });
    this.front = new NovaRing({ look: LOOK_FRONT, uniforms: { ...this.F, uNt: this.P.uNt, uHold: this.P.uHold }, order: 2 });
    this.shards = new ParticleBatch({ motion: SHARDS, look: LOOK_SHARD, cap: SHARD_CAP, order: 3, soft: 0.05, uniforms: { ...this.P, uShards: { value: 0 } } });
    this.mist = new NovaRing({ look: LOOK_MIST, uniforms: this.M, columns: 192, soft: 0.3, order: 1 });
    this.blast = new NovaRing({ look: LOOK_BLAST, uniforms: this.B, columns: 256, soft: 0.25, order: 3 });
    this.puffs = new ParticleBatch({ motion: PUFFS, look: LOOK_PUFF, cap: PUFF_CAP, order: 4, soft: 0.4, uniforms: { ...this.P, uPuffs: { value: 0 }, uClock: this.B.uClock } });
    this.flakes = new ParticleBatch({ motion: FLAKES, look: LOOK_FLAKE, cap: FLAKE_CAP, order: 5, soft: 0.05, uniforms: { ...this.P, uFlakes: { value: 0 } } });
    this.flash = new ParticleBatch({ motion: FLASH, look: LOOK_FLASH, cap: 1, order: 6, soft: 0.6, uniforms: this.P });
    this.group.add(this.rime.mesh, this.front.mesh, this.shards.mesh, this.mist.mesh, this.blast.mesh, this.puffs.mesh, this.flakes.mesh, this.flash.mesh);
  }

  /** Draw ring `r` at age `age` s; `heightAt` reads the floor (sim x, y). Returns the spell light's strength (0: none). */
  draw(r: Rec, age: number, heightAt: (x: number, y: number) => number): number {
    if (this.rec !== r) { this.rec = r; this.covered = ''; }
    const n = runesOf(r.r), Tr = COLD.reach * stretchOf(r.r), q = age / Tr, hold = holdOf(n);
    const H = COLD.height + COLD.heightPerRune * (n - 1);
    const Rn = COLD.r0 + (r.r - COLD.r0) * (1 - Math.pow(1 - Math.min(1, q), 1.3));
    const [cx, cy] = this.centerAt(r, age);
    const gy = heightAt(r.x, r.y);
    const seed = r.seed;
    for (const u of [this.front.u, this.shards.u, this.mist.u, this.rime.u, this.blast.u, this.puffs.u, this.flakes.u, this.flash.u]) u.uSeed.value = seed;
    // the path for the particles, sampled every PATH_STEP ticks from the cast
    this.P.uPath.value.forEach((v, i) => v.set(...this.centerAt(r, (i * PATH_STEP) / 60)));
    this.P.uAge.value = age; this.P.uR.value = r.r; this.P.uTr.value = Tr; this.P.uH.value = H; this.P.uGy.value = gy;
    this.P.uNt.value = Math.max(16, Math.round((2 * Math.PI * r.r) / COLD.tooth)); this.P.uHold.value = hold;
    // the front: grows in fast, its teeth break from 0.86 reach times on (later at five runes)
    const alive = q < 1.3 + hold;
    this.front.mesh.visible = alive;
    if (alive) {
      this.F.uQ.value = q; this.F.uGrow.value = Math.min(1, q * 5) * Math.min(1, Rn / 1.2);
      this.front.place(cx, cy, Rn, H, H * COLD.lean, heightAt);
    }
    this.shards.u.uShards.value = 24 + 9 * n;
    this.shards.count = SHARD_CAP;
    // the blast: snow powder racing out over the ice, then breaking up
    const Hb = COLD.blast + COLD.blastPerRune * (n - 1), blastOn = q < 1.45 + hold;
    this.blast.mesh.visible = blastOn;
    this.B.uClock.value = age; this.B.uGrow.value = Math.min(1, q * 4); this.B.uFade.value = Math.min(1, Math.max(0, (q - 0.65 - hold) / 0.75));
    if (blastOn) this.blast.place(cx, cy, Rn + 0.12, Hb, Hb * COLD.blastLean, heightAt);
    this.puffs.u.uPuffs.value = Math.min(PUFF_CAP, 45 + 18 * n); this.puffs.count = PUFF_CAP;
    this.puffs.mesh.visible = age < Tr * 0.3 + 1.3;
    this.flakes.u.uFlakes.value = Math.min(FLAKE_CAP, 8 + 3 * n); this.flakes.count = FLAKE_CAP;
    this.flakes.mesh.visible = age < Tr * 0.5 + 2.1;
    this.flash.count = 1; this.flash.mesh.visible = age < 0.13;
    this.shards.mesh.visible = age < Tr * (1.3 + hold) + 0.9;
    // the mist veil: rises as the front gets going, rolls on outside it, thins away after the front breaks
    const mist = Math.min(1, Math.max(0, (q - 0.2) / 0.4)) * (1 - Math.min(1, Math.max(0, (age - Tr * (1 + hold)) / 0.9)));
    this.M.uMist.value = mist; this.M.uClock.value = age;
    this.mist.mesh.visible = mist > 0;
    if (mist > 0) {
      const spread = Math.max(0, age - Tr) * 0.4;
      this.mist.place(cx, cy, Rn + 0.15 + spread, 0.45 + 0.05 * n, 0.35, heightAt);
    }
    // the rime and the band of light
    const melt0 = COLD.rimeHold, melt1 = melt0 + COLD.rimeMelt + COLD.rimePerRune * (n - 1);
    this.D.uM.value.set(r.x, r.y); this.D.uC.value.set(cx, cy); this.D.uRn.value = Rn; this.D.uRf.value = r.r; this.D.uN.value = n;
    this.D.uMelt.value = -0.2 + 1.25 * Math.min(1, Math.max(0, (age - melt0) / (melt1 - melt0)));
    const front = alive ? Math.min(1, q * 4) * (1 - Math.min(1, Math.max(0, (q - 0.9 - hold) / 0.35))) : 0;
    this.D.uFront.value = front;
    const pad = r.r + 4, key = `${r.tick}:${r.who}`;
    if (this.covered !== key) { this.covered = key; this.rime.heightAt = heightAt; this.rime.cover({ x0: r.x - pad, z0: r.y - pad, x1: r.x + pad, z1: r.y + pad }); }
    this.group.visible = true;
    return front;
  }

  /** The front's centre at `age` s: the cast point dragged most of the way toward where the caster was then. */
  centerAt(r: Rec, age: number): [number, number] {
    const p = r.path, n = p.length / 2;
    if (!n) return [r.x, r.y];
    const f = Math.min(n - 1, Math.max(0, age * 60)), i = Math.floor(f), j = Math.min(n - 1, i + 1), k = f - i;
    const bx = p[i * 2] + (p[j * 2] - p[i * 2]) * k, by = p[i * 2 + 1] + (p[j * 2 + 1] - p[i * 2 + 1]) * k;
    return [r.x + (bx - r.x) * COLD.follow, r.y + (by - r.y) * COLD.follow];
  }

  hide(): void { this.group.visible = false; this.rec = null; }

  dispose(): void { for (const d of [this.front, this.shards, this.mist, this.rime, this.blast, this.puffs, this.flakes, this.flash]) d.dispose(); }
}

export class ColdNovas {
  readonly group = new THREE.Group();
  private recs: Rec[] = [];
  private slots: Slot[] = [];
  /** The floor's height (u) under sim point (x, y). */
  heightAt: (x: number, y: number) => number = () => 0;

  /** After each sim step (shown or replayed): new Frost rings, and every live ring's caster's spot this tick. */
  afterStep(w: World): void {
    const tick = w.clock[0];
    for (const e of w.events) {
      if (e.kind !== 'burst' || e.who < 0 || e.who >= MAX_SEATS || !w.seats.active[e.who]) continue;
      if (!isColdNova(specOf(w, e.who))) continue;
      if (this.recs.some((r) => r.tick === tick && r.who === e.who)) continue;
      this.recs.push({ tick, who: e.who, x: e.x, y: e.y, r: e.amount ?? SHAPES.novaRadius, seed: (tick * 31 + e.who * 7) % 9973, path: [] });
    }
    for (const r of this.recs) {
      const k = tick - r.tick;
      if (k < 0 || k >= PATH_TICKS) continue;
      const b = w.bodies, on = b.hp[r.who] > 0, last = r.path.length >= 2 ? [r.path[r.path.length - 2], r.path[r.path.length - 1]] : [r.x, r.y];
      // the path holds tick k at index k (a gap after a skipped step repeats the last spot)
      while (r.path.length / 2 < k) r.path.push(last[0], last[1]);
      r.path.length = k * 2;
      r.path.push(on ? b.x[r.who] : last[0], on ? b.y[r.who] : last[1]);
    }
    this.recs = this.recs.filter((r) => (tick - r.tick) / 60 < lifeOf(r.r) + 0.1);
  }

  /** A rewind put the world back to `tick`: rings cast after it go, and every path is cut back to it. */
  rewind(tick: number): void {
    this.recs = this.recs.filter((r) => r.tick <= tick);
    for (const r of this.recs) r.path.length = Math.min(r.path.length, (tick - r.tick + 1) * 2);
  }

  /** Draw every live ring at time t (s, the sim clock), asking `lights` for each front's cold light. */
  update(t: number, lights: SpellLights | null): void {
    const live = this.recs.filter((r) => { const a = t - r.tick / 60; return a >= 0 && a <= lifeOf(r.r); });
    while (this.slots.length < live.length && this.slots.length < 8) { const s = new Slot(); this.slots.push(s); this.group.add(s.group); }
    this.slots.forEach((s, i) => {
      const r = live[i];
      if (!r) { s.hide(); return; }
      const age = t - r.tick / 60, front = s.draw(r, age, this.heightAt);
      if (lights && age < 0.12) { const [fx, fy] = s.centerAt(r, 0); lights.add(fx, this.heightAt(fx, fy) + 1.0, fy, 0xd8f4ff, age < 0.05 ? 6 : 3, r.r + 3); }
      if (lights && front > 0) {
        const [cx, cy] = s.centerAt(r, age), n = runesOf(r.r);
        lights.add(cx, this.heightAt(cx, cy) + 0.9, cy, 0x8fd4ff, (0.9 + 0.25 * n) * front, r.r + 2.5);
      }
    });
  }

  /** Forget every ring (a lab drawing another world). */
  reset(): void { this.recs = []; for (const s of this.slots) s.hide(); }

  dispose(): void { for (const s of this.slots) s.dispose(); }
}
