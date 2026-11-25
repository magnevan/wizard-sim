/**
 * Low-poly rocks for the Earth family's effects: a seeded boulder mesh (an icosahedron pushed about and chiselled flat
 * by a few cutting planes, so it has big hewn facets rather than a smooth lump) and the toon stone material they share.
 * The kit has no rock-in-flight piece, and its scenery stones are paving and walls, so the rock is grown here from a
 * seed: the same seed gives the same rock on every machine.
 *
 * The material is three's toon shading (three hard light steps) lit by the scene like the court, with a darker rim
 * where a facet turns away from the camera: the concept's dark outline, which is what makes a brown rock read on the
 * court's pale warm stone. A dark underside comes from the light itself.
 */
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

/** A small deterministic PRNG (mulberry32) for building meshes. */
function prng(seed: number): () => number {
  let a = (seed * 2654435761) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The rock's stone colours (linear after three's sRGB conversion): grey-brown, and a few lighter, a few darker facets. */
const STONE = { base: new THREE.Color('#7a634d'), light: new THREE.Color('#9a8064'), dark: new THREE.Color('#544232') };

/**
 * A boulder of radius about 1, flat-shaded, with a colour per facet. `detail` 1 (80 faces) for the missile, 0 (20) for
 * shards; `squash` stretches it (x, y, z); `cuts` chisels that many flat faces off it.
 */
export function rockGeometry(seed: number, detail = 1, squash: [number, number, number] = [1, 0.85, 0.95], cuts = 4): THREE.BufferGeometry {
  const rnd = prng(seed);
  const ico = new THREE.IcosahedronGeometry(1, detail);
  ico.deleteAttribute('normal'); ico.deleteAttribute('uv');
  const g = mergeVertices(ico);
  const p = g.getAttribute('position') as THREE.BufferAttribute, v = new THREE.Vector3();
  const planes = Array.from({ length: cuts }, () => {
    const n = new THREE.Vector3(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1).normalize();
    return { n, d: 0.62 + rnd() * 0.22 };
  });
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).multiplyScalar(0.88 + rnd() * 0.24);
    for (const c of planes) { const k = v.dot(c.n); if (k > c.d) v.addScaledVector(c.n, c.d - k); }
    v.set(v.x * squash[0], v.y * squash[1], v.z * squash[2]);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  const flat = g.toNonIndexed();
  flat.computeVertexNormals();
  const n = flat.getAttribute('position').count, col = new Float32Array(n * 3), c = new THREE.Color();
  for (let f = 0; f < n / 3; f++) {
    const r = rnd();
    c.copy(STONE.base).lerp(r < 0.25 ? STONE.light : r > 0.8 ? STONE.dark : STONE.base, 0.6).multiplyScalar(0.92 + rnd() * 0.16);
    for (let k = 0; k < 3; k++) c.toArray(col, (f * 3 + k) * 3);
  }
  flat.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.dispose(); ico.dispose();
  return flat;
}

let GRADIENT: THREE.DataTexture | null = null;
/** Three light steps (shadow, mid, lit), nearest-filtered: three's toon ramp. */
function gradient(): THREE.DataTexture {
  if (GRADIENT) return GRADIENT;
  const d = new Uint8Array([70, 70, 70, 255, 150, 150, 150, 255, 255, 255, 255, 255]);
  GRADIENT = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat);
  GRADIENT.minFilter = GRADIENT.magFilter = THREE.NearestFilter;
  GRADIENT.generateMipmaps = false; GRADIENT.needsUpdate = true;
  return GRADIENT;
}

/**
 * The toon stone: per-facet colours, three light steps, and a dark rim where a facet faces away from the camera
 * (`rim`: how dark, 0..1). `tint` multiplies the stone (a coat's colour later: a meteor's char, a frost comet's ice).
 */
export function stoneMaterial(rim = 0.6, tint: THREE.ColorRepresentation = 0xffffff): THREE.MeshToonMaterial {
  const m = new THREE.MeshToonMaterial({ color: tint, vertexColors: true, gradientMap: gradient() });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uRim = { value: rim };
    sh.fragmentShader = sh.fragmentShader
      .replace('void main() {', 'uniform float uRim;\nvoid main() {')
      .replace('#include <opaque_fragment>', /* glsl */ `
  float facing = abs(dot(normalize(normal), normalize(vViewPosition)));
  outgoingLight *= mix(1.0, 1.0 - uRim, smoothstep(0.42, 0.18, facing));
  #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => `stone-rim-${rim}`;
  return m;
}
