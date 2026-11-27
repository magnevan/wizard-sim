/**
 * Smoke from a flue (2026-11-27, the battery's smokestack seen from the infirmary's road: "the battery's smoke ahead",
 * principle 19): a soft plume of billows rising slowly and leaning away on the scene's light wind (the plants' wind,
 * lab/foliage.ts FWIND), stylised for the painted look: each billow a lumpy round puff lit in three soft tones (a warm
 * lit cap, a grey middle, a cool blue-grey underside), never noise. A set piece names its flue in kit.json
 * (`smoke`: {at, z, ...}) and kit-render puts an emitter there.
 *
 * Cheap: one mesh of a dozen or so camera-facing quads (one draw call), every puff's path worked out in the vertex
 * stage from the time alone (FOLIAGE_TIME, which spinKit advances), so it loops forever with nothing to update.
 * Units: metres in the spec; the mesh is built in u (kit-render's M).
 */
import * as THREE from 'three';
import { FOLIAGE_TIME } from './foliage';

/** kit.json's `smoke` on a set piece: the flue's mouth (at: [x, y] m in the piece's frame, z m above its foot), its width, and the plume. */
export type SmokeSpec = {
  at?: [number, number]; z: number;
  /** the flue's radius (m): the first puffs' size */
  r?: number;
  /** puffs in the plume, the seconds each lives, how far it rises (m) and drifts downwind (m), its size at the end (m across) */
  puffs?: number; life?: number; rise?: number; drift?: number; grow?: number;
  /** tones: the lit cap and the shade (#rrggbb) */
  lit?: string; shade?: string;
};

const VERT = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  uniform float uTime, uLife, uRise, uDrift, uR0, uR1;
  attribute vec2 aCorner;   // the quad's corner (-1..1)
  attribute vec4 aP;        // phase 0..1, seed, lumps' turn, size jitter
  varying vec2 vQ; varying vec4 vP; varying float vA; varying float vAge;
  const vec2 WIND = vec2(0.93, 0.37);
  void main() {
    float age = fract(uTime / uLife + aP.x);
    // rising fast out of the flue and slowing, leaning more and more downwind; a slow sway on top
    float up = uRise * (1.0 - pow(1.0 - age, 1.8));
    float down = uDrift * age * age;
    vec3 c = position + vec3(WIND.x * down, up, WIND.y * down);
    c.x += sin(uTime * 0.37 + aP.y * 6.28) * 0.35 * age * uR1;
    c.z += cos(uTime * 0.29 + aP.y * 4.1) * 0.35 * age * uR1;
    float size = mix(uR0, uR1, pow(age, 0.7)) * aP.w;
    vec4 mv = modelViewMatrix * vec4(c, 1.0);
    // swelling in over the first moments, thinning away at the end
    vA = smoothstep(0.0, 0.08, age) * (1.0 - smoothstep(0.55, 1.0, age));
    mv.xy += aCorner * size;
    gl_Position = projectionMatrix * mv;
    vQ = aCorner; vP = aP; vAge = age;
    vec4 mvPosition = mv;
    #include <fog_vertex>
  }`;

const FRAG = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>
  uniform vec3 uLit, uMid, uShade;
  varying vec2 vQ; varying vec4 vP; varying float vA; varying float vAge;
  void main() {
    // a billow: a body and three lumps as one soft field (a sum of round falloffs, so they melt together), and its slope
    vec2 q = vQ, g = vec2(0.0);
    float f = 0.0;
    for (int i = 0; i < 4; i++) {
      float a = vP.z + float(i) * 2.2, r = i == 0 ? 0.62 : 0.4 + 0.08 * sin(vP.y * 9.0 + float(i) * 3.0);
      vec2 c = i == 0 ? vec2(0.0, -0.1) : vec2(cos(a), sin(a) * 0.75 + 0.15) * 0.4;
      vec2 d = q - c;
      float e = exp(-dot(d, d) / (r * r) * 2.2);
      f += e; g += -4.4 / (r * r) * d * e;
    }
    float a = smoothstep(0.42, 0.62, f);
    if (a <= 0.003) discard;
    // its light: a dome over the field (bright toward the sun, the upper left on screen), in three soft bands
    // (mostly the whole puff's dome, a little of each lump's, so the lumps show as soft swells, not holes)
    vec3 n = normalize(vec3(q * 0.9 - g * 0.06, 1.0));
    float lit = clamp(0.45 + 0.6 * dot(n, normalize(vec3(-0.55, 0.7, 0.45))) + 0.12 * (f - 1.0), 0.0, 1.0);
    float b1 = smoothstep(0.34, 0.46, lit), b2 = smoothstep(0.62, 0.74, lit);
    vec3 col = mix(mix(uShade, uMid, b1), uLit, b2);
    col = mix(col, uMid, vAge * 0.3);   // the old smoke greys and flattens
    a *= vA * mix(0.95, 0.6, vAge);
    gl_FragColor = vec4(col, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }`;

/** The plume as one mesh, its flue's mouth at the origin, in u (`M`: u per metre). */
export function smokeMesh(o: SmokeSpec, M: number, seed = 1): THREE.Mesh {
  const n = o.puffs ?? 14, P: number[] = [], C: number[] = [], A: number[] = [], I: number[] = [];
  let s = (seed * 2654435761) >>> 0 || 1;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < n; i++) {
    const p = [i / n, rnd(), rnd() * 6.28, 0.85 + rnd() * 0.3], b = i * 4;
    for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { P.push(0, 0, 0); C.push(x, y); A.push(...p); }
    I.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  // (drawn in a fixed order: the puffs are near enough in tone that which lies over which hardly shows)
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('aCorner', new THREE.Float32BufferAttribute(C, 2));
  geo.setAttribute('aP', new THREE.Float32BufferAttribute(A, 4));
  geo.setIndex(I);
  const rise = (o.rise ?? 9) * M, drift = (o.drift ?? 8) * M, r1 = ((o.grow ?? 5.5) / 2) * M;
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(drift * 0.5, rise * 0.5, drift * 0.2), Math.max(rise, drift) + r1);
  const lit = new THREE.Color(o.lit ?? '#fbf3e4'), shade = new THREE.Color(o.shade ?? '#7c8298');
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...THREE.UniformsUtils.merge([THREE.UniformsLib.fog]), uTime: FOLIAGE_TIME, uLife: { value: o.life ?? 16 }, uRise: { value: rise }, uDrift: { value: drift },
      uR0: { value: (o.r ?? 0.8) * M }, uR1: { value: r1 }, uLit: { value: lit }, uMid: { value: lit.clone().lerp(shade, 0.45) }, uShade: { value: shade } },
    vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, fog: true,
  });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 3;
  m.raycast = () => undefined;
  m.userData.noFade = true;
  return m;
}
