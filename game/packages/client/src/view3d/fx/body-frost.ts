/**
 * Chilled and Frozen on a body, and Chill's flare on its caster (Cold, Self), as gas like burning (body-burn.ts), in
 * frost: the Cold pass, 2026-11-28. The pixel port's chill ring at the feet and frozen band (standins.ts) read as
 * markers, not as cold.
 *
 * - **Chilled:** a thin cold mist clinging to the body and sinking down it (cold air falls), pooling round the feet;
 *   more of it as the chill builds.
 * - **Frozen:** a crust of ice over the body: dense, faceted, glassy blue with white facets, still (nothing moves in
 *   ice).
 * - **Chill going off** (uS2.w below 0: BodyStatuses packs Burn's flare above 0, Chill's below): the mist bursts out and
 *   up round the caster for a moment.
 *
 * One box per body with a status (instanced: one draw), collapsed for a body with no cold on it; the march stops at the
 * scene's depth, so the model hides what is behind it. A pure function of BodyStatuses' arrays and the clock.
 */
import * as THREE from 'three';
import { HASH, NOISE } from './glsl';
import { premulMaterial } from './particles';
import { FX_U } from './stage';

const STEPS = 16;

const HEAD = (max: number) => /* glsl */ `
${HASH}
${NOISE}
uniform vec4 uP[${max}];   // x, ground, z, drawn height
uniform vec4 uS[${max}];   // burn, chill 0..1, frozen 0/1, stunned
uniform vec4 uS2[${max}];  // wet, radius, seed, flare (below 0: Chill's)
uniform float uClock;
float coldOf(int i) { return max(max(uS[i].y, uS[i].z), max(-uS2[i].w, 0.0)); }
float topOf(int i) { return uP[i].w * (1.0 + 0.4 * max(-uS2[i].w, 0.0)); }
void boxOf(int i, out vec3 c, out vec3 h) {
  float top = topOf(i), R = uS2[i].y * (1.7 + 0.8 * max(-uS2[i].w, 0.0)) + 0.25;
  c = uP[i].xyz + vec3(0.0, top * 0.5 + 0.1, 0.0); h = vec3(R, top * 0.5 + 0.3, R);
}
`;

const VERT = (max: number) => /* glsl */ `
${HEAD(max)}
out vec3 vWorld; flat out int vI;
void main() {
  vI = gl_InstanceID;
  if (coldOf(gl_InstanceID) < 0.05) { vWorld = vec3(0.0); gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec3 c, h; boxOf(gl_InstanceID, c, h);
  vec3 wp = c + position * h;
  vWorld = wp;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;

const FRAG = (max: number) => /* glsl */ `
#include <packing>
${HEAD(max)}
uniform sampler2D uDepth; uniform vec2 uRes; uniform float uNear, uFar;
in vec3 vWorld; flat in int vI;
out vec4 fxColor;
// (density, ice 0/1)
vec2 frost(vec3 p, int i) {
  vec4 P = uP[i]; float chill = uS[i].y, frozen = step(0.5, uS[i].z), fl = max(-uS2[i].w, 0.0), seed = uS2[i].z;
  float rad = uS2[i].y * (1.0 + 0.6 * fl), y = p.y - P.y, top = topOf(i);
  if (y < 0.0 || y > top + 0.3) return vec2(0.0);
  vec2 o = p.xz - P.xz; float r = length(o);
  if (frozen > 0.5) {
    // the ice: a crust hugging the body, faceted (stepped noise), still
    float sheath = 1.0 - smoothstep(rad * 0.85, rad * 1.2, r);
    float cells = floor(vnoise3(vec3(o * 3.0, y * 2.2) + seed) * 5.0) / 5.0;
    float d = sheath * (1.0 - smoothstep(top * 0.8, top * 1.02, y)) * 1.2 - 0.3 + (cells - 0.5) * 0.6;
    return vec2(max(d, 0.0), 1.0);
  }
  // the mist: sinking down the body (cold air falls), thick round the feet; bursting out and up as Chill goes off
  float sheath = 1.0 - smoothstep(rad * 0.7, rad * 1.6, r);
  vec3 q = vec3(o * 2.4, y * 1.5 + uClock * (1.1 - 3.0 * fl)) + vec3(seed * 1.7, seed * 2.3, 0.0);
  q.xy += (vec2(vnoise3(q * 0.5 + 3.1), vnoise3(q * 0.5 + 7.7)) - 0.5) * 1.3;
  float n = fbm3(q);
  float k = min(1.0, chill + fl);
  float body = sheath * (0.3 + 0.8 * (1.0 - y / top)) * mix(0.55, 1.0, k) - 0.5 + 0.2 * fl;
  float d = body + (n - 0.5) * 1.8;
  return vec2(max(d, 0.0), 0.0);
}
void main() {
  vec3 c, h; boxOf(vI, c, h);
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
    vec2 g = frost(ro + rd * t, vI);
    if (g.x > 0.0) {
      float a;
      vec3 fc;
      if (g.y > 0.5) {
        // ice: glassy blue, white where it is thick (the facets catch the light)
        a = (1.0 - exp(-g.x * 10.0 * dt)) * smoothstep(0.0, 0.08, g.x) * 0.85;
        fc = mix(vec3(0.15, 0.5, 1.15), vec3(1.4, 1.6, 1.75), smoothstep(0.25, 0.55, g.x));
      } else {
        // mist: cyan in its shade, white where thick
        a = (1.0 - exp(-g.x * 6.0 * dt)) * smoothstep(0.0, 0.25, g.x);
        fc = mix(vec3(0.25, 0.6, 1.1), vec3(1.35, 1.5, 1.62), smoothstep(0.1, 0.6, g.x));
      }
      col += (1.0 - acc) * a * fc;
      acc += (1.0 - acc) * a;
      if (acc > 0.97) break;
    }
    t += dt;
  }
  if (acc < 0.004) discard;
  fxColor = vec4(col, acc);
}`;

/** The cold on bodies: one instanced draw of a box per body with a status (BodyStatuses' arrays). */
export class BodyFrost {
  readonly mesh: THREE.Mesh;
  private geo: THREE.InstancedBufferGeometry;

  constructor(max: number, uniforms: Record<string, THREE.IUniform>) {
    this.geo = new THREE.InstancedBufferGeometry().copy(new THREE.BoxGeometry(2, 2, 2) as unknown as THREE.InstancedBufferGeometry);
    this.geo.instanceCount = 0;
    const m = premulMaterial(new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: { ...uniforms, ...FX_U }, vertexShader: VERT(max), fragmentShader: FRAG(max), side: THREE.BackSide }));
    m.depthTest = false;
    this.mesh = new THREE.Mesh(this.geo, m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.name = 'statuses.frost';   // ?fxoff= (view3d/fx-off.ts)
  }

  set count(n: number) { this.geo.instanceCount = n; this.mesh.visible = n > 0; }

  dispose(): void { this.geo.dispose(); (this.mesh.material as THREE.Material).dispose(); }
}
