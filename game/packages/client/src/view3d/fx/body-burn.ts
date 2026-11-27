/**
 * Burning on a body, as the same burning gas as the Fire wave and patch (fire-wave.ts, fire-floor.ts): the pixel game's
 * port (flame licks as teardrop sprites re-rolled 14 times a second) read as sprites beside the signed-off gas.
 *
 * One box per burning body (instanced: one draw for all), each ray-marched like the patch: a sheath of gas round the
 * body with tongues rising through it and up past the head, thickest low on the body; the model hides what is behind
 * it (the march stops at the scene's depth), so the flames wrap the side the camera sees. A weak burn (a nearly spent
 * pool) burns lower and thinner.
 *
 * Its inputs are BodyStatuses' uniform arrays (where each body is drawn, its height, radius, burn and seed), so it is a
 * pure function of them and the clock: frozen frames and rollback draw it exactly.
 */
import * as THREE from 'three';
import { HASH, NOISE } from './glsl';
import { premulMaterial } from './particles';
import { FX_U } from './stage';

/** March steps through each body's box. */
const STEPS = 18;

const HEAD = (max: number) => /* glsl */ `
${HASH}
${NOISE}
uniform vec4 uP[${max}];   // x, ground, z, drawn height
uniform vec4 uS[${max}];   // burn 0..1, ...
uniform vec4 uS2[${max}];  // -, radius, seed, -
uniform float uClock;
// how tall the flames reach on body i, and its box (centre, half size)
float topOf(int i) { return uP[i].w * (1.05 + 0.35 * uS[i].x); }
void boxOf(int i, out vec3 c, out vec3 h) {
  float top = topOf(i), R = uS2[i].y * 1.9 + 0.25;
  c = uP[i].xyz + vec3(0.0, top * 0.5 + 0.1, 0.0); h = vec3(R, top * 0.5 + 0.35, R);
}
`;

const VERT = (max: number) => /* glsl */ `
${HEAD(max)}
out vec3 vWorld; flat out int vI;
void main() {
  vI = gl_InstanceID;
  // a body with another status and no burn: no box
  if (uS[gl_InstanceID].x < 0.05) { vWorld = vec3(0.0); gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
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
// the patch's and the wave's ramp (fire-floor.ts gasRamp): 0 hottest .. 1 going out
vec3 gasRamp(float h) {
  h = clamp(h, 0.0, 1.0);
  vec3 c0 = vec3(3.2, 1.6, 0.08), c1 = vec3(2.5, 0.8, 0.03), c2 = vec3(1.6, 0.3, 0.012), c3 = vec3(0.7, 0.08, 0.01), c4 = vec3(0.12, 0.02, 0.01);
  if (h < 0.2) return mix(c0, c1, h / 0.2);
  if (h < 0.45) return mix(c1, c2, (h - 0.2) / 0.25);
  if (h < 0.7) return mix(c2, c3, (h - 0.45) / 0.25);
  return mix(c3, c4, (h - 0.7) / 0.3);
}
vec2 gas(vec3 p, int i) {
  vec4 P = uP[i]; float k = uS[i].x, rad = uS2[i].y, seed = uS2[i].z;
  float y = p.y - P.y, top = topOf(i);
  if (y < 0.0 || y > top + 0.3) return vec2(0.0, 1.0);
  vec2 o = p.xz - P.xz; float r = length(o);
  // a sheath round the body, thick low on it and thinning up to its tips (heat rises off the shoulders and head)
  float sheath = 1.0 - smoothstep(rad * 0.7, rad * 1.75, r);
  // tongues: each way round the body its own flame height, flickering (cos/sin of the angle: no seam), so the outline
  // is a crown of licks rather than a haze
  float ang = atan(o.y, o.x);
  float lt = top * (0.45 + 0.85 * vnoise3(vec3(cos(ang) * 1.6 + seed, sin(ang) * 1.6, uClock * 2.2)));
  float rise = 1.0 - y / max(lt, 0.1);
  // noise climbing fast through the gas (a body's flames are small and quick), stretched upward, bent by a slower noise
  vec3 q = vec3(o * 2.8, y * 1.1 - uClock * 4.0) + vec3(seed * 1.7, seed * 2.3, 0.0);
  q.xy += (vec2(vnoise3(q * 0.5 + 3.1), vnoise3(q * 0.5 + 7.7)) - 0.5) * 1.3;
  float n = fbm3(q);
  float body = sheath * (0.45 + 0.6 * rise) * smoothstep(-0.1, 0.25, rise) * mix(0.75, 1.1, k) - 0.42;
  float d = body + (n - 0.5) * 2.0;
  if (d <= 0.0) return vec2(0.0, 1.0);
  // orange to red: only the thickest low core goes yellow (a body's fire white-hot read as a cream pill)
  float heat = 1.0 - clamp(d * 1.3, 0.0, 1.0) + 0.28 * clamp(y / top, 0.0, 1.0) + 0.12;
  return vec2(d, heat);
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
    vec2 g = gas(ro + rd * t, vI);
    if (g.x > 0.0) {
      // thin gas fades out rather than darkening (on the patch the dark is the char; round a body it was a muddy veil)
      // and the coolest tips fade out red rather than going brown
      float a = (1.0 - exp(-g.x * 14.0 * dt)) * smoothstep(0.03, 0.3, g.x) * (1.0 - smoothstep(0.62, 0.9, g.y));
      col += (1.0 - acc) * a * gasRamp(min(g.y, 0.68));
      acc += (1.0 - acc) * a;
      if (acc > 0.98) break;
    }
    t += dt;
  }
  if (acc < 0.004) discard;
  fxColor = vec4(col, acc);
}`;

/** The burning bodies' gas: one instanced draw of a box per burning body (BodyStatuses packs them first). */
export class BodyBurn {
  readonly mesh: THREE.Mesh;
  private geo: THREE.InstancedBufferGeometry;

  constructor(max: number, uniforms: Record<string, THREE.IUniform>) {
    this.geo = new THREE.InstancedBufferGeometry().copy(new THREE.BoxGeometry(2, 2, 2) as unknown as THREE.InstancedBufferGeometry);
    this.geo.instanceCount = 0;
    const m = premulMaterial(new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: { ...uniforms, ...FX_U }, vertexShader: VERT(max), fragmentShader: FRAG(max), side: THREE.BackSide }));
    m.depthTest = false;   // the march stops at the world's depth itself
    this.mesh = new THREE.Mesh(this.geo, m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.name = 'statuses.burn';   // ?fxoff= (view3d/fx-off.ts)
  }

  /** How many bodies (the first n in the uniform arrays) burn. */
  set count(n: number) { this.geo.instanceCount = n; this.mesh.visible = n > 0; }

  dispose(): void { this.geo.dispose(); (this.mesh.material as THREE.Material).dispose(); }
}
