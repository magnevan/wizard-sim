/**
 * GLSL shared by the effects kit's shaders (GLSL ES 3.0: three's ShaderMaterial with glslVersion GLSL3).
 *
 * - `HASH`: rnd(k, salt) in 0..1, a pure function of a particle's index k, a salt per property and the emitter's seed
 *   (uSeed), as art/util.ts rand() is for the pixel effects. Integer hashing, so it gives the same answer on every GPU.
 * - `NOISE`: smooth value noise in 2D and 3D, and fbm over it (for flame shapes, flicker, the floor's ember bed).
 * - `RAMPS`: the fire's heat ramp (art/spray-jet.ts HEAT, hottest to coolest, as linear colours) and the blue-white of
 *   four and five runes.
 */
export const HASH = /* glsl */ `
uniform float uSeed;
uint fxPcg(uint v) { uint s = v * 747796405u + 2891336453u; uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u; return (w >> 22u) ^ w; }
float rnd(float k, float salt) {
  uint h = fxPcg(uint(int(k)) ^ fxPcg(uint(int(salt)) + fxPcg(uint(int(uSeed)))));
  return float(h) / 4294967296.0;
}
`;

export const NOISE = /* glsl */ `
float fxH3(vec3 p) { uvec3 q = uvec3(ivec3(floor(p)) + 32768); return float(fxPcg(q.x ^ fxPcg(q.y ^ fxPcg(q.z)))) / 4294967296.0; }
float vnoise3(vec3 p) {
  vec3 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(fxH3(i), fxH3(i + vec3(1, 0, 0)), u.x), mix(fxH3(i + vec3(0, 1, 0)), fxH3(i + vec3(1, 1, 0)), u.x), u.y);
  float b = mix(mix(fxH3(i + vec3(0, 0, 1)), fxH3(i + vec3(1, 0, 1)), u.x), mix(fxH3(i + vec3(0, 1, 1)), fxH3(i + vec3(1, 1, 1)), u.x), u.y);
  return mix(a, b, u.z);
}
float fbm3(vec3 p) { return 0.55 * vnoise3(p) + 0.3 * vnoise3(p * 2.03 + 7.1) + 0.15 * vnoise3(p * 4.1 + 3.3); }
`;

export const RAMPS = /* glsl */ `
// heat 0 (white hot) .. 1 (dark red, going out): art/spray-jet.ts HEAT, in linear light; only the white-hot end is
// past 1, so after the tone map the body stays a saturated orange instead of washing to pale yellow
vec3 fireRamp(float h) {
  h = clamp(h, 0.0, 1.0);
  vec3 c0 = vec3(3.0, 2.6, 1.8), c1 = vec3(2.0, 1.3, 0.35), c2 = vec3(1.4, 0.55, 0.08), c3 = vec3(0.95, 0.22, 0.03), c4 = vec3(0.5, 0.07, 0.02), c5 = vec3(0.18, 0.03, 0.015);
  if (h < 0.2) return mix(c0, c1, h / 0.2);
  if (h < 0.4) return mix(c1, c2, (h - 0.2) / 0.2);
  if (h < 0.6) return mix(c2, c3, (h - 0.4) / 0.2);
  if (h < 0.8) return mix(c3, c4, (h - 0.6) / 0.2);
  return mix(c4, c5, (h - 0.8) / 0.2);
}
// the blue-white a flame is born with from four runes (art/spray-jet.ts BLUE)
vec3 blueFlame(float k) { return mix(vec3(4.2, 4.4, 5.0), vec3(1.6, 2.4, 4.6), clamp(k, 0.0, 1.0)); }
`;
