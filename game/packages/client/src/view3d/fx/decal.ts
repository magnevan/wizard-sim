/**
 * Ground decals: a sheet of grid cells laid over the floor, each vertex lifted to the floor's height under it
 * (`heightAt`), so a fire floor or a scorch mark drapes over steps and terraces instead of floating flat. The family
 * colours it in a fragment function `vec4 decal(vec3 wp)` of the world point, as premultiplied linear RGBA (alpha
 * darkens what's under it, rgb adds light). Drawn with the effects, depth-tested and pulled toward the camera a little
 * so it never fights the floor.
 *
 * Cost: one draw call; (w / step) × (d / step) quads. The sheet covers a rectangle the family picks (a room, or the
 * box round what's burning) and is rebuilt only when that changes.
 */
import * as THREE from 'three';
import { HASH, NOISE, RAMPS } from './glsl';
import { premulMaterial } from './particles';

/** The floor's height (three's y, u) at a ground point (three's x, z). */
export type HeightAt = (x: number, z: number) => number;
export const flatFloor: HeightAt = () => 0;

export interface Rect { x0: number; z0: number; x1: number; z1: number }

export interface DecalSpec {
  /** GLSL: `vec4 decal(vec3 wp)`, with any uniforms it declares. */
  look: string;
  uniforms?: Record<string, THREE.IUniform>;
  /** Grid spacing, u (default 0.5: the sim's floor cell). */
  step?: number;
  /** Height over the floor, u (default 0.02). */
  lift?: number;
  order?: number;
}

const VERT = /* glsl */ `
out vec3 vWp;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWp = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }
`;
const FRAG = (look: string) => /* glsl */ `
${HASH}
${NOISE}
${RAMPS}
uniform float uOpacity;
in vec3 vWp;
out vec4 fxColor;
${look}
void main() { vec4 c = decal(vWp); if (c.a <= 0.0 && c.r + c.g + c.b <= 0.0) discard; fxColor = c * uOpacity; }
`;

export class GroundDecal {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  readonly u: Record<string, THREE.IUniform>;
  private rect: Rect | null = null;

  constructor(readonly spec: DecalSpec, public heightAt: HeightAt = flatFloor) {
    this.u = { uSeed: { value: 0 }, uOpacity: { value: 1 }, ...spec.uniforms };
    this.material = premulMaterial(new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: this.u, vertexShader: VERT, fragmentShader: FRAG(spec.look) }));
    Object.assign(this.material, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = spec.order ?? -1;
    this.mesh.visible = false;
  }

  /** Cover this rectangle (three's x, z; u), snapped out to the grid. Rebuilds the sheet only when it changes. */
  cover(r: Rect | null): void {
    if (!r) { this.mesh.visible = false; return; }
    const s = this.spec.step ?? 0.5, q: Rect = { x0: Math.floor(r.x0 / s) * s, z0: Math.floor(r.z0 / s) * s, x1: Math.ceil(r.x1 / s) * s, z1: Math.ceil(r.z1 / s) * s };
    this.mesh.visible = true;
    const o = this.rect;
    if (o && o.x0 === q.x0 && o.z0 === q.z0 && o.x1 === q.x1 && o.z1 === q.z1) return;
    this.rect = q;
    const nx = Math.max(1, Math.round((q.x1 - q.x0) / s)), nz = Math.max(1, Math.round((q.z1 - q.z0) / s)), lift = this.spec.lift ?? 0.02;
    const pos = new Float32Array((nx + 1) * (nz + 1) * 3), idx: number[] = [];
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const x = q.x0 + i * s, z = q.z0 + j * s, k = (j * (nx + 1) + i) * 3;
      pos[k] = x; pos[k + 1] = this.heightAt(x, z) + lift; pos[k + 2] = z;
    }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(idx);
    this.mesh.geometry.dispose();
    this.mesh.geometry = g;
  }

  dispose(): void { this.mesh.geometry.dispose(); this.material.dispose(); }
}
