/**
 * The Fire spray's body as one volume (the standard stylised-VFX way: a mesh with a scrolling-noise toon shader, not a
 * pile of sprites; the user on the sprite build: "a very obvious cluster of opaque sprites, not at all similar to the
 * concept", docs/reference/spell-concepts/fire/toon-spray-2.jpg).
 *
 * The mesh is a closed tube from the staff's tip to where the sim's channel stops: a grid of (along, around) whose every
 * vertex is placed in the vertex shader. Along its length it widens with the sim's cone (fanW), flattened over the
 * floor, narrow at the staff and swelling toward a rounded head; each ring follows the aim the flame at that distance
 * left the staff with (aimAt(ago), ago growing along the length), so a sweep bends it like a hose. Noise flowing
 * outward pushes the surface in and out, and lifts the top toward the far end (heat rises), so the outline billows and
 * licks instead of being a smooth cone.
 *
 * The fragment shader scrolls two layers of value noise outward along the length and cuts toon bands from them and
 * from the view angle: white-hot along the middle near the staff, then yellow, orange, and deep red where the surface
 * turns away from the camera (the rim). Where the noise is low and the surface grazing, or past the head, it erodes
 * away, so flame tongues break the silhouette; the edges are translucent, the middle covering. Two shells: a slightly
 * bigger, more eroded deep-red one first (the outline that keeps the fire off the warm stone), then the flame.
 *
 * Stateless: a pure function of the uniforms (the channel's time and end, runes, aim trail, seed), so frozen frames and
 * rollback draw it exactly.
 */
import * as THREE from 'three';
import { FIRE_TEX } from './fire-sheets';
import { HASH, NOISE } from './glsl';
import { premulMaterial } from './particles';
import { FX_U } from './stage';

/**
 * The tubes the body is made of, overlapping into one mass: a broad middle one and narrower ones fanning out to the
 * cone's sides, a little shorter (the painting's swelling "heart" with tongues at its sides, where one wide tube read
 * as a paper fan): [angle off the middle (of the half-angle), width (of the fan's half-width), length, noise phase].
 */
const LOBES: [number, number, number, number][] = [[0, 0.55, 1.06, 0], [-0.4, 0.36, 0.98, 3.1], [0.42, 0.36, 1.02, 5.3], [-0.64, 0.24, 0.9, 7.7], [0.66, 0.24, 0.94, 9.9]];

/** Rings along the tube and points round each ring. */
const NU = 56, NV = 40;

/** How long (s) flame takes to reach the far end; also how far back in the aim trail the far end looks. */
export const BODY_TRAVEL = 0.4;

const VERT = (head: string) => /* glsl */ `
${HASH}
${NOISE}
${head}
uniform float uTime, uEnd, uShell, uGrow;
uniform vec4 uLobe;   // angle off the middle (of the half-angle, reached by mid-way), width (of the fan's half-width), length, noise phase
out vec3 vWp; out vec3 vN; out vec2 vG; out float vS; out float vUp;
void main() {
  // the stretch of the stream that exists now: its head runs out over BODY_TRAVEL; after the channel stops its tail
  // leaves the staff and follows the head out
  float head = uEnd > 1e8 ? clamp(uTime / ${BODY_TRAVEL.toFixed(3)}, 0.0, 1.0) : 1.0;
  float tail = clamp(max(uTime - uEnd, 0.0) / 0.45, 0.0, 1.0) * 0.8;
  float g = position.x, th = position.y * 6.2831853;
  float s = mix(tail, head * uLobe.z, g);
  vec4 A = aimAt(s * ${BODY_TRAVEL.toFixed(3)});
  float off = uLobe.x * uHalf * smoothstep(0.0, 0.6, s), ang = A.z + off; vec2 d = vec2(cos(ang), sin(ang)), nn = vec2(-d.y, d.x);
  vec3 side = vec3(nn.x, 0.0, nn.y);
  float W = fanW(A, s);
  // narrow at the staff, opening to the cone, a swell before the head, rounded at both ends
  float caps = sqrt(max(0.0, 1.0 - pow(smoothstep(0.78, 1.0, g), 2.0))) * mix(0.25, 1.0, smoothstep(0.0, 0.1, g));
  float prof = mix(0.2, 0.8, smoothstep(0.0, 0.5, s)) * caps;
  float rw = (0.05 + W * prof * uLobe.y) * uShell, rh = (0.07 + W * prof * 0.38 * sqrt(uLobe.y) + 0.12 * s) * uShell;
  // billows: noise flowing outward pushes the surface in and out, more toward the far end
  float c = cos(th), sn = sin(th);
  float n = fbm3(vec3(s * 3.5 - uTime * 2.2, c * 2.2 + 3.0 + uLobe.w, sn * 2.2 + uSeed * 0.37));
  float bill = 1.0 + (n - 0.5) * mix(0.6, 0.9, s);
  // heat rises: the axis lifts toward the far end, and the top bulges up more than the bottom
  float up = max(sn, 0.0);
  // tongues lick up off the top: a finer noise, strongest at the far end
  float n3 = fbm3(vec3(s * 6.0 - uTime * 3.0, c * 5.0 + uLobe.w, sn * 5.0 + 17.0));
  float lift = s * s * 0.15 * uGrow + up * up * max(n3 - 0.38, 0.0) * 1.0 * s * s;
  // from the staff's tip down to resting on the floor by mid-way, so the flame stands over the sim's cone, not above it
  vec3 ctr = sprayAt(A, s, off, 0.0, mix(uNoz.y, rh * 0.75, smoothstep(0.0, 0.55, s)) + lift);
  vec3 wp = ctr + side * c * rw * bill + vec3(0.0, 1.0, 0.0) * sn * rh * bill;
  vWp = wp; vN = normalize(side * c / max(rw, 1e-3) + vec3(0.0, sn / max(rh, 1e-3), 0.0)); vG = vec2(g, position.y); vS = s; vUp = up;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

const FRAG = /* glsl */ `
#include <packing>
${HASH}
${NOISE}
uniform sampler2D uDepth; uniform vec2 uRes; uniform float uNear, uFar;
uniform float uTime, uEnd, uHot, uRim, uOn, uHasFlow;
uniform vec4 uLobe;
uniform sampler2D uFlow;
in vec3 vWp; in vec3 vN; in vec2 vG; in float vS; in float vUp;
out vec4 fxColor;
void main() {
  vec3 V = normalize(cameraPosition - vWp), N = normalize(vN);
  float ndv = dot(N, V);
  if (ndv < 0.0) discard;   // the far side of the tube: only the surface facing the camera is drawn
  float fres = 1.0 - ndv;
  // two layers of noise flowing outward along the stream (and a little upward), stretched along it: flame grain
  float th = vG.y * 6.2831853;
  // finer round the tube than along it, so the grain streaks outward like tongues
  vec3 q = vec3(vS * 2.2 - uTime * 2.4, cos(th) * 2.6 + uLobe.w, sin(th) * 2.6 + uSeed * 0.1);
  float n1 = fbm3(q), n2 = fbm3(vec3(vS * 5.0 - uTime * 4.5, cos(th) * 6.0 + 11.0 + uLobe.w, sin(th) * 6.0 - uTime * 0.8));
  float n = n1 * 0.62 + n2 * 0.38;
  // the painted flame (fire-flow.png): tongues streaming outward along the tube, scrolled faster than the noise and bent
  // by it (the study's method: a painted texture that pans, bends and erodes on a mesh)
  vec2 fuv = vec2(vG.y * 3.0 + uLobe.w * 0.13 + (n1 - 0.5) * 0.22, vS * 1.7 - uTime * 2.8 + (n2 - 0.5) * 0.12);
  vec3 tex = uHasFlow > 0.5 ? texture(uFlow, fuv).rgb : vec3(n);
  float tl = max(tex.r, max(tex.g, tex.b));
  // erosion: grazing surfaces, the far end and the tail eat away first where the painting is dark (the gaps between its
  // tongues), so the body breaks into tongues rather than a smooth edge
  float er = pow(fres, 1.6) * 0.85 + smoothstep(0.5, 1.0, vG.x) * 0.7 + (1.0 - smoothstep(0.0, 0.08, vG.x)) * 0.4 - uRim * 0.06;
  float since = (uTime - vS * ${BODY_TRAVEL.toFixed(3)}) - uEnd;
  er += clamp(since / 0.25, 0.0, 1.0) * 1.3 + smoothstep(0.82, 1.06, vS) * 0.9;
  float a = smoothstep(er - 0.03, er + 0.03, n * 0.45 + tl * 0.55 + 0.2);
  float hole = fbm3(vec3(vWp.x * 1.25 + uTime * 0.9, vWp.z * 1.25 - uTime * 0.6, uTime * 1.4 + 2.0));
  a *= smoothstep(0.4, 0.5, hole + 0.3 * (1.0 - smoothstep(0.25, 0.75, vS)));
  if (a <= 0.0) discard;
  float scene = -perspectiveDepthToViewZ(texture(uDepth, gl_FragCoord.xy / uRes).r, uNear, uFar);
  float vz = (viewMatrix * vec4(vWp, 1.0)).z;
  float soft = clamp((scene + vz) / 0.5, 0.0, 1.0);
  vec4 o;
  if (uRim > 0.5) {
    // the outline: deep red, a little darker where it turns away
    vec3 c = mix(vec3(0.5, 0.06, 0.015), vec3(0.28, 0.03, 0.01), fres);
    o = vec4(c, 1.0) * a * 0.92;
  } else {
    // heat 0 white-hot .. 1 deep red: hot along the middle and near the staff, cooler where the surface turns away,
    // toward the far end and on top (cooling as it lifts); the noise breaks the bands into tongues
    float h = 0.06 + vS * 0.5 + fres * 0.6 + vUp * 0.12 * vS + (0.5 - n) * 0.95 - uHot;
    vec3 white = vec3(2.6, 2.3, 1.6), yellow = vec3(2.0, 1.05, 0.12), orange = vec3(1.25, 0.3, 0.03), red = vec3(0.6, 0.07, 0.015);
    float e = 0.02;
    vec3 c = mix(white, yellow, smoothstep(0.16 - e, 0.16 + e, h));
    c = mix(c, orange, smoothstep(0.5 - e, 0.5 + e, h));
    c = mix(c, red, smoothstep(0.74 - e, 0.74 + e, h));
    // soft toon shading: a little darker on the lower flank, so it reads as a volume
    c *= mix(0.78, 1.08, smoothstep(-0.4, 0.6, N.y));
    // the painting carries the colour (lifted into HDR so the tone map keeps it saturated), cooling toward the far end
    vec3 painted = tex * vec3(2.4, 1.2, 0.55) * mix(vec3(1.0), vec3(0.8, 0.42, 0.3), smoothstep(0.45, 1.0, h));
    c = mix(c, painted, 0.55 * uHasFlow);
    // covering in the middle, translucent toward the edges and in the painting's dark gaps (layers show through)
    float cover = mix(0.78, 0.2, smoothstep(0.3, 0.95, fres)) * mix(0.35, 1.0, smoothstep(0.12, 0.55, tl));
    o = vec4(c * cover, cover) * a;
  }
  fxColor = o * soft * uOn;
}
`;

/** The tube's grid: x runs 0..1 along it, y 0..1 round it (the vertex shader places every point). */
function tubeGrid(): THREE.BufferGeometry {
  const pos = new Float32Array((NU + 1) * (NV + 1) * 3), idx: number[] = [];
  for (let i = 0; i <= NU; i++) for (let j = 0; j <= NV; j++) { const k = (i * (NV + 1) + j) * 3; pos[k] = i / NU; pos[k + 1] = j / NV; }
  for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) {
    const a = i * (NV + 1) + j, b = a + 1, c = a + NV + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

/**
 * The body's lobes, each in two shells, sharing the spray's uniforms (`shared`: uTime, uEnd, uHalf, uHot, uNoz, uAim...). `head` is
 * the spray's GLSL head (aimAt, sprayAt, axisH, fanW). Add `.group` to the spray's group.
 */
export class FireBody {
  readonly group = new THREE.Group();
  private mats: THREE.ShaderMaterial[] = [];
  private geo = tubeGrid();
  /** 0..1: how far the body has swelled (over the channel's first second). */
  readonly uGrow = { value: 1 };
  readonly uOn = { value: 1 };

  constructor(head: string, shared: Record<string, THREE.IUniform>, seed: number) {
    const shell = (lobe: THREE.Vector4, scale: number, rim: boolean, order: number) => {
      const m = premulMaterial(new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3, side: THREE.DoubleSide,
        uniforms: { ...FX_U, ...shared, uSeed: { value: seed }, uShell: { value: scale }, uLobe: { value: lobe }, uRim: { value: rim ? 1 : 0 }, uGrow: this.uGrow, uOn: this.uOn, uFlow: { value: FIRE_TEX.flow }, uHasFlow: { value: FIRE_TEX.flow ? 1 : 0 } },
        vertexShader: VERT(head), fragmentShader: FRAG,
      }));
      const mesh = new THREE.Mesh(this.geo, m);
      mesh.frustumCulled = false; mesh.renderOrder = order;
      this.mats.push(m); this.group.add(mesh);
    };
    // every lobe's outline first, then every lobe's flame, so the outlines show only round the whole mass
    for (const rim of [false]) for (const l of LOBES) shell(new THREE.Vector4(...l), rim ? 1.16 : 1, rim, rim ? 1 : 3);
  }

  dispose(): void { this.geo.dispose(); for (const m of this.mats) m.dispose(); }
}
