/**
 * The effects kit's particles: one batch is one draw call of camera-facing quads whose every property is computed in
 * the vertex shader from the time and the particle's index. Nothing is stored or integrated, so setting the time
 * freezes or rewinds a batch exactly (rollback redraws correctly; the lab's `t=` shows any moment).
 *
 * A family writes two GLSL functions and picks how particles are born:
 *
 * - **Motion.** `Particle particle(float k, float age, float ts)` for a steady stream (`streamMotion`): particle k is
 *   born at ts = k / uRate seconds after the emitter started and lives uLife seconds (age 0..1), as art/util.ts emit()
 *   does for the pixel effects. Births stop after uEnd (the channel ended); the ones in flight finish their lives.
 *   Or `Particle emitParticle(float slot, float back)` for anything else (the fire floor: flames per burning cell).
 *   `back` asks for the same particle `back` seconds earlier; the kit uses it to stretch a quad along its motion.
 * - **Look.** `vec4 look(vec2 uv, vec4 col, vec4 data)`: the quad's colour as premultiplied linear RGBA (alpha 0 adds
 *   light, alpha 1 covers). `uv` runs -1..1 across the quad (for upright quads, y runs 0 at the base to 1 at the top);
 *   `col` and `data` are whatever the motion put in the particle.
 *
 * The batch draws after the scene into the same target (fx/stage.ts): hardware depth test against the scene, and a soft
 * fade where a particle comes near what's behind it (the scene's resolved depth, `soft` u), so flames don't cut a hard
 * line where they meet the floor or a body.
 */
import * as THREE from 'three';
import { HASH, NOISE, RAMPS } from './glsl';
import { FX_U } from './stage';

export interface BatchSpec {
  /** GLSL: the motion (see above), with any uniforms it declares. */
  motion: string;
  /** GLSL: `vec4 look(vec2 uv, vec4 col, vec4 data)`, with any uniforms it declares. */
  look: string;
  /** The family's own uniforms (shared objects may be passed: the same value then feeds several batches). */
  uniforms?: Record<string, THREE.IUniform>;
  /** How many quads at most (instances): a stream needs ceil(rate * life) + 1. */
  cap: number;
  /** Quads stand on their base and turn only about the vertical (flames on the floor), instead of facing the camera. */
  upright?: boolean;
  /** Depth-fade distance in u (default 0.35). */
  soft?: number;
  /** Draw order among the effects (higher later). */
  order?: number;
}

/** The struct every motion fills. size: half the quad's height (u); aspect: width over height; stretch: how far the quad
 * stretches back along its motion (in seconds of travel); rot: turn in the view (billboards) or lean (upright). */
const STRUCT = /* glsl */ `
struct Particle { vec3 pos; float size; float aspect; float stretch; float rot; vec4 col; vec4 data; bool alive; };
Particle P0() { Particle p; p.pos = vec3(0); p.size = 0.1; p.aspect = 1.0; p.stretch = 0.0; p.rot = 0.0; p.col = vec4(1); p.data = vec4(0); p.alive = false; return p; }
`;

/** A steady stream (see the file's docblock): the family writes `Particle particle(float k, float age, float ts)`. */
export const streamMotion = (body: string): string => /* glsl */ `
uniform float uTime, uRate, uLife, uEnd;
${body}
Particle emitParticle(float slot, float back) {
  float k = floor(uTime * uRate) - slot, ts = k / uRate, age = (uTime - back - ts) / uLife;
  if (back > 0.0) age = max(age, 0.0);
  if (ts < 0.0 || ts > uEnd || age < 0.0 || age >= 1.0) return P0();
  return particle(k, age, ts);
}
`;

const VERT = (motion: string, upright: boolean) => /* glsl */ `
${HASH}
${NOISE}
${STRUCT}
in float aSlot;
out vec2 vUv; out vec4 vCol; out vec4 vData; out float vViewZ;
${motion}
void main() {
  Particle p = emitParticle(aSlot, 0.0);
  if (!p.alive || p.size <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec2 c = position.xy;
  vCol = p.col; vData = p.data;
${upright ? /* glsl */ `
  // on its base, facing the camera round the vertical only; rot leans it sideways
  vec3 right = normalize(vec3(viewMatrix[0][0], 0.0, viewMatrix[2][0]));
  float h = p.size * 2.0, y = c.y * 0.5 + 0.5;
  vec3 wp = p.pos + right * (c.x * p.size * p.aspect + sin(p.rot) * h * y * y) + vec3(0.0, y * h, 0.0);
  vec4 mv = viewMatrix * vec4(wp, 1.0);
  vUv = vec2(c.x, y);` : /* glsl */ `
  vec4 mv = viewMatrix * vec4(p.pos, 1.0);
  vec2 ax = vec2(cos(p.rot), sin(p.rot)), ay = vec2(-ax.y, ax.x);
  float len = p.size;
  if (p.stretch > 0.0) {
    Particle q = emitParticle(aSlot, 0.03);
    vec2 dv = q.alive ? (mat3(viewMatrix) * (p.pos - q.pos)).xy / 0.03 : vec2(0.0);
    float l = length(dv);
    // the head stays round at the particle; the tail trails stretch seconds of travel behind it
    if (l > 1e-3) { float trail = l * p.stretch; ay = dv / l; ax = vec2(ay.y, -ay.x); len = p.size + trail * 0.5; mv.xy -= ay * trail * 0.5; }
  }
  mv.xy += ax * c.x * p.size * p.aspect + ay * c.y * len;
  vUv = c;`}
  vViewZ = mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = (look: string) => /* glsl */ `
#include <packing>
${HASH}
${NOISE}
${RAMPS}
uniform sampler2D uDepth; uniform vec2 uRes; uniform float uNear, uFar, uSoft, uOpacity;
in vec2 vUv; in vec4 vCol; in vec4 vData; in float vViewZ;
out vec4 fxColor;
${look}
void main() {
  vec4 c = look(vUv, vCol, vData);
  if (c.a <= 0.0 && c.r + c.g + c.b <= 0.0) discard;
  float scene = -perspectiveDepthToViewZ(texture(uDepth, gl_FragCoord.xy / uRes).r, uNear, uFar);
  fxColor = c * clamp((scene + vViewZ) / uSoft, 0.0, 1.0) * uOpacity;
}
`;

/** Premultiplied blending: rgb adds, alpha covers what's behind. */
export function premulMaterial(m: THREE.ShaderMaterial): THREE.ShaderMaterial {
  Object.assign(m, {
    transparent: true, depthWrite: false, depthTest: true, blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
  return m;
}

let QUAD: THREE.BufferAttribute | null = null;

/** One draw call of particles (see the file's docblock). Add `.mesh` to the effects scene (FxStage.scene). */
export class ParticleBatch {
  readonly mesh: THREE.Mesh;
  readonly geometry: THREE.InstancedBufferGeometry;
  readonly material: THREE.ShaderMaterial;
  /** The material's uniforms: the family's, the kit's (uSeed, uOpacity, uSoft) and the stage's (depth, size, near/far). */
  readonly u: Record<string, THREE.IUniform>;

  constructor(readonly spec: BatchSpec) {
    const g = (this.geometry = new THREE.InstancedBufferGeometry());
    QUAD ??= new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3);
    g.setAttribute('position', QUAD);
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const slots = new Float32Array(spec.cap);
    for (let i = 0; i < spec.cap; i++) slots[i] = i;
    g.setAttribute('aSlot', new THREE.InstancedBufferAttribute(slots, 1));
    g.instanceCount = spec.cap;
    this.u = { uSeed: { value: 0 }, uOpacity: { value: 1 }, uSoft: { value: spec.soft ?? 0.35 }, ...FX_U, ...spec.uniforms };
    this.material = premulMaterial(new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, uniforms: this.u,
      vertexShader: VERT(spec.motion, !!spec.upright), fragmentShader: FRAG(spec.look),
    }));
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = spec.order ?? 0;
  }

  /** Quads drawn this frame (at most cap): a stream needs all; a floor sets cells × flames per cell. */
  set count(n: number) { this.geometry.instanceCount = Math.max(0, Math.min(this.spec.cap, n)); }
  get count(): number { return this.geometry.instanceCount; }

  dispose(): void { this.geometry.dispose(); this.material.dispose(); }
}
