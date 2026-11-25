/**
 * The Earth rock's speed and its moment of contact, from the pixel rock (art/vfx.ts, the plain rock): white air streaks
 * trailing the rock, their lengths re-rolled 30 times a second, and a white flash where it hits for the first frames.
 * The study (docs/explorations/2026-11-25-spell-effects-study.md) found the 3D rock had neither: its wake was a long
 * dust tube, and its impact had no moment of contact.
 *
 * Both read their rocks and impacts from small uniform arrays filled each frame; everything else is a function of the
 * clock, so frozen frames and rollback draw them exactly.
 */
import * as THREE from 'three';
import { ParticleBatch } from './particles';

/** Rocks and impacts drawn at once, and streaks a rock. */
const ROCKS = 8, HITS = 8, PER = 5;

const STREAKS = /* glsl */ `
uniform vec4 uA[${ROCKS}];   // x0, flight height, z0, t0
uniform vec4 uV[${ROCKS}];   // vx, vz, radius, end (or 1e9 in flight)
uniform float uT, uN;
Particle emitParticle(float slot, float back) {
  float b = floor(slot / ${PER}.0), j = slot - b * ${PER}.0;
  if (b >= uN) return P0();
  int i = int(b); vec4 A = uA[i], V = uV[i];
  float t = uT - back, tt = t - A.w;
  if (tt < 0.03 || t > V.w) return P0();
  float sp = max(length(V.xy), 1e-3), r = V.z; vec2 d = V.xy / sp, nn = vec2(-d.y, d.x);
  // five lines across the rock's width behind it, each its length re-rolled 30 times a second (the pixel streaks)
  float across = (j / ${PER - 1}.0 - 0.5) * 2.0 * r * 0.9, fr = floor(uT * 30.0);
  float L = (0.5 + 0.06 * sp) * (0.6 + r) * (0.55 + 0.6 * rnd(fr * 7.0 + j + A.w * 60.0, 3.0));
  vec2 head = A.xz + V.xy * tt;
  Particle p = P0(); p.alive = true;
  // centred a little behind the rock's back edge; stretched back along the motion by its length
  vec2 c = head - d * (r * 0.8) + nn * across;
  p.pos = vec3(c.x, A.y + (j - 2.0) * r * 0.18, c.y);
  p.size = 0.025 + 0.012 * r; p.stretch = L / sp;
  p.col = vec4(1.0 - abs(j - 2.0) * 0.2);
  return p;
}`;

const LOOK_STREAK = /* glsl */ `
vec4 look(vec2 uv, vec4 col, vec4 data) {
  // bright at the head (the rock's end), thinning to nothing at the tail
  float along = uv.y * 0.5 + 0.5, m = smoothstep(1.0, 0.3, abs(uv.x)) * along * along;
  return vec4(vec3(2.6, 2.5, 2.2) * m, m * 0.85) * col.x;
}`;

const FLASH = /* glsl */ `
uniform vec4 uH[${HITS}];   // x, y, z, t
uniform vec4 uHn[${HITS}];  // size, -, -, -
uniform float uT, uHN;
Particle emitParticle(float slot, float back) {
  if (slot >= uHN) return P0();
  int i = int(slot); vec4 H = uH[i];
  float a = uT - back - H.w;
  if (a < 0.0 || a > 0.1) return P0();
  Particle p = P0(); p.alive = true;
  p.pos = H.xyz;
  // stepped: full for the first frames, then a smaller, dimmer one (the pixel flash lasts 0.06 s)
  p.size = uHn[i].x * (a < 0.05 ? 1.0 : 0.6);
  p.rot = H.w * 13.0;
  p.col = vec4(a < 0.05 ? 1.0 : 0.5);
  return p;
}`;

const LOOK_FLASH = /* glsl */ `
vec4 look(vec2 uv, vec4 col, vec4 data) {
  float x = abs(uv.x), y = abs(uv.y), r = length(uv);
  float star = max(exp(-x * 9.0) * (1.0 - y), exp(-y * 9.0) * (1.0 - x));
  float disc = smoothstep(0.55, 0.35, r);
  float m = clamp(max(star, disc), 0.0, 1.0);
  return vec4(vec3(3.6, 3.5, 3.2) * m, m * 0.9) * col.x;
}`;

export interface StreakRock { x0: number; y: number; z0: number; t0: number; vx: number; vz: number; r: number; end: number }
export interface StreakHit { x: number; y: number; z: number; t: number; r: number }

export class EarthStreaks {
  readonly group = new THREE.Group();
  private readonly A = Array.from({ length: ROCKS }, () => new THREE.Vector4());
  private readonly V = Array.from({ length: ROCKS }, () => new THREE.Vector4());
  private readonly H = Array.from({ length: HITS }, () => new THREE.Vector4());
  private readonly Hn = Array.from({ length: HITS }, () => new THREE.Vector4());
  private readonly U = { uA: { value: this.A }, uV: { value: this.V }, uH: { value: this.H }, uHn: { value: this.Hn }, uT: { value: 0 }, uN: { value: 0 }, uHN: { value: 0 } };
  private streaks = new ParticleBatch({ motion: STREAKS, look: LOOK_STREAK, cap: ROCKS * PER, order: 2, soft: 0.05, uniforms: this.U });
  private flash = new ParticleBatch({ motion: FLASH, look: LOOK_FLASH, cap: HITS, order: 6, soft: 0.2, uniforms: this.U });

  constructor() {
    for (const b of [this.streaks, this.flash]) { b.mesh.frustumCulled = false; this.group.add(b.mesh); }
  }

  /** Each frame at time t (s): the rocks in flight (or just ended) and the impacts of the last moments. */
  update(t: number, rocks: StreakRock[], hits: StreakHit[]): void {
    const nr = Math.min(ROCKS, rocks.length), nh = Math.min(HITS, hits.length);
    for (let i = 0; i < nr; i++) { const r = rocks[i]; this.A[i].set(r.x0, r.y, r.z0, r.t0); this.V[i].set(r.vx, r.vz, r.r, r.end); }
    for (let i = 0; i < nh; i++) { const h = hits[i]; this.H[i].set(h.x, h.y, h.z, h.t); this.Hn[i].set(0.5 + h.r * 1.6, 0, 0, 0); }
    this.U.uT.value = t; this.U.uN.value = nr; this.U.uHN.value = nh;
    this.streaks.count = nr * PER; this.flash.count = nh;
    this.group.visible = nr + nh > 0;
  }

  dispose(): void { this.streaks.dispose(); this.flash.dispose(); }
}
