/**
 * Freezing fog (Cold, Place: the sim's ZONE.frost) in 3D: a low, slow cloud of cold mist lying over the zone's disc,
 * drifting and curling, white where it is thick and lit, cyan in its shade, its edge ragged; and under it the stone
 * frosted (a rime film with fine veins, cold.ts's rime). It rolls in when the zone appears and thins away over its last
 * half second. Built 2026-11-28 in the Cold pass, as the same ray-marched gas as Fire's (body-burn.ts's set-up: one
 * instanced box per zone, the march stopping at the scene's depth), in mist instead of flame.
 *
 * Its inputs are the sim's zones and a note of when each was first seen (sim time), so a frozen frame or a rewind draws
 * the same; a zone found after a gap (the view's first frame, a jump) is drawn already rolled in.
 */
import * as THREE from 'three';
import { MAX_ZONES, ZONE, type World } from '@wizard-sim/sim';
import { HASH, NOISE } from './glsl';
import { GroundDecal, type HeightAt } from './decal';
import { premulMaterial } from './particles';
import { FX_U } from './stage';
import type { SpellLights } from './lights';

/** Fogs drawn at once. */
const MAX = 8;
/** March steps through each fog's box. */
const STEPS = 18;
/** Seconds a fog takes to roll in. */
const ROLL_IN = 0.5;

const HEAD = /* glsl */ `
${HASH}
${NOISE}
uniform vec4 uZ[${MAX}];    // x, floor y, z (sim y), radius
uniform vec4 uZ2[${MAX}];   // how much of it there is (0..1), seed, age (s), -
uniform float uClock, uN;
float topOf(int i) { return 0.75 + 0.12 * uZ[i].w; }
`;

const VERT = /* glsl */ `
${HEAD}
out vec3 vWorld; flat out int vI;
void main() {
  vI = gl_InstanceID;
  vec4 Z = uZ[gl_InstanceID];
  vec3 c = vec3(Z.x, Z.y + topOf(gl_InstanceID) * 0.5 + 0.1, Z.z), h = vec3(Z.w + 0.8, topOf(gl_InstanceID) * 0.5 + 0.3, Z.w + 0.8);
  vec3 wp = c + position * h;
  vWorld = wp;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;

const FRAG = /* glsl */ `
#include <packing>
${HEAD}
uniform sampler2D uDepth; uniform vec2 uRes; uniform float uNear, uFar;
in vec3 vWorld; flat in int vI;
out vec4 fxColor;
// the mist at p: (density, height share)
vec2 fog(vec3 p, int i) {
  vec4 Z = uZ[i], Z2 = uZ2[i];
  float y = p.y - Z.y, H = topOf(i);
  if (y < 0.0 || y > H + 0.3) return vec2(0.0);
  vec2 o = p.xz - Z.xz;
  float rr = length(o) / Z.w;
  if (rr > 1.35) return vec2(0.0);
  // rolling in from the middle: its reach grows over ROLL_IN
  float reach = mix(0.35, 1.0, smoothstep(0.0, ${ROLL_IN.toFixed(2)}, Z2.z));
  // drifting, curling noise (slow: a fog, not a flame), and a ragged edge
  vec2 drift = vec2(0.22, 0.13) * uClock;
  vec3 q = vec3(p.xz * 1.3 + drift + Z2.y, y * 1.8 - uClock * 0.2);
  q.xy += (vec2(vnoise3(q * 0.5 + 3.1), vnoise3(q * 0.5 + 7.7)) - 0.5) * 1.4;
  float n = fbm3(q);
  float edge = 1.0 - smoothstep(0.55 * reach, 1.05 * reach, rr + (fbm3(vec3(o * 1.3, Z2.y + 4.0)) - 0.5) * 0.45);
  // thick low, thinning upward; lumps of it rising higher where the noise is high
  float body = edge * (1.0 - y / H) * 1.0 - 0.42;
  float d = (body + (n - 0.5) * 1.9) * Z2.x;
  return vec2(max(d, 0.0), y / H);
}
void main() {
  vec4 Z = uZ[vI];
  vec3 c = vec3(Z.x, Z.y + topOf(vI) * 0.5 + 0.1, Z.z), h = vec3(Z.w + 0.8, topOf(vI) * 0.5 + 0.3, Z.w + 0.8);
  vec3 ro = cameraPosition, rd = normalize(vWorld - ro);
  vec3 inv = 1.0 / rd, t0 = (c - h - ro) * inv, t1 = (c + h - ro) * inv;
  vec3 tn = min(t0, t1);
  float tIn = max(max(max(tn.x, tn.y), tn.z), 0.0), tOut = length(vWorld - ro);
  vec3 fwd = -vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
  float scene = -perspectiveDepthToViewZ(texture(uDepth, gl_FragCoord.xy / uRes).r, uNear, uFar);
  tOut = min(tOut, scene / max(dot(rd, fwd), 1e-3));
  if (tOut <= tIn) discard;
  float dt = (tOut - tIn) / ${STEPS}.0;
  float t = tIn + dt * fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  vec3 col = vec3(0.0); float acc = 0.0;
  for (int s = 0; s < ${STEPS}; s++) {
    vec2 g = fog(ro + rd * t, vI);
    if (g.x > 0.0) {
      float a = (1.0 - exp(-g.x * 4.0 * dt)) * smoothstep(0.0, 0.25, g.x);
      // white and lit where it is thick and high, cyan in its shade and low (covering: light added over the pale stone
      // goes cream)
      vec3 fc = mix(vec3(0.14, 0.42, 0.95), vec3(1.35, 1.5, 1.62), smoothstep(0.15, 0.75, g.x * 1.2 + g.y * 0.35));
      col += (1.0 - acc) * a * fc;
      acc += (1.0 - acc) * a;
      if (acc > 0.97) break;
    }
    t += dt;
  }
  if (acc < 0.004) discard;
  fxColor = vec4(col * 0.9, acc * 0.9);
}`;

/** The frosted stone under every fog (one decal over all of them). */
const RIME = /* glsl */ `
uniform vec4 uZ[${MAX}];
uniform vec4 uZ2[${MAX}];
uniform float uN;
vec4 decal(vec3 wp) {
  float k = 0.0;
  for (int i = 0; i < ${MAX}; i++) {
    if (float(i) >= uN) break;
    vec2 o = wp.xz - uZ[i].xz;
    float rr = length(o) / uZ[i].w, reach = mix(0.3, 1.0, smoothstep(0.0, ${ROLL_IN.toFixed(2)}, uZ2[i].z));
    float edge = 1.0 - smoothstep(0.7 * reach, 1.02 * reach, rr + (fbm3(vec3(o * 1.1, uZ2[i].y + 9.0)) - 0.5) * 0.4);
    k = max(k, edge * uZ2[i].x);
  }
  if (k <= 0.0) return vec4(0.0);
  float patchN = fbm3(vec3(wp.xz * 0.8, 11.0)), grain = vnoise3(vec3(wp.xz * 9.0, 3.0));
  float v = 1.0 - abs(vnoise3(vec3(wp.xz * 1.6, 2.0)) * 2.0 - 1.0);
  float veins = smoothstep(0.955, 0.99, v) * smoothstep(0.35, 0.6, vnoise3(vec3(wp.xz * 0.9, 9.0)));
  float cov = smoothstep(0.35, 0.6, patchN + grain * 0.15);
  float a = (0.18 + 0.2 * cov + 0.05 * grain) * k;
  vec3 c = vec3(0.4, 0.75, 1.1) * 1.4 * (0.18 + 0.1 * cov) * k + vec3(1.0, 1.1, 1.2) * 1.4 * (0.12 * cov + 0.3 * veins) * k;
  return vec4(c, a);
}`;

export class ZoneFogs {
  readonly group = new THREE.Group();
  private readonly P = Array.from({ length: MAX }, () => new THREE.Vector4());
  private readonly P2 = Array.from({ length: MAX }, () => new THREE.Vector4());
  private readonly U = { uZ: { value: this.P }, uZ2: { value: this.P2 }, uClock: { value: 0 }, uN: { value: 0 } };
  private geo: THREE.InstancedBufferGeometry;
  private readonly mesh: THREE.Mesh;
  private readonly rime: GroundDecal;
  /** Sim time each zone slot was first seen holding its current fog (keyed by slot, with where it is). */
  private seen = new Map<number, { t0: number; x: number; y: number }>();
  private lastT = -Infinity;

  constructor(heightAt: HeightAt) {
    this.geo = new THREE.InstancedBufferGeometry().copy(new THREE.BoxGeometry(2, 2, 2) as unknown as THREE.InstancedBufferGeometry);
    this.geo.instanceCount = 0;
    const m = premulMaterial(new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: { ...this.U, ...FX_U }, vertexShader: VERT, fragmentShader: FRAG, side: THREE.BackSide }));
    m.depthTest = false;
    this.mesh = new THREE.Mesh(this.geo, m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.name = 'fog.mist';   // ?fxoff= (view3d/fx-off.ts)
    this.rime = new GroundDecal({ look: RIME, uniforms: this.U, order: -1 }, heightAt);
    this.rime.mesh.name = 'fog.rime';
    this.group.add(this.rime.mesh, this.mesh);
    this.group.name = 'fog';
  }

  /** Forget when each fog appeared (a lab drawing another world). */
  reset(): void { this.seen.clear(); this.lastT = -Infinity; }

  /** One frame at sim time t. */
  update(w: World, t: number, heightAt: HeightAt, lights: SpellLights | null): void {
    const z = w.zones, watching = t >= this.lastT && t - this.lastT <= 0.25;
    this.lastT = t;
    let n = 0, x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (let k = 0; k < MAX_ZONES && n < MAX; k++) {
      if (z.type[k] !== ZONE.frost) { this.seen.delete(k); continue; }
      const x = z.x[k], y = z.y[k], r = z.r[k];
      let s = this.seen.get(k);
      if (!s || s.x !== x || s.y !== y || s.t0 > t) { s = { t0: watching ? t : t - 9, x, y }; this.seen.set(k, s); }
      const age = t - s.t0, amount = Math.min(1, z.life[k] / 30) * Math.min(1, age / 0.2 + 0.2);
      this.P[n].set(x, heightAt(x, y), y, r);
      this.P2[n].set(amount, (k * 37.7) % 23, age, 0);
      x0 = Math.min(x0, x - r - 1); x1 = Math.max(x1, x + r + 1); z0 = Math.min(z0, y - r - 1); z1 = Math.max(z1, y + r + 1);
      if (lights) lights.add(x, heightAt(x, y) + 0.6, y, 0xbfe8ff, 0.7 * amount, r + 1.5);
      n++;
    }
    this.U.uN.value = n; this.U.uClock.value = t;
    this.geo.instanceCount = n;
    this.group.visible = n > 0;
    if (n) { this.rime.heightAt = heightAt; this.rime.cover({ x0, z0, x1, z1 }); }
  }

  dispose(): void { this.geo.dispose(); (this.mesh.material as THREE.Material).dispose(); this.rime.dispose(); }
}
