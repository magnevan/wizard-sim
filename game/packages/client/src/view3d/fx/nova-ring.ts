/**
 * The Area ring's wall, for every element's nova (Cold first; Fire, Water, Life and Arcane share the form): one
 * connected upright band round a centre, as the novas rule wants (docs/decisions: novas are one surface, not a row of
 * pieces). One draw call, a strip of `columns` quads round the circle; the wall's base follows the floor (`BASE_N`
 * height samples round the ring, set each frame), its top can lean outward, and everything about how it looks is the
 * family's fragment function:
 *
 *   `vec4 look(vec2 p)`: p.x the angle round the ring (0..2π, from +x toward +z), p.y the height over the floor (u, 0 at
 *   the base, up to uHeight at the mesh's top). Premultiplied linear RGBA, as particles.ts's looks; the family cuts its
 *   own top edge (teeth, flames, a wave's crest) by returning 0 above it.
 *
 * Drawn with the effects (premultiplied, depth-tested, no depth write), both faces, softened where it meets the floor.
 */
import * as THREE from 'three';
import { HASH, NOISE, RAMPS } from './glsl';
import { premulMaterial } from './particles';
import { FX_U } from './stage';

/** Floor heights sampled round the ring each frame. */
export const BASE_N = 64;

export interface RingSpec {
  /** GLSL: `vec4 look(vec2 p)` (see the file's docblock), with any uniforms it declares. */
  look: string;
  uniforms?: Record<string, THREE.IUniform>;
  /** Quads round the circle (default 384: under 0.1 u apart at a five-rune ring). */
  columns?: number;
  /** Depth-fade distance in u (default 0.12: a crisp foot). */
  soft?: number;
  order?: number;
}

const VERT = /* glsl */ `
in vec2 aRing;   // (fraction round, 0 base / 1 top)
uniform vec3 uCenter; uniform float uRadius, uHeight, uLean;
uniform float uBase[${BASE_N}];
out vec2 vP; out float vViewZ;
void main() {
  float th = aRing.x * 6.2831853, f = aRing.x * ${BASE_N}.0;
  int i = int(floor(f)) % ${BASE_N}, j = (i + 1) % ${BASE_N};
  float b = mix(uBase[i], uBase[j], fract(f));
  vec2 d = vec2(cos(th), sin(th));
  float rad = uRadius + uLean * aRing.y;
  vec3 wp = vec3(uCenter.x + d.x * rad, b + aRing.y * uHeight, uCenter.z + d.y * rad);
  vP = vec2(th, aRing.y * uHeight);
  vec4 mv = viewMatrix * vec4(wp, 1.0);
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
uniform float uHeight;
in vec2 vP; in float vViewZ;
out vec4 fxColor;
${look}
void main() {
  vec4 c = look(vP);
  if (c.a <= 0.0 && c.r + c.g + c.b <= 0.0) discard;
  float scene = -perspectiveDepthToViewZ(texture(uDepth, gl_FragCoord.xy / uRes).r, uNear, uFar);
  fxColor = c * clamp((scene + vViewZ) / uSoft, 0.0, 1.0) * uOpacity;
}
`;

export class NovaRing {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  /** The material's uniforms: the family's, the ring's (uCenter, uRadius, uHeight, uLean, uBase) and the kit's. */
  readonly u: Record<string, THREE.IUniform>;
  private base = new Float32Array(BASE_N);

  constructor(readonly spec: RingSpec) {
    const cols = spec.columns ?? 384, ring = new Float32Array((cols + 1) * 2 * 2), idx: number[] = [];
    for (let c = 0; c <= cols; c++) { ring.set([c / cols, 0, c / cols, 1], c * 4); }
    for (let c = 0; c < cols; c++) { const a = c * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('aRing', new THREE.BufferAttribute(ring, 2));
    // three wants a position attribute for its bookkeeping; the shader places every vertex itself
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((cols + 1) * 2 * 3), 3));
    g.setIndex(idx);
    this.u = {
      uSeed: { value: 0 }, uOpacity: { value: 1 }, uSoft: { value: spec.soft ?? 0.12 }, ...FX_U,
      uCenter: { value: new THREE.Vector3() }, uRadius: { value: 1 }, uHeight: { value: 1 }, uLean: { value: 0 }, uBase: { value: this.base },
      ...spec.uniforms,
    };
    this.material = premulMaterial(new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: this.u, vertexShader: VERT, fragmentShader: FRAG(spec.look), side: THREE.DoubleSide }));
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = spec.order ?? 2;
    this.mesh.visible = false;
  }

  /**
   * Stand the wall round (x, z) at radius r (u), `height` tall, its top `lean` u further out; its base on the floor
   * (`heightAt`, sampled round the ring).
   */
  place(x: number, z: number, r: number, height: number, lean: number, heightAt: (x: number, z: number) => number): void {
    (this.u.uCenter.value as THREE.Vector3).set(x, 0, z);
    this.u.uRadius.value = r; this.u.uHeight.value = height; this.u.uLean.value = lean;
    for (let i = 0; i < BASE_N; i++) {
      const a = (i / BASE_N) * Math.PI * 2;
      this.base[i] = heightAt(x + Math.cos(a) * r, z + Math.sin(a) * r);
    }
    this.mesh.visible = true;
  }

  dispose(): void { this.mesh.geometry.dispose(); this.material.dispose(); }
}
