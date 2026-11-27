/**
 * The Fire spray's flames as burning gas (?spray=gas): the same ray-marched gas as the Fire wave, the patch and burning
 * bodies (fire-wave.ts, fire-floor.ts, body-burn.ts), in place of the painted flame puffs and their glow. Tried on the
 * flamethrower's close-out (2026-11-27), beside the flipbook, so the whole of Fire can be one material.
 *
 * One box round the spray, each pixel marching through a density shaped like the sim's raindrop (dropW): a stream
 * narrow at the hands, swelling to the bulb, rounded at its end, flattened over the floor, rising a little as it burns
 * out. Each slice follows the aim it left the hands with (aimAt, a slice's age from how far out it is, on the puffs'
 * own drag curve), so a sweep bends it like a hose. Noise races outward through it (fast near the hands, slower as it
 * drags) and tears its edges into tongues; hot (yellow) along its middle near the hands, orange, red at its edges and
 * end. Its head runs out over the travel time when the channel starts, and after it stops the tail leaves the hands
 * and follows the head out.
 *
 * Stateless: a function of the spray's uniforms (fire.ts SPRAY_HEAD's aim trail, nozzle, drop) and the clock.
 */
import * as THREE from 'three';
import { HASH, NOISE } from './glsl';
import { premulMaterial } from './particles';
import { FX_U } from './stage';

/** March steps through the box. */
const STEPS = 30;

const VERT = (head: string) => /* glsl */ `
${head}
uniform vec3 uBoxC, uBoxH;
out vec3 vWorld;
void main() {
  vec3 wp = uBoxC + position * uBoxH;
  vWorld = wp;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;

const FRAG = (head: string) => /* glsl */ `
#include <packing>
${HASH}
${NOISE}
${head}
uniform vec3 uBoxC, uBoxH;
uniform sampler2D uDepth; uniform vec2 uRes; uniform float uNear, uFar;
uniform float uTime, uEnd, uTravel, uOn, uGasTo;   // uGasTo: ?spray=mix, the gas only this far out (the puffs after)
in vec3 vWorld;
out vec4 fxColor;
// the patch's and the wave's ramp: 0 hottest .. 1 going out
vec3 gasRamp(float h) {
  h = clamp(h, 0.0, 1.0);
  vec3 c0 = vec3(3.2, 1.6, 0.08), c1 = vec3(2.5, 0.8, 0.03), c2 = vec3(1.6, 0.3, 0.012), c3 = vec3(0.7, 0.08, 0.01), c4 = vec3(0.12, 0.02, 0.01);
  if (h < 0.2) return mix(c0, c1, h / 0.2);
  if (h < 0.45) return mix(c1, c2, (h - 0.2) / 0.25);
  if (h < 0.7) return mix(c2, c3, (h - 0.45) / 0.25);
  return mix(c3, c4, (h - 0.7) / 0.3);
}
// a slice s of the way out left the hands this long ago (the puffs' drag curve: fast out, slowing toward the end)
// (past the end, in the bulb, it keeps ageing so it can burn out there)
float ageOf(float s) { return s <= 1.0 ? 1.0 - pow(max(1.0 - max(s, 0.0), 0.0), 0.714) : 1.0 + (s - 1.0) * 0.8; }
float agoOf(float s) { return uTravel * min(ageOf(s), 1.0); }
vec2 gas(vec3 p) {
  // where along the stream p is: first by the aim now, then (twice) by the aim its slice left the hands with, so a fast
  // turn bends the stream instead of smearing it into a sheet (take 1: "looks very 2d if you rotate rapidly")
  // (measured against the spray's full range, not the sim's reach: the reach grows as the channel starts, and gas
  // measured against the short reach it left with read as burnt out past it, a straight cut that ran out with it)
  vec4 A = aimAt(0.0);
  float reachNow = A.w, R = max(uRange - uNoz.x, 0.3);
  float s = (dot(p.xz - A.xy, vec2(cos(A.z), sin(A.z))) - uNoz.x) / R;
  for (int k = 0; k < 2; k++) {
    A = aimAt(agoOf(s));
    s = (dot(p.xz - A.xy, vec2(cos(A.z), sin(A.z))) - uNoz.x) / R;
  }
  vec2 dir = vec2(cos(A.z), sin(A.z)), nn = vec2(-dir.y, dir.x), o = p.xz - A.xy;
  float along = dot(o, dir), across = dot(o, nn);
  if (s < -0.08) return vec2(0.0, 1.0);
  // the gas there left the hands at emit (s, on the puffs' own drag curve: fast out, slowing) and is age (0..1 over
  // its travel, more in the bulb). Everything follows the gas, not the place: its pattern is born at the hands and
  // carried out (take 1: flames "just appear from the aether"; it "just drifts along"), only gas emitted while the
  // channel ran exists (so when it stops, the last of it travels out and burns out: take 1, "looks like its being
  // erased rather than fading"), and it thins and reddens as it ages.
  // (s broken by a noise fixed in space first: every line of equal age, the front and the burn-out, was straight)
  float ragS = (fbm3(vec3(p.xz * 1.4, uTime * 1.2)) - 0.5) * 0.3 * smoothstep(0.1, 0.5, s);
  float age = ageOf(s + ragS), emit = uTime - uTravel * age;
  if (age > 1.8) return vec2(0.0, 1.0);
  // the raindrop's width there (rounded at its end), never thinner than the jet at the hands; nearly round across
  float w = max(dropW(max(along, 0.0)), 0.0) * 1.12 + 0.12 * (1.0 - smoothstep(0.0, 0.25, s));
  float cy = uNoz.w + axisH(s) + age * age * 0.5, hv = 0.18 + w * 0.8;
  float e = length(vec2(across / (w + 0.08), (p.y - cy) / hv));
  if (e > 1.6) return vec2(0.0, 1.0);
  // the gas's own pattern: by when it left the hands (along), and across and up as a share of the stream there, so its
  // billows swell as it spreads; boiling fast (the churn: a raging fire, not a drift)
  float an = across / (w + 0.15), yn = (p.y - cy) / hv;
  float big = fbm3(vec3(emit * 4.0, an * 1.2, yn * 0.8 + 3.0));
  vec3 q = vec3(emit * 16.0, an * 3.2, yn * 2.6);
  q += (vec3(vnoise3(q * 0.5 + vec3(0.0, 0.0, uTime * 4.0)), vnoise3(q * 0.5 + vec3(5.2, 1.3, uTime * 4.0)), vnoise3(q * 0.5 + vec3(2.7, 8.1, uTime * 4.0))) - 0.5) * 1.8;
  float n = fbm3(q + vec3(0.0, 0.0, uTime * 2.5));
  // the first and last gas of the channel, torn by its own pattern rather than cut straight
  // (and by a noise fixed in space: near the end the gas's emit hardly changes along it, so a cut there was a line)
  float ragged = emit + (n - 0.5) * 0.22 + ragS * 0.9;
  float live = smoothstep(-0.03, 0.05, ragged) * (1.0 - smoothstep(uEnd - 0.05, uEnd + 0.03, ragged));
  // and where the sim's channel stops now (a wall or a body cuts it short), a rounded, torn end
  live *= 1.0 - smoothstep(reachNow - 0.4, reachNow + 0.6, along + (n - 0.5) * 1.4 + abs(across) * 0.3);
  float burn = (1.0 - smoothstep(0.55, 1.25, age + (big - 0.5) * 0.35)) * (1.0 - smoothstep(uGasTo - 0.28, uGasTo + 0.28, s + ragS + (n - 0.5) * 0.2));
  if (live * burn <= 0.0) return vec2(0.0, 1.0);
  // a tight jet at the hands, torn into tongues and billows as it opens
  float tear = mix(0.5, 2.0, smoothstep(0.0, 0.35, age));
  float body = (1.0 - e) * mix(1.1, 0.85, smoothstep(0.0, 0.4, s)) * live * burn - 0.15 - 0.25 * (1.0 - burn);
  float d = body + (n - 0.5) * tear;
  if (d <= 0.0) return vec2(0.0, 1.0);
  // the dense hearts hot, the thin edges red; hot as it leaves the hands, reddening as it ages; more runes run hotter
  // (in the mix it reddens toward the puffs' colour as it hands over to them)
  float heat = 0.1 + 0.3 * smoothstep(uGasTo - 0.3, uGasTo + 0.1, s) + (big - 0.5) * 0.45 + 0.45 * clamp(age, 0.0, 1.2) + 0.12 * clamp(e, 0.0, 1.0) + 0.45 * (1.0 - clamp(d * 1.8, 0.0, 1.0)) - uHot * 0.8;
  return vec2(d, heat);
}
void main() {
  vec3 ro = cameraPosition, rd = normalize(vWorld - ro);
  vec3 inv = 1.0 / rd, t0 = (uBoxC - uBoxH - ro) * inv, t1 = (uBoxC + uBoxH - ro) * inv;
  vec3 tn = min(t0, t1);
  float tIn = max(max(max(tn.x, tn.y), tn.z), 0.0), tOut = length(vWorld - ro);
  vec3 fwd = -vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
  float scene = -perspectiveDepthToViewZ(texture(uDepth, gl_FragCoord.xy / uRes).r, uNear, uFar);
  tOut = min(tOut, scene / max(dot(rd, fwd), 1e-3));
  if (tOut <= tIn) discard;
  float dt = (tOut - tIn) / ${STEPS}.0;
  float t = tIn + dt * fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  vec3 col = vec3(0.0); float acc = 0.0;
  for (int i = 0; i < ${STEPS}; i++) {
    vec2 g = gas(ro + rd * t);
    if (g.x > 0.0) {
      // thin gas fades out red rather than darkening the floor (the patch's dark is its char; here there is none)
      float a = (1.0 - exp(-g.x * 20.0 * dt)) * smoothstep(0.02, 0.2, g.x) * (1.0 - smoothstep(0.7, 0.95, g.y));
      col += (1.0 - acc) * a * gasRamp(min(g.y, 0.74));
      acc += (1.0 - acc) * a;
      if (acc > 0.98) break;
    }
    t += dt;
  }
  acc *= uOn; col *= uOn;
  if (acc < 0.004) discard;
  fxColor = vec4(col, acc);
}`;

/** The spray's gas: one box round the stream. `head` is fire.ts SPRAY_HEAD (the aim trail, nozzle and drop). */
export class SprayGas {
  readonly mesh: THREE.Mesh;
  readonly u: Record<string, THREE.IUniform>;

  constructor(head: string, shared: Record<string, THREE.IUniform>) {
    this.u = { ...shared, ...FX_U, uBoxC: { value: new THREE.Vector3() }, uBoxH: { value: new THREE.Vector3(1, 1, 1) }, uTravel: { value: 0.72 }, uOn: { value: 1 }, uGasTo: { value: 9 } };
    const m = premulMaterial(new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: this.u, vertexShader: VERT(head), fragmentShader: FRAG(head), side: THREE.BackSide }));
    m.depthTest = false;   // the march stops at the world's depth itself
    this.mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.mesh.name = 'spray.gas';   // ?fxoff= (view3d/fx-off.ts)
  }

  /** The box: round the caster at (x, z) out to `reach` and the drop's bulb, from the floor (`groundY`) up. */
  place(x: number, z: number, reach: number, groundY: number): void {
    const r = reach + 1.6;
    (this.u.uBoxC.value as THREE.Vector3).set(x, groundY + 1.4, z);
    (this.u.uBoxH.value as THREE.Vector3).set(r, 1.5, r);
  }

  dispose(): void { this.mesh.geometry.dispose(); (this.mesh.material as THREE.Material).dispose(); }
}
