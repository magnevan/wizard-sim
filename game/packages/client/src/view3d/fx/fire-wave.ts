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
 * Layers, back to front: the ground (a hot line under the front, then the scorch); smoke; the wave itself, a volume of
 * burning gas (take 4, after the user found the sprites "stacked" and a sheet "solid... with holes"; see the volume's
 * docblock below); a white flash where it starts.
 *
 * Sizes and timing are the sim's: the ring's radius from its burst event (SHAPES.novaRadius + novaPerRune a rune), the
 * burst's reach and half-angle from its imbue event (SHAPES.imbueRange...; effects.ts imbue()). The sim hits the whole
 * area at once; the wave takes the Frost ring's speed to get there (ring-shape.ts). The ring follows a caster who walks
 * (ring-shape.ts); the burst stays where it was thrown.
 *
 * Stateless in the kit's sense: every frame is a function of the clock, the event and the kept path.
 */
import * as THREE from 'three';
import { EL, MAX_SEATS, specOf, type SpellSpec, type World } from '@wizard-sim/sim';
import { GroundDecal } from './decal';
import { FIRE_TEX, SHEET_GLSL } from './fire-sheets';
import type { SpellLights } from './lights';
import { HASH, NOISE } from './glsl';
import { ParticleBatch, premulMaterial } from './particles';
import { FX_U } from './stage';
import { PATH_GLSL, RING, RingTracker, centerAt, fillPath, frontR, pathUniform, runesOf, stretchOf, type RingRec } from './ring-shape';

const TAU = Math.PI * 2;

/** Is this spell the Fire ring (drawn here; the stand-ins skip it)? Mixed rings (steam, a healing ring) aren't, yet. */
export const isFireNova = (s: SpellSpec | null | undefined): boolean =>
  !!s && s.shape === 'nova' && (s.look || s.form) === EL.fire && !s.heal && !s.scald && !s.freeze;

/** Is this spell the Fire patch (a Place)? Its landing splash is drawn here (the ring's opening burst, no wave). */
export const isFirePatch = (s: SpellSpec | null | undefined): boolean =>
  !!s && s.shape === 'patch' && (s.look || s.form) === EL.fire && !s.heal && !s.scald && !s.freeze;

/** Is this imbue event (a `move` with text 'imbue') a pure Fire burst? Its element mask holds Fire alone. */
export const isFireBurst = (e: { text?: string; els?: number }): boolean => e.text === 'imbue' && e.els === 1 << EL.fire;

export const FIRE_WAVE = {
  /** Seconds the front takes to reach a three-unit ring (the Frost ring's 0.32, a touch slower: fire rolls). */
  reach: 0.34,
  /** How far past the sim's reach the sinking front runs on, as a share of it. */
  overrun: 0.12,
  /** The opening burst's racing ring: it runs the wave's own curve this much early (its time at the reach, as a share of
   * the wave's), plus a margin (u) ahead of the front. */
  burstLead: 0.8, burstAhead: 0.3,
  /** Seconds the scorch lies after the cast: whole until `scorchHold`, gone by `scorchEnd`. */
  scorchHold: 1.5, scorchEnd: 5.0,
  /** The sheet: its depth behind the front (u), how high its crest stands (u), how fast its billows roll back (1/s). */
  width: 1.3, lift: 1.0, roll: 3.0,
  /** Smoke puffs a unit of the front's arc; trail embers a unit of it; a spitting fire's cell (u of arc). */
  smokePerU: 1.3, embersPerU: 8, spitEvery: 1.0,
};

/** Seconds a wave is drawn for, scorch included. */
const lifeOf = (): number => FIRE_WAVE.scorchEnd + 0.1;

/** A burst's or a ring's wave: a ring is a fan of half-angle π. */
interface Wave { rec: RingRec; face: number; half: number; ring: boolean; splash?: boolean }

const SMOKE_CAP = 90, SPARK_CAP = 96, EMBER_CAP = 700;

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

/**
 * The wave itself: a volume of burning gas, ray-marched (the user on the sheet before it, 2026-11-26: "it's reading more
 * like a solid sheet with holes through it, rather than something composed of gas/plasma"; and before that, on the
 * sprites: "stacked individual sprites rather than a cohesive wave"). A box round the wave is drawn by its back faces;
 * each pixel marches its ray through the box, stopping at the floor or a body (the world's depth), and gathers light and
 * cover from a density field shaped like a rolling tube just behind the front:
 *
 * - **Shape:** in the wave's own frame (how far behind the front, how high) the gas is a blob riding behind the front,
 *   with a low smoky tail behind it, broken by 3D noise into billows. Round the arc the same noise, so the front is one
 *   body with lobes, never a row of pieces.
 * - **Billowing:** the noise turns round the tube's axis as the wave travels (rolling forward over its top), so a lobe
 *   can be followed from frame to frame as it rolls over.
 * - **Gas, not a surface:** dense parts glow yellow-orange, thin parts are a translucent red, the thinnest only darken
 *   (smoke); light builds up where a ray passes through more of it.
 * - **Taper:** as the wave sinks the tube lowers, the noise eats it and it goes out; a burst's ends are eaten the same
 *   way, so they fray.
 */
const VOL_STEPS = 28;

const VOL_COMMON = /* glsl */ `
${HASH}
${NOISE}
${WAVE_GLSL}
uniform float uWidth, uLift, uRoll, uSpitN, uTube;
uniform vec3 uBoxC, uBoxH;
// the band's depth behind the front: thin as it leaves the caster, full by mid-way, narrowing as it dies
float bandW(float age, float Rf) { float q = age / uTr; return min(Rf * 0.42, uWidth * mix(0.45, 1.0, smoothstep(0.0, 0.6, q)) * mix(1.0, 0.75, smoothstep(1.0, 1.7, q))); }
`;

const VOL_VERT = /* glsl */ `
${VOL_COMMON}
out vec3 vWorld;
void main() {
  vec3 wp = uBoxC + position * uBoxH;
  vWorld = wp;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;

const VOL_FRAG = /* glsl */ `
#include <packing>
${VOL_COMMON}
uniform sampler2D uDepth; uniform vec2 uRes; uniform float uNear, uFar;
in vec3 vWorld;
out vec4 fxColor;
// 0 hottest .. 1 going out: saturated (almost no blue), so after the tone map the core stays yellow and the body orange
vec3 gasRamp(float h) {
  h = clamp(h, 0.0, 1.0);
  vec3 c0 = vec3(3.2, 1.6, 0.08), c1 = vec3(2.5, 0.8, 0.03), c2 = vec3(1.6, 0.3, 0.012), c3 = vec3(0.7, 0.08, 0.01), c4 = vec3(0.12, 0.02, 0.01);
  if (h < 0.2) return mix(c0, c1, h / 0.2);
  if (h < 0.45) return mix(c1, c2, (h - 0.2) / 0.25);
  if (h < 0.7) return mix(c2, c3, (h - 0.45) / 0.25);
  return mix(c3, c4, (h - 0.7) / 0.3);
}
// this moment's wave, worked out once per pixel
vec2 gC; float gRf, gW, gH, gQ, gSpin, gHot;
// the angle a minus b, wrapped to -π..π
float angD(float a, float b) { return atan(sin(a - b), cos(a - b)); }
// the opening burst (the user, take 4: "an initial burst effect emanating from the character"): a flattened shell of
// the same gas thrown out from the feet (a ring) or the hands (a burst, forward only), gone in a fifth of a second
float burstBase(vec3 p) {
  // it runs the cast's full length (the user, take 6: "it should race out the full length of the effect") just ahead of
  // the wave, on the wave's own curve (take 7: "it looked good when it was just slightly ahead"; on a fixed schedule it
  // raced far ahead of a big ring): the front's curve played a little faster, plus a margin, out to the reach
  float a = uAge, Tb = ${FIRE_WAVE.burstLead.toFixed(3)} * uTr, qb = a / Tb;
  if (qb > 1.15) return -1.0;
  vec2 f = vec2(cos(uFace), sin(uFace));
  vec3 c = isRing() ? vec3(gC.x, uGy + 0.35, gC.y) : vec3(gC.x + f.x * 0.45, uGy + 0.9, gC.y + f.y * 0.45);
  // a hollow ring of fire racing out low over the floor ahead of the wave, out to the cast's reach, torn apart as it goes
  vec2 rel = p.xz - c.xz;
  float off = isRing() ? 0.0 : 0.45, Rend = uR * ${(1 + FIRE_WAVE.overrun).toFixed(3)} - off;
  float R = min(Rend, frontR(a / ${FIRE_WAVE.burstLead.toFixed(3)} + 0.02) + ${FIRE_WAVE.burstAhead.toFixed(2)} - off);
  vec2 v = vec2(length(rel) - R, (p.y - c.y) * (isRing() ? 1.3 : 1.0));
  float s = 1.0 - length(v) / (0.3 + 0.25 * min(qb, 1.0));
  // on a burst, only across the fan (its own edges, seen from the cast point)
  if (!isRing()) { vec2 g = p.xz - gC; s -= 1.6 * (1.0 - edgeOf(atan(g.y, g.x))); }
  // and a fireball pop where it starts, gone in a tenth of a second
  float pop = 1.0 - length((p - c) * vec3(1.0, 1.1, 1.0)) / (0.35 + 3.0 * a);
  s = max(s, pop * 1.1 - 2.0 * smoothstep(0.03, 0.11, a));
  // thin enough that the noise tears it into tongues, so it reads as fire, not a halo
  return s * 0.95 - 1.4 * smoothstep(0.7, 1.12, qb);
}
// fires spitting out of the front (the user, take 4: "individual fires that spit alongside the wave, slightly in front
// of it, and reaching out a bit beyond the wave"): the arc is cut into cells about a unit wide; some cells throw a
// tongue of the same gas out past the front at their own moment, arcing up and burning out. Only a sample's own cell
// and its neighbours are looked at, so their number costs nothing.
float spitBase(float r, float th, float y) {
  float fan = isRing() ? 6.2831853 : 2.0 * uHalf;
  float a0 = isRing() ? mod(th, 6.2831853) : angD(th, uFace) + uHalf;
  float cw = fan / uSpitN, ci = floor(a0 / cw), best = -1.0;
  for (int j = -1; j <= 1; j++) {
    float i = ci + float(j), ii = isRing() ? mod(i + uSpitN, uSpitN) : i;
    if (!isRing() && (ii < 0.0 || ii >= uSpitN)) continue;
    if (rnd(ii, 60.0) > 0.75) continue;
    float tb = (0.12 + 0.95 * rnd(ii, 61.0)) * uTr, life = 0.2 + 0.14 * rnd(ii, 62.0), t = (uAge - tb) / life;
    if (t < 0.0 || t > 1.0) continue;
    float thc = (isRing() ? 0.0 : uFace - uHalf) + (i + 0.2 + 0.6 * rnd(ii, 63.0)) * cw;
    // riding the front and thrown ahead of it, easing out
    float rc = frontAt(tb + t * life) + (0.35 + 0.65 * rnd(ii, 64.0)) * (1.0 - (1.0 - t) * (1.0 - t)) - 0.15;
    float yc = 0.2 + (0.35 + 0.35 * rnd(ii, 65.0)) * sin(3.14159 * t * 0.9);
    float rad = (0.3 + 0.14 * rnd(ii, 66.0)) * (1.0 - 0.55 * t);
    // a tongue: drawn out along its flight
    vec3 v = vec3((r - rc) * 0.55, angD(th, thc) * r, (y - yc) * 0.9);
    best = max(best, 1.0 - length(v) / rad - 0.9 * smoothstep(0.5, 1.0, t));
  }
  return best;
}
// density (0..) and heat (0 hottest .. 1 cool) at world point p
vec2 gas(vec3 p) {
  vec2 rel = p.xz - gC; float r = length(rel);
  vec2 dir = rel / max(r, 1e-4);
  float th = atan(dir.y, dir.x), y = p.y - uGy;
  float b = gRf - r;                       // how far behind the front
  // the tube (only near the band), its tail, then the burst and the spits
  float tube = -1.0, e = edgeOf(th);
  float bc = gW * 0.34, yc = gH * 0.42;
  if (uTube > 0.5 && b > -0.5 && b < gW + 0.3 && e > 0.0) {
    vec2 l = vec2((b - bc) / (gW * 0.42), (y - yc) / (gH * 0.5));
    tube = 1.0 - length(l);
    // the low smoky tail behind it
    tube = max(tube, (1.0 - smoothstep(0.0, 1.0, (b - bc) / max(gW - bc, 0.05))) * step(bc, b) * (0.35 - 1.6 * y / max(gH, 0.05)));
    tube = tube * 1.15 - mix(0.0, 1.25, smoothstep(0.6, 1.6, gQ)) - (1.0 - e) * 1.1;
  }
  float bu = burstBase(p), extra = max(bu, b < 0.6 && uTube > 0.5 ? spitBase(r, th, y) : -1.0) * 1.3;
  float base = max(tube, extra);
  if (base < -0.55) return vec2(0.0, 1.0);
  // the noise turns round the tube's axis (rolling forward over the top): a lobe rolls over from frame to frame
  float cs = cos(gSpin), sn = sin(gSpin);
  vec2 lr = vec2(cs * (b - bc) - sn * (y - yc), sn * (b - bc) + cs * (y - yc));
  vec3 np = vec3(dir * (gRf * 1.25 - lr.x * 1.3), lr.y * 1.5 + uSeed * 0.013);
  vec3 wq = np * 0.6 + 3.1;
  np += (vec3(vnoise3(wq), vnoise3(wq + 4.7), vnoise3(wq + 9.1)) - 0.5) * 1.1;
  float n = fbm3(np * 1.8);
  float d = base + (n - 0.5) * 1.9;
  if (d <= 0.0) return vec2(0.0, 1.0);
  // hot in the dense core and near the front, cooling toward the tail and as it dies; the burst and the spits young and hot
  float heat = 1.0 - clamp(d * 1.6, 0.0, 1.0) + (tube >= extra ? 0.25 * clamp(b / gW, 0.0, 1.0) + gHot : (bu * 1.3 >= extra ? 0.02 : -0.05));
  return vec2(d, heat);
}
void main() {
  vec3 ro = cameraPosition, rd = normalize(vWorld - ro);
  // entry into the box (slab test); the exit is this back face
  vec3 inv = 1.0 / rd, t0 = (uBoxC - uBoxH - ro) * inv, t1 = (uBoxC + uBoxH - ro) * inv;
  vec3 tn = min(t0, t1);
  float tIn = max(max(max(tn.x, tn.y), tn.z), 0.0), tOut = length(vWorld - ro);
  // stop at the floor or whatever stands in the way (the world's depth along this ray)
  vec3 fwd = -vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
  float scene = -perspectiveDepthToViewZ(texture(uDepth, gl_FragCoord.xy / uRes).r, uNear, uFar);
  tOut = min(tOut, scene / max(dot(rd, fwd), 1e-3));
  if (tOut <= tIn) discard;
  float q = uAge / uTr;
  gC = centerAt(uAge); gRf = frontAt(uAge); gW = bandW(uAge, gRf); gH = uLift * tallAt(uAge); gQ = q;
  gSpin = -uAge * uRoll; gHot = 0.3 * smoothstep(0.6, 1.5, q);
  float dt = (tOut - tIn) / ${VOL_STEPS}.0;
  // a per-pixel offset along the ray, so the steps don't show as bands
  float t = tIn + dt * fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  vec3 col = vec3(0.0); float acc = 0.0;
  for (int i = 0; i < ${VOL_STEPS}; i++) {
    vec2 g = gas(ro + rd * t);
    if (g.x > 0.0) {
      float a = 1.0 - exp(-g.x * 14.0 * dt);
      // the thinnest gas only darkens (smoke); denser gas glows
      vec3 em = gasRamp(g.y) * smoothstep(0.02, 0.25, g.x);
      col += (1.0 - acc) * a * em;
      acc += (1.0 - acc) * a;
      if (acc > 0.98) break;
    }
    t += dt;
  }
  if (acc < 0.004) discard;
  fxColor = vec4(col, acc);
}`;

/** The volume's box: one draw call (a cube's back faces, placed and sized by uniforms). */
function volumeMesh(u: Record<string, THREE.IUniform>): THREE.Mesh {
  const m = premulMaterial(new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: u, vertexShader: VOL_VERT, fragmentShader: VOL_FRAG, side: THREE.BackSide }));
  m.depthTest = false;   // the march stops at the world's depth itself; the box's own faces may lie behind the floor
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), m);
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  return mesh;
}

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
  if (k > 0.5 || a < 0.0 || a > 0.22) return P0();
  vec2 c = centerAt(0.0), d = isRing() ? vec2(0.0) : vec2(cos(uFace), sin(uFace)) * 0.45;
  Particle p = P0(); p.alive = true;
  p.pos = vec3(c.x + d.x, uGy + (isRing() ? 0.25 : 1.0), c.y + d.y);
  p.size = (isRing() ? 1.3 : 0.9) * (0.6 + 2.5 * a);
  p.col = vec4(a / 0.22, 0.0, 0.0, 1.0);
  return p;
}`;

const LOOK_FLASH = /* glsl */ `
vec4 look(vec2 uv, vec4 col, vec4 data) {
  float m = exp(-dot(uv, uv) * 3.0) * (1.0 - col.x);
  return vec4(vec3(2.8, 1.5, 0.45) * m, 0.0);
}`;

/**
 * The ground: a hot line under the front (light, no cover), then where the front has passed, scorch: streaks running
 * out from the centre like spokes and soot blotches, glowing a moment and cooling dark, then fading.
 */
const GROUND = /* glsl */ `
uniform vec2 uC0, uCn;
uniform float uRn, uRmax, uFront, uScorch, uHot, uFace, uHalf, uN, uShock, uShockA;
vec4 decal(vec3 wp) {
  vec2 v = wp.xz - uC0; float d = length(v), th = atan(v.y, v.x);
  float inArc = 1.0;
  if (uHalf < 3.1) inArc = 1.0 - smoothstep(uHalf * 0.75, uHalf * 1.08, abs(atan(sin(th - uFace), cos(th - uFace))));
  vec4 o = vec4(0.0);
  // the opening burst's shock: a bright ring racing over the floor ahead of the wave
  float sk = length(wp.xz - uCn) - uShock;
  o.rgb += vec3(2.6, 1.0, 0.15) * exp(-sk * sk / 0.012) * uShockA * inArc;
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

/** The opening burst's sparks: streaks thrown out from the feet (ring) or the hands (burst) in the first instant. */
const SPARKS = /* glsl */ `
${WAVE_GLSL}
Particle emitParticle(float k, float back) {
  if (k >= uCount) return P0();
  float th = angleOf(k, 71.0);
  if (edgeOf(th) < 0.5) return P0();
  float tb = 0.03 * rnd(k, 72.0), life = 0.22 + 0.2 * rnd(k, 73.0), a = uAge - back - tb;
  if (a < 0.0 || a > life) return P0();
  // thrown to between half and all of the cast's reach (the distance under drag is v / drag)
  float t = a / life, drag = 5.0, v = drag * uR * (0.5 + 0.55 * rnd(k, 74.0));
  float dist = v * (1.0 - exp(-drag * a)) / drag;
  vec2 c = centerAt(0.0), d = vec2(cos(th), sin(th));
  vec2 o = isRing() ? c + d * 0.25 : c + vec2(cos(uFace), sin(uFace)) * 0.45;
  float h0 = isRing() ? 0.45 + 0.4 * rnd(k, 75.0) : 0.9 + 0.2 * rnd(k, 75.0);
  Particle p = P0(); p.alive = true;
  p.pos = vec3(o.x + d.x * dist, uGy + max(0.04, h0 + 1.2 * a - 4.0 * a * a), o.y + d.y * dist);
  p.size = 0.075; p.stretch = 0.06;
  p.col = vec4(0.1 + 0.45 * t, 0.0, t, 1.0 - smoothstep(0.6, 1.0, t));
  return p;
}`;

/**
 * The ember trail (the user, take 4: "a trail of embers following the wave, that is noticed primarily after the effect
 * is over"; take 5, after Magicka 1's spray: "more of an orange glow, that float aside more rapidly in the air (imagine
 * they have some velocity radially to the blast)"). Tiny glowing points thrown off the front as it passes: fast and
 * outward at first (a little sideways and up, streaked while fast), slowed by the air, then drifting on the heat and
 * fading out, still glowing for a second or so after the gas is gone. No ash: they go out.
 */
const EMBERS = /* glsl */ `
${WAVE_GLSL}
Particle emitParticle(float k, float back) {
  if (k >= uCount) return P0();
  float th = angleOf(k, 81.0), e = edgeOf(th);
  if (e < 0.3) return P0();
  float tb = (0.05 + 1.15 * rnd(k, 82.0)) * uTr, life = 0.8 + 1.1 * rnd(k, 83.0), a = uAge - back - tb;
  if (a < 0.0 || a > life) return P0();
  float t = a / life, ph = rnd(k, 84.0) * 6.2832;
  vec2 c = centerAt(tb), d = vec2(cos(th), sin(th)), s = vec2(-d.y, d.x);
  // thrown off the front: outward fast, a little to the side, slowed by the air (closed form of a velocity under drag)
  float drag = 2.6, go = (1.0 - exp(-drag * a)) / drag;
  float vr = 1.6 + 3.2 * rnd(k, 85.0), vs = (rnd(k, 86.0) - 0.5) * 2.4, vy = 0.6 + 1.6 * rnd(k, 87.0);
  float r = frontAt(tb) - 0.2 * rnd(k, 88.0) + vr * go;
  float side = vs * go + sin(a * 2.3 + ph) * 0.08 * smoothstep(0.2, 0.8, a);
  // up on the throw, then floating on the heat (a slow rise that settles)
  float y = 0.2 + 0.4 * rnd(k, 89.0) + vy * go + 0.12 * a;
  Particle p = P0(); p.alive = true;
  p.pos = vec3(c.x + d.x * r + s.x * side, uGy + y, c.y + d.y * r + s.y * side);
  p.size = 0.05 + 0.04 * rnd(k, 90.0);
  // streaked while fast (the kit lays a stretched quad along its motion)
  p.stretch = 0.035 * exp(-drag * a);
  // heat 0..1, flicker, life, fade
  float fl = 0.75 + 0.25 * sin(a * (14.0 + 10.0 * rnd(k, 91.0)) + ph);
  p.col = vec4(0.25 + 0.5 * t, fl, t, smoothstep(0.0, 0.03, t) * (1.0 - smoothstep(0.55, 1.0, t)) * e);
  return p;
}`;

/** A spark: a hot streak, covering (it has to show on the pale stone). */
const LOOK_SPARK = /* glsl */ `
vec4 look(vec2 uv, vec4 col, vec4 data) {
  float m = 1.0 - smoothstep(0.25, 1.0, length(uv));
  vec3 c = mix(vec3(3.0, 1.6, 0.15), vec3(1.6, 0.35, 0.02), col.z);
  return vec4(c * m, m) * col.w;
}`;

/**
 * An ember of the trail: a tiny red-orange point with a soft glow round it (light added, as Magicka's are), its hot
 * centre covering a little so the colour holds on the pale stone; reddening as it cools, flickering.
 */
const LOOK_EMBERS = /* glsl */ `
vec4 look(vec2 uv, vec4 col, vec4 data) {
  float r2 = dot(uv, uv), core = exp(-r2 * 9.0), glow = exp(-r2 * 2.5);
  vec3 c = mix(vec3(2.6, 0.75, 0.08), vec3(1.5, 0.18, 0.03), col.x) * col.y;
  return vec4(c * (core * 1.2 + glow * 0.55), core * 0.55) * col.w;
}`;

/** One wave's drawing (pooled). */
class Slot {
  readonly group = new THREE.Group();
  /** The wave's gas (a ray-marched box). */
  readonly sheet: THREE.Mesh;
  readonly smoke: ParticleBatch;
  readonly flash: ParticleBatch;
  readonly sparks: ParticleBatch;
  readonly embers: ParticleBatch;
  readonly ground: GroundDecal;
  readonly P = {
    uPath: { value: pathUniform() },
    uAge: { value: 0 }, uR: { value: 3 }, uTr: { value: 0.34 }, uR0: { value: RING.r0 }, uH: { value: 1 }, uGy: { value: 0 },
    uFace: { value: 0 }, uHalf: { value: Math.PI }, uN: { value: 1 },
  };
  readonly D = {
    uC0: { value: new THREE.Vector2() }, uCn: { value: new THREE.Vector2() }, uRn: { value: 0 }, uRmax: { value: 0 },
    uFront: { value: 0 }, uScorch: { value: 0 }, uHot: { value: 0 }, uShock: { value: 0 }, uShockA: { value: 0 }, uFace: this.P.uFace, uHalf: this.P.uHalf, uN: this.P.uN,
  };
  /** The sheet's uniforms: the wave's (P) and its own. */
  readonly S: Record<string, THREE.IUniform>;
  wave: Wave | null = null;
  private covered = '';

  constructor() {
    const batch = (motion: string, look: string, cap: number, order: number, extra: Record<string, THREE.IUniform>, upright = false, soft = 0.3) =>
      new ParticleBatch({ motion, look, cap, order, soft, upright, uniforms: { ...this.P, uCount: { value: 0 }, ...extra } });
    this.ground = new GroundDecal({ look: GROUND, uniforms: this.D, order: -1, step: 0.25 });
    this.smoke = batch(SMOKE, LOOK_SMOKE, SMOKE_CAP, 1, { uSheet: { value: FIRE_TEX.smokeburn } }, false, 0.5);
    this.S = { ...this.P, uCount: { value: 0 }, uSeed: { value: 0 }, ...FX_U, uBoxC: { value: new THREE.Vector3() }, uBoxH: { value: new THREE.Vector3(1, 1, 1) }, uWidth: { value: FIRE_WAVE.width }, uLift: { value: FIRE_WAVE.lift }, uRoll: { value: FIRE_WAVE.roll }, uSpitN: { value: 12 }, uTube: { value: 1 } };
    this.sheet = volumeMesh(this.S);
    this.flash = batch(FLASH, LOOK_FLASH, 1, 4, {}, false, 0.6);
    this.sparks = batch(SPARKS, LOOK_SPARK, SPARK_CAP, 4, {}, false, 0.2);
    this.embers = batch(EMBERS, LOOK_EMBERS, EMBER_CAP, 4, {}, false, 0.2);
    this.group.add(this.ground.mesh, this.smoke.mesh, this.sheet, this.flash.mesh, this.sparks.mesh, this.embers.mesh);
  }

  /** Draw wave `w` at age `age` s; `heightAt` reads the floor (sim x, y). Returns the light's strength (0: none). */
  draw(w: Wave, age: number, heightAt: (x: number, y: number) => number): number {
    const r = w.rec;
    if (this.wave !== w) { this.wave = w; this.covered = ''; }
    const n = w.ring ? runesOf(r.r) : Math.max(1, Math.min(5, 1 + Math.round((r.r - 2.5) / 0.6)));
    const Tr = FIRE_WAVE.reach * stretchOf(r.r), q = age / Tr;
    const gy = heightAt(r.x, r.y);
    for (const b of [this.smoke, this.flash, this.sparks, this.embers, this.ground]) b.u.uSeed.value = r.seed;
    this.S.uSeed.value = r.seed;
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
    this.sheet.visible = q < 1.75;
    {
      const [bx, by] = w.ring ? centerAt(r, age) : [r.x, r.y], R = r.r * (1 + FIRE_WAVE.overrun) + 1.4, H = FIRE_WAVE.lift * 1.6 + 0.2;
      (this.S.uBoxC.value as THREE.Vector3).set(bx, gy + H / 2 - 0.1, by);
      (this.S.uBoxH.value as THREE.Vector3).set(R, H / 2, R);
    }
    count(this.smoke, FIRE_WAVE.smokePerU, SMOKE_CAP, age < Tr * 1.2 + 1.8);
    // the spits: one cell about a unit of the front's arc wide
    this.S.uSpitN.value = Math.max(3, Math.round(arc / FIRE_WAVE.spitEvery));
    count(this.embers, FIRE_WAVE.embersPerU, EMBER_CAP, age < Tr * 1.3 + 2.0);
    // a patch's landing splash: only the opening burst (its pop, racing ring, sparks, shock line and flash); the floor
    // under it burns and chars by itself (fire-floor.ts)
    this.S.uTube.value = w.splash ? 0 : 1;
    if (w.splash) { this.smoke.mesh.visible = false; this.embers.mesh.visible = false; }
    this.sparks.u.uCount.value = w.ring || w.splash ? SPARK_CAP : Math.round(SPARK_CAP * 0.45); this.sparks.count = SPARK_CAP; this.sparks.mesh.visible = age < 0.6;
    this.flash.count = 1; this.flash.mesh.visible = age < 0.17;
    // the ground: the hot line under the front, then the scorch
    const qq = Math.min(1, q), Rn = q <= 1 ? frontR(r.r, qq) : r.r * (1 + FIRE_WAVE.overrun * (1 - Math.exp(-(q - 1) * 2.2)));
    const [cx, cy] = w.ring ? centerAt(r, age) : [r.x, r.y];
    this.D.uC0.value.set(r.x, r.y); this.D.uCn.value.set(cx, cy); this.D.uRn.value = Rn; this.D.uRmax.value = Rn;
    const front = Math.min(1, q * 6) * (1 - Math.min(1, Math.max(0, (q - 0.85) / 0.45)));
    this.D.uFront.value = front;
    // the opening burst's shock ring on the floor, racing out with it to the cast's reach
    const Tb = FIRE_WAVE.burstLead * Tr;
    this.D.uShock.value = Math.min(r.r * (1 + FIRE_WAVE.overrun), frontR(r.r, (age / FIRE_WAVE.burstLead + 0.02) / Tr) + FIRE_WAVE.burstAhead);
    this.D.uShockA.value = age < Tb * 1.1 ? Math.min(1, age * 40) * (1 - 0.7 * Math.min(1, age / (Tb * 1.1))) * (age > Tb ? 1 - (age - Tb) / (Tb * 0.1) : 1) : 0;
    this.D.uHot.value = Math.exp(-Math.max(0, age - Tr * 0.5) * 2.2) * Math.min(1, q * 2);
    this.D.uScorch.value = Math.min(1, q * 1.5) * (1 - Math.min(1, Math.max(0, (age - FIRE_WAVE.scorchHold) / (FIRE_WAVE.scorchEnd - FIRE_WAVE.scorchHold))));
    if (w.splash) this.D.uFront.value = this.D.uHot.value = this.D.uScorch.value = 0;
    const pad = r.r * (1 + FIRE_WAVE.overrun) + 1.5, key = `${r.tick}:${r.who}:${w.ring}:${!!w.splash}`;
    if (this.covered !== key) { this.covered = key; this.ground.heightAt = heightAt; this.ground.cover({ x0: r.x - pad, z0: r.y - pad, x1: r.x + pad, z1: r.y + pad }); }
    this.group.visible = true;
    return w.splash ? 0 : front;
  }

  hide(): void { this.group.visible = false; this.wave = null; }

  dispose(): void { for (const d of [this.smoke, this.flash, this.sparks, this.embers, this.ground]) d.dispose();
    this.sheet.geometry.dispose(); (this.sheet.material as THREE.Material).dispose(); }
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

  /** One slot made up front (hidden), so its shaders compile with the stage's warm-up instead of on the first cast. */
  constructor() { const s = new Slot(); s.hide(); this.slots.push(s); this.group.add(s.group); }

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
    // a Fire patch landing: its splash (the burst event a Place gives, at the patch's middle, its radius)
    for (const e of w.events) {
      if (e.kind !== 'burst' || e.who < 0 || e.who >= MAX_SEATS || !w.seats.active[e.who] || !isFirePatch(specOf(w, e.who))) continue;
      if (this.bursts.some((b) => b.rec.tick === tick && b.rec.who === e.who && b.splash)) continue;
      this.bursts.push({ rec: { tick, who: e.who, x: e.x, y: e.y, r: e.amount ?? 2, seed: (tick * 41 + e.who * 13) % 9973, path: [] }, face: 0, half: Math.PI, ring: false, splash: true });
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
      if (age < 0.16) lights.add(cx, this.heightAt(cx, cy) + 0.9, cy, 0xffd9a0, age < 0.06 ? 10 : 5, r.r + 3);
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
