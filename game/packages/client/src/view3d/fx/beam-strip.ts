/**
 * Straight strips for beams (the Arcane beam today, the Life beam later): a beam is a straight line, so it needs no
 * ribbon, only a quad stretched from its start to its end that turns about that line to face the camera, coloured by
 * a look function across its width and along its length. Its twin on the floor, `GroundStrip`, is the narrow strip of
 * light under a beam, draped over the floor's height so it follows steps and terraces.
 *
 * Both are stateless: the host sets the ends, the widths and the time each frame, and the family's GLSL does the rest.
 *
 * - **Look.** `vec4 look(float along, float across, float len)`: premultiplied linear RGBA (alpha 0 adds light, alpha 1
 *   covers), as the particles' looks are. `along` is u from the start (negative before it, past `len` after the end:
 *   the quad runs `pad` u past both ends, for round caps and glow); `across` is u from the middle line, signed.
 * - **Depth.** Tested against the scene and softened near it with the scene's depth (fx/stage.ts), as particles are.
 */
import * as THREE from 'three';
import { HASH, NOISE, RAMPS } from './glsl';
import { premulMaterial } from './particles';
import type { HeightAt } from './decal';
import { FX_U } from './stage';

export interface StripSpec {
  /** GLSL: `vec4 look(float along, float across, float len)`, with any uniforms it declares. */
  look: string;
  uniforms?: Record<string, THREE.IUniform>;
  /** Draw order among the effects (higher later). */
  order?: number;
  /** Depth-fade distance in u (default 0.25). */
  soft?: number;
}

const STRIP_VERT = /* glsl */ `
uniform vec3 uA, uB; uniform float uHalf, uPad;
out float vAlong, vAcross, vViewZ;
void main() {
  vec3 d = uB - uA; float len = max(length(d), 1e-4); vec3 dir = d / len;
  float along = mix(-uPad, len + uPad, position.x);
  vec3 p = uA + dir * along;
  vec3 side = cross(dir, normalize(cameraPosition - p));
  float sl = length(side); side = sl > 1e-4 ? side / sl : vec3(0.0, 1.0, 0.0);
  vec4 mv = viewMatrix * vec4(p + side * position.y * uHalf, 1.0);
  vAlong = along; vAcross = position.y * uHalf; vViewZ = mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const STRIP_FRAG = (look: string) => /* glsl */ `
#include <packing>
${HASH}
${NOISE}
${RAMPS}
uniform sampler2D uDepth; uniform vec2 uRes; uniform float uNear, uFar, uSoft, uOpacity, uLen;
in float vAlong, vAcross, vViewZ;
out vec4 fxColor;
${look}
void main() {
  vec4 c = look(vAlong, vAcross, uLen);
  if (c.a <= 0.0 && c.r + c.g + c.b <= 0.0) discard;
  float scene = -perspectiveDepthToViewZ(texture(uDepth, gl_FragCoord.xy / uRes).r, uNear, uFar);
  fxColor = c * clamp((scene + vViewZ) / uSoft, 0.0, 1.0) * uOpacity;
}
`;

let STRIP_GEO: THREE.BufferGeometry | null = null;

/** A beam's body: a camera-facing strip from `a` to `b` (three's space, u), `half` u either side of its line. */
export class BeamStrip {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  readonly u: Record<string, THREE.IUniform>;

  constructor(spec: StripSpec) {
    if (!STRIP_GEO) {
      STRIP_GEO = new THREE.BufferGeometry();
      STRIP_GEO.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, 1, 0]), 3));
      STRIP_GEO.setIndex([0, 1, 2, 0, 2, 3]);
    }
    this.u = {
      uA: { value: new THREE.Vector3() }, uB: { value: new THREE.Vector3(1, 0, 0) }, uHalf: { value: 0.2 }, uPad: { value: 0.2 }, uLen: { value: 1 },
      uSeed: { value: 0 }, uOpacity: { value: 1 }, uSoft: { value: spec.soft ?? 0.25 }, ...FX_U, ...spec.uniforms,
    };
    this.material = premulMaterial(new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: this.u, side: THREE.DoubleSide, vertexShader: STRIP_VERT, fragmentShader: STRIP_FRAG(spec.look) }));
    this.mesh = new THREE.Mesh(STRIP_GEO, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = spec.order ?? 0;
  }

  /** From a to b, `half` u either side (the widest thing the look draws), `pad` u past both ends. */
  set(a: THREE.Vector3, b: THREE.Vector3, half: number, pad = half): void {
    this.u.uA.value.copy(a); this.u.uB.value.copy(b); this.u.uHalf.value = half; this.u.uPad.value = pad;
    this.u.uLen.value = a.distanceTo(b);
  }

  dispose(): void { this.material.dispose(); }
}

const GROUND_VERT = /* glsl */ `
in vec2 aUv;
out float vAlong, vAcross;
void main() { vAlong = aUv.x; vAcross = aUv.y; gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }
`;
const GROUND_FRAG = (look: string) => /* glsl */ `
${HASH}
${NOISE}
${RAMPS}
uniform float uOpacity, uLen;
in float vAlong, vAcross;
out vec4 fxColor;
${look}
void main() { vec4 c = look(vAlong, vAcross, uLen); if (c.a <= 0.0 && c.r + c.g + c.b <= 0.0) discard; fxColor = c * uOpacity; }
`;

/** Rows of a ground strip at most: one every `step` u along it. */
const GROUND_ROWS = 80;

/**
 * The strip on the floor under a beam: from ground point (x0, z0) to (x1, z1) (three's x, z), `half` u either side and
 * `pad` past both ends, its vertices lifted to the floor (`heightAt`) every `step` u. The look gets along and across as
 * BeamStrip's does. One draw call; CPU work per frame is 3 × rows height reads (the kit caches them).
 */
export class GroundStrip {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  readonly u: Record<string, THREE.IUniform>;
  private pos = new Float32Array(GROUND_ROWS * 3 * 3);
  private uv = new Float32Array(GROUND_ROWS * 3 * 2);

  constructor(spec: StripSpec, public heightAt: HeightAt = () => 0, readonly step = 0.5, readonly lift = 0.03) {
    this.u = { uSeed: { value: 0 }, uOpacity: { value: 1 }, uLen: { value: 1 }, ...spec.uniforms };
    this.material = premulMaterial(new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: this.u, side: THREE.DoubleSide, vertexShader: GROUND_VERT, fragmentShader: GROUND_FRAG(spec.look) }));
    Object.assign(this.material, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aUv', new THREE.BufferAttribute(this.uv, 2).setUsage(THREE.DynamicDrawUsage));
    const idx: number[] = [];
    for (let r = 0; r < GROUND_ROWS - 1; r++) for (let c = 0; c < 2; c++) {
      const a = r * 3 + c, b = a + 1, d = a + 3, e = d + 1;
      idx.push(a, d, b, b, d, e);
    }
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = spec.order ?? -1;
  }

  set(x0: number, z0: number, x1: number, z1: number, half: number, pad = half): void {
    const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz) || 1e-4, ux = dx / len, uz = dz / len, nx = -uz, nz = ux;
    const rows = Math.min(GROUND_ROWS, Math.max(2, Math.ceil((len + 2 * pad) / this.step) + 1));
    for (let r = 0; r < rows; r++) {
      const along = -pad + (r / (rows - 1)) * (len + 2 * pad);
      for (let c = 0; c < 3; c++) {
        const across = (c - 1) * half, x = x0 + ux * along + nx * across, z = z0 + uz * along + nz * across, k = r * 3 + c;
        this.pos[k * 3] = x; this.pos[k * 3 + 1] = this.heightAt(x, z) + this.lift; this.pos[k * 3 + 2] = z;
        this.uv[k * 2] = along; this.uv[k * 2 + 1] = across;
      }
    }
    const g = this.mesh.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.aUv.needsUpdate = true;
    g.setDrawRange(0, (rows - 1) * 12);
    this.u.uLen.value = len;
  }

  dispose(): void { this.mesh.geometry.dispose(); this.material.dispose(); }
}
