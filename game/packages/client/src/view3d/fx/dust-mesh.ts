/**
 * Dust as eroded meshes (the Earth family): a dust body is one smooth mesh (a tube along a rock's flight, a ring rolling
 * out from an impact, a blob thrown up) eaten away by 3D noise fixed in the world, so its edge is ragged and it thins
 * into wisps as it ages, instead of a cloud built from stacked sprites (the user, on the built fire: "a very obvious
 * cluster of opaque sprites"). There is no repeated shape to spot: the silhouette is the noise's.
 *
 * Shading is toon: the mesh's normal against the sun in three ochre steps, a darker band where the noise cuts the
 * edge, darker than the court's floor (the tone doc: on that floor only darker dust reads). Drawn with the effects:
 * premultiplied, depth-tested, softened where it meets the floor or a body (the scene's depth, as particles.ts).
 *
 * A shape is a vertex function: `void shape(vec2 q, out vec3 wp, out vec3 nrm, out float age)` from the mesh's
 * parameter q (0..1 × 0..1), giving the world point, its normal and its age 0..1 (1: gone). Its uniforms are its own.
 * Everything is a function of the uniforms (time, where, size), so frozen moments and rollback draw the same.
 */
import * as THREE from 'three';
import { HASH, NOISE } from './glsl';
import { premulMaterial } from './particles';
import { FX_U } from './stage';

/** The kit's sun direction (lab/kit-render.ts setupStage: from (-30, 40, 22) toward the look point). */
const SUN = new THREE.Vector3(-30, 40, 22).normalize();

const VERT = (shape: string) => /* glsl */ `
${HASH}
${NOISE}
in vec2 aQ;
out vec3 vWp; out vec3 vN; out float vAge; out float vViewZ; out vec3 vView;
${shape}
void main() {
  vec3 wp, nrm; float age;
  shape(aQ, wp, nrm, age);
  vWp = wp; vN = nrm; vAge = age;
  vec4 mv = viewMatrix * vec4(wp, 1.0);
  vViewZ = mv.z; vView = cameraPosition - wp;
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
#include <packing>
${HASH}
${NOISE}
uniform sampler2D uDepth; uniform vec2 uRes; uniform float uNear, uFar, uSoft, uOpacity;
uniform vec3 uLit, uMid, uShade, uSun; uniform float uFreq, uClock, uSalt, uBody;
in vec3 vWp; in vec3 vN; in float vAge; in float vViewZ; in vec3 vView;
out vec4 fxColor;
float dens(vec3 p) { return 0.7 * fbm3(p) + 0.3 * vnoise3(p * 2.9 + 5.0); }
void main() {
  if (vAge >= 1.0) discard;
  vec3 N = normalize(vN), V = normalize(vView);
  vec3 p = vWp * uFreq + vec3(uSalt, uClock * 0.35, uSalt * 0.7);
  float d = dens(p);
  // erosion: the cut climbs with age, and toward the silhouette, so the outline is the noise's and the body thins to wisps
  float rim = 1.0 - abs(dot(N, V));
  float cut = mix(0.2, 0.74, vAge) + rim * rim * 0.32 - uBody;
  // soft at the edge, denser inside: translucent layers where it thins, a body where it's thick
  float a = smoothstep(cut, cut + 0.22, d) * 0.88;
  if (a <= 0.004) discard;
  // the noise's lobes bend the normal, so the toon light breaks into billows: lit tops, shaded folds
  float e = 0.06;
  vec3 g = vec3(dens(p + vec3(e, 0, 0)), dens(p + vec3(0, e, 0)), dens(p + vec3(0, 0, e))) - d;
  vec3 Nb = normalize(N - g / e * 0.3);
  // seen from the game camera nearly every visible face looks at the sun, so the light alone is flat: the lobes carry
  // it (how deep inside the body this point is), the sun only tilts it
  float lobe = d - cut;
  float l = (dot(Nb, uSun) - 0.55) * 1.6 + lobe * 2.6;
  // soft toon bands (dust is soft: hard steps read as mud), lobes' tops lit, folds shaded
  vec3 c = mix(uShade, uMid, smoothstep(0.25, 0.5, l));
  c = mix(c, uLit, smoothstep(0.85, 1.05, l));
  // the family's darker rim, soft: the silhouette goes toward the shade
  c = mix(c, uShade, smoothstep(0.6, 0.85, rim) * 0.7);
  float scene = -perspectiveDepthToViewZ(texture(uDepth, gl_FragCoord.xy / uRes).r, uNear, uFar);
  a *= clamp((scene + vViewZ) / uSoft, 0.0, 1.0) * uOpacity;
  fxColor = vec4(c * a, a);
}`;

/** Linear colours of the dust's three toon steps: ochre-brown, darker than the court's pale floor. `dark` 0..1 deepens them (the impact's thrown dust). */
export function dustTones(dark = 0): { lit: THREE.Color; mid: THREE.Color; shade: THREE.Color } {
  const k = (1 - 0.45 * dark) * 0.8;
  return { lit: new THREE.Color(0.25 * k, 0.15 * k, 0.065 * k), mid: new THREE.Color(0.12 * k, 0.066 * k, 0.028 * k), shade: new THREE.Color(0.05 * k, 0.027 * k, 0.012 * k) };
}

/** A grid of mesh parameters (q: 0..1 × 0..1), `nu` × `nv` quads, as the `aQ` attribute. */
export function paramGrid(nu: number, nv: number): THREE.BufferGeometry {
  const q = new Float32Array((nu + 1) * (nv + 1) * 2), idx: number[] = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { const k = (j * (nu + 1) + i) * 2; q[k] = i / nu; q[k + 1] = j / nv; }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('aQ', new THREE.BufferAttribute(q, 2));
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((nu + 1) * (nv + 1) * 3), 3));
  g.setIndex(idx);
  return g;
}

/** One eroded dust mesh: a shape (see the file's docblock) on a parameter grid, with its uniforms. */
export class DustMesh {
  readonly mesh: THREE.Mesh;
  readonly u: Record<string, THREE.IUniform>;

  constructor(shape: string, geometry: THREE.BufferGeometry, uniforms: Record<string, THREE.IUniform>, o: { dark?: number; freq?: number; body?: number; soft?: number; order?: number; side?: THREE.Side } = {}) {
    const t = dustTones(o.dark ?? 0);
    this.u = {
      uSeed: { value: 0 }, uOpacity: { value: 1 }, uSoft: { value: o.soft ?? 0.45 }, ...FX_U,
      uLit: { value: t.lit }, uMid: { value: t.mid }, uShade: { value: t.shade }, uSun: { value: SUN },
      uFreq: { value: o.freq ?? 1.6 }, uClock: { value: 0 }, uSalt: { value: 0 }, uBody: { value: o.body ?? 0 }, ...uniforms,
    };
    const m = premulMaterial(new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: this.u, vertexShader: VERT(shape), fragmentShader: FRAG, side: o.side ?? THREE.FrontSide }));
    this.mesh = new THREE.Mesh(geometry, m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = o.order ?? 1;
    this.mesh.visible = false;
  }

  dispose(): void { (this.mesh.material as THREE.Material).dispose(); }
}
