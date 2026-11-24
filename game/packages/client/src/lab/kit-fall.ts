/**
 * A waterfall for the kit renderer (kit-render.ts): the compiler's `fall.curtain`, wherever water meets lower water
 * across an edge. Built to size from the lip's line and the two water heights, all in code like the water it joins
 * (kit-water.ts), in the look the user chose (2026-11-24, concept A, docs/reference/waterfall/falls-a-ribbon.jpg):
 * - the curtain: one smooth ribbon that leaves the upper water level, bends over the lip on a quarter round and drops
 *   straight to the lower water, in the water's turquoise with long crisp white streaks that run down it, a white
 *   crest that breaks into drips, ragged sides, and foam climbing a little way up its foot;
 * - the foot: chunky white puffs that swell and bob where it lands, and small drops hopping out of them;
 * - the wash: foam on the lower water round the foot, solid at the curtain and breaking up outward, with rings rolling away.
 * Any width, any height, any line (straight, cornered or curved): nothing here is fitted to one place.
 */
import * as THREE from 'three';
import { WATER } from './kit-water';

/** How a fall is shaped (u): how far it springs out from the lip, how far the wash reaches, how fast it falls (u a second). */
export const FALL = { spring: 0.9, back: 0.7, wash: 5, speed: 6 };

const NOISE = /* glsl */ `
  float fHash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 45758.5453); }
  float fNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
    return mix(mix(fHash(i), fHash(i + vec2(1, 0)), u.x), mix(fHash(i + vec2(0, 1)), fHash(i + vec2(1, 1)), u.x), u.y);
  }`;

/** A small seeded generator (mulberry32), so a fall's puffs are the same every build. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** The lip's points with, at each, the way out over the lower water (unit, mitred at corners) and the distance along. */
function lipFrame(pts: number[][]) {
  const n = pts.length, segN: number[][] = [];
  for (let i = 0; i + 1 < n; i++) {
    const dx = pts[i + 1][0] - pts[i][0], dy = pts[i + 1][1] - pts[i][1], L = Math.hypot(dx, dy) || 1;
    segN.push([-dy / L, dx / L]);          // the compiler's edges keep the lower side here
  }
  let s = 0;
  return pts.map(([x, y], i) => {
    if (i > 0) s += Math.hypot(x - pts[i - 1][0], y - pts[i - 1][1]);
    const a = segN[Math.max(0, i - 1)], b = segN[Math.min(segN.length - 1, i)];
    let nx = a[0] + b[0], ny = a[1] + b[1]; const L = Math.hypot(nx, ny) || 1; nx /= L; ny /= L;
    const k = 1 / Math.max(0.5, nx * a[0] + ny * a[1]);      // the mitre: keep the curtain's distance from both faces
    return { x, y, nx: nx * k, ny: ny * k, s };
  });
}

/** Finer points along the lip, so the ragged sides and the streaks have vertices to bend on (about every 0.5 u). */
function refine(pts: number[][]): number[][] {
  const out: number[][] = [pts[0]];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1], k = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / 0.5));
    for (let j = 1; j <= k; j++) out.push([ax + ((bx - ax) * j) / k, ay + ((by - ay) * j) / k]);
  }
  return out;
}

/**
 * The fall over the lip `pts` (world u: x, and the map's y as z; the lower water on the right going along), from the
 * upper water at `top` to the lower at `bottom` (world y). `time` is the renderer's clock (seconds).
 */
export function fallMesh(pts: number[][], top: number, bottom: number, time: { value: number }): THREE.Group {
  const g = new THREE.Group();
  const drop = top - bottom;
  if (pts.length < 2 || drop <= 0.05) return g;
  const fr = lipFrame(refine(pts)), len = fr[fr.length - 1].s;
  const R = Math.min(FALL.spring, drop * 0.45);
  const col = (c: number) => new THREE.Color(c);
  const colours = { fShallow: { value: col(WATER.shallow) }, fDeep: { value: col(WATER.deep) }, fLine: { value: col(WATER.lines) }, fFoam: { value: col(WATER.foam) } };

  // ---- the curtain: a profile (out from the lip, height) swept along the lip; uv = (u along the lip, u down the profile) ----
  const prof: number[][] = [[-FALL.back, top + 0.05], [0, top + 0.05]];
  for (let k = 1; k <= 6; k++) { const a = (k / 6) * Math.PI / 2; prof.push([R * Math.sin(a), top + 0.05 - R * (1 - Math.cos(a))]); }
  const rows = Math.max(2, Math.ceil((drop - R) / 1.0));
  for (let k = 1; k <= rows; k++) prof.push([R, top + 0.05 - R - ((drop - R + 0.15) * k) / rows]);
  const pv: number[] = [0];
  for (let k = 1; k < prof.length; k++) pv.push(pv[k - 1] + Math.hypot(prof[k][0] - prof[k - 1][0], prof[k][1] - prof[k - 1][1]));
  const total = pv[pv.length - 1], crest = pv[1 + 6];      // the profile's length, and where the bend ends
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (const f of fr) prof.forEach(([o, y], k) => { pos.push(f.x + f.nx * o, y, f.y + f.ny * o); uv.push(f.s, pv[k]); });
  const P = prof.length;
  for (let i = 0; i + 1 < fr.length; i++) for (let k = 0; k + 1 < P; k++) {
    const a = i * P + k, b = a + P;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx); geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, colours, { fTime: time, fDim: { value: new THREE.Vector4(len, total, crest, FALL.speed) } });
    const decl = '\nuniform float fTime;\nuniform vec4 fDim;\nuniform vec3 fShallow, fDeep, fLine, fFoam;\nvarying vec2 vF;';
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>${decl}`).replace('#include <begin_vertex>', '#include <begin_vertex>\nvF = uv;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>${decl}${NOISE}`)
      .replace('#include <map_fragment>', `
        float t = fTime, x = vF.x, y = vF.y, len = fDim.x, tot = fDim.y, crest = fDim.z;
        float fy = y - fDim.w * t;                                   // the water's own frame: everything on it runs down
        // ragged sides: the ribbon's edge wanders in and out as it falls, widest at the lip
        float side = min(x, len - x);
        float rag = 0.04 + 0.3 * fNoise(vec2(step(len * 0.5, x) * 7.0 + 1.3, fy * 0.22)) * smoothstep(0.0, crest + 1.0, y);
        if (side < rag && y > fDim.z * 0.35) discard;
        // the body: turquoise in long soft bands, deeper toward the sides so the ribbon reads as round
        float band = fNoise(vec2(x * 0.9, fy * 0.05)) * 0.6 + fNoise(vec2(x * 2.3 + 4.0, fy * 0.09)) * 0.4;
        vec3 c = mix(mix(fDeep, fShallow, 0.55), fShallow, smoothstep(0.3, 0.7, band));
        c *= mix(0.72, 1.0, smoothstep(0.0, 1.1, side));
        // the light lines: thin, long, a little faster than the body
        float l1 = fNoise(vec2(x * 3.1 + 9.0, (y - fDim.w * 1.25 * t) * 0.09));
        c = mix(c, fLine, smoothstep(0.70, 0.76, l1) * 0.45);
        // the white streaks: crisp, long, thinning as they fall; all white at the crest, breaking into drips below it
        float s1 = fNoise(vec2(x * 1.7, fy * 0.035)) * 0.6 + fNoise(vec2(x * 4.4 + 3.0, fy * 0.07)) * 0.28 + fNoise(vec2(x * 11.0 + 7.0, fy * 0.2)) * 0.12;
        float cut = mix(0.34, 0.66, smoothstep(crest * 0.55, crest + 1.6, y));
        float streak = smoothstep(cut, cut + 0.03, s1);
        // the foot: foam climbing the curtain, solid at the water and patchy above
        float up = tot - y;
        float fn = fNoise(vec2(x * 2.2, up * 1.3 + t * 2.6)) * 0.65 + fNoise(vec2(x * 5.0 + 2.0, up * 2.4 + t * 3.4)) * 0.35;
        float foot = 1.0 - smoothstep(fn * 2.4 - 0.2, fn * 2.4 + 0.1, up - 0.25);
        // the lip: a bright round highlight where the water bends
        float hi = smoothstep(crest * 0.25, crest * 0.5, y) * (1.0 - smoothstep(crest * 0.62, crest * 0.95, y));
        c = mix(c, fFoam, max(max(streak, foot), hi * 0.55));
        diffuseColor.rgb = c;`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * 0.06;');   // it keeps its colour in the gorge's shade
  };
  mat.customProgramCacheKey = () => 'fall-curtain';
  const curtain = new THREE.Mesh(geo, mat); curtain.receiveShadow = true;
  g.add(curtain);

  // ---- the wash: foam on the lower water round the foot (a strip out from the curtain, rounded at its ends) ----
  {
    const W = FALL.wash, wp: number[] = [], wuv: number[] = [], wi: number[] = [], ROWS = 6;
    const ring: { x: number; y: number; nx: number; ny: number }[] = [];
    const fan = (f: typeof fr[number], from: number, to: number) => {       // a quarter turn round an end of the foot
      const base = Math.atan2(f.ny, f.nx);
      for (let k = 0; k <= 5; k++) { const a = base + from + ((to - from) * k) / 5; ring.push({ x: f.x + f.nx * R * 0.6, y: f.y + f.ny * R * 0.6, nx: Math.cos(a), ny: Math.sin(a) }); }
    };
    fan(fr[0], -Math.PI / 2, 0);
    for (const f of fr) ring.push({ x: f.x + f.nx * R * 0.6, y: f.y + f.ny * R * 0.6, nx: f.nx, ny: f.ny });
    fan(fr[fr.length - 1], 0, Math.PI / 2);
    ring.forEach((p, i) => { for (let k = 0; k <= ROWS; k++) { const d = (W * k) / ROWS; wp.push(p.x + p.nx * d, bottom + 0.09, p.y + p.ny * d); wuv.push(i * 0.5, d); } });
    for (let i = 0; i + 1 < ring.length; i++) for (let k = 0; k < ROWS; k++) { const a = i * (ROWS + 1) + k, b = a + ROWS + 1; wi.push(a, a + 1, b, a + 1, b + 1, b); }
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3)); wg.setAttribute('uv', new THREE.Float32BufferAttribute(wuv, 2));
    wg.setIndex(wi); wg.computeVertexNormals();
    const wm = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0, side: THREE.DoubleSide });
    wm.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, colours, { fTime: time, fW: { value: W } });
      const decl = '\nuniform float fTime, fW;\nuniform vec3 fFoam;\nvarying vec2 vF;\nvarying vec3 vFW;';
      sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>${decl}`).replace('#include <begin_vertex>', `#include <begin_vertex>
        vF = uv;
        vec3 fw0 = (modelMatrix * vec4(transformed, 1.0)).xyz;      // ride the water's swell (kit-water's, so the foam lies on it)
        transformed.y += 0.07 * (sin(dot(fw0.xz, vec2(0.11, 0.07)) + fTime * 0.6) + 0.6 * sin(dot(fw0.xz, vec2(-0.05, 0.13)) + fTime * 0.43) + 0.3 * sin(dot(fw0.xz, vec2(0.21, -0.17)) + fTime * 0.9));
        vFW = fw0;`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>${decl}${NOISE}`)
        .replace('#include <map_fragment>', `
          float t = fTime, d = vF.y;
          vec2 q = vFW.xz;
          float n = smoothstep(0.22, 0.78, fNoise(q * 1.5 + vec2(t * 0.5, -t * 0.4)) * 0.6 + fNoise(q * 3.4 - vec2(t * 0.7, t * 0.3)) * 0.4);
          float cut = clamp(d / (fW * 0.85), 0.0, 1.0) * 0.78 + 0.04;       // solid at the foot, patches further out
          float foam = smoothstep(cut - 0.03, cut + 0.03, n);
          float ring = smoothstep(0.74, 0.86, 0.5 + 0.5 * sin(d * 2.6 - t * 2.6 + n * 2.5)) * (1.0 - smoothstep(fW * 0.55, fW, d)) * step(0.3, n);
          if (max(foam, ring) < 0.5) discard;
          diffuseColor.rgb = fFoam;`);
    };
    wm.customProgramCacheKey = () => 'fall-wash';
    const wash = new THREE.Mesh(wg, wm); wash.receiveShadow = true;
    g.add(wash);
  }

  // ---- the foot: chunky puffs that swell and bob, and drops hopping out of them ----
  {
    const rand = rng(Math.round(pts[0][0] * 73 + pts[0][1] * 151 + len * 31 + drop * 7));
    const puffs: { x: number; y: number; z: number; r: number; hop: number }[] = [];
    for (let s = 0; s <= len; s += 0.42) {
      // where along the lip: the frame point at s (they are about 0.5 u apart)
      const f = fr.reduce((best, p) => (Math.abs(p.s - s) < Math.abs(best.s - s) ? p : best), fr[0]);
      const big = 1 + Math.floor(rand() * 2);
      for (let k = 0; k < big; k++) {
        const r = 0.42 + rand() * 0.55, o = R - 0.15 + rand() * 0.95, j = (rand() - 0.5) * 0.4;
        puffs.push({ x: f.x + f.nx * o - f.ny * j, z: f.y + f.ny * o + f.nx * j, y: bottom + r * (0.25 + rand() * 0.5), r, hop: 0 });
      }
      if (rand() < 0.7) {
        const o = R + 0.3 + rand() * 1.6, j = (rand() - 0.5) * 0.8;
        puffs.push({ x: f.x + f.nx * o - f.ny * j, z: f.y + f.ny * o + f.nx * j, y: bottom + 0.1, r: 0.09 + rand() * 0.1, hop: 0.7 + rand() * 1.5 });
      }
    }
    const sphere = new THREE.IcosahedronGeometry(1, 2);
    const pm = new THREE.MeshStandardMaterial({ color: WATER.foam, roughness: 0.85, metalness: 0, emissive: 0x9fb6b4, emissiveIntensity: 0.35 });
    pm.onBeforeCompile = (sh) => {
      sh.uniforms.fTime = time;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float fTime;\nattribute vec2 aPuff;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float ph = aPuff.x * 6.2831, hop = aPuff.y;
          if (hop > 0.0) {            // a drop: thrown up, falling back, gone, again
            float k = fract(fTime * (0.55 + 0.3 * aPuff.x) + aPuff.x * 5.0);
            transformed *= 1.0 - 0.6 * k;
            transformed.y += (4.0 * k * (1.0 - k) * hop) / max(length(instanceMatrix[1].xyz), 1e-3);
          } else {                    // a puff: swelling and sinking in place
            transformed *= 0.82 + 0.18 * sin(fTime * (1.7 + aPuff.x) + ph);
            transformed.y += 0.22 * sin(fTime * (2.3 + 0.9 * aPuff.x) + ph * 1.7);
          }`);
    };
    pm.customProgramCacheKey = () => 'fall-puffs';
    const im = new THREE.InstancedMesh(sphere, pm, puffs.length);
    const m4 = new THREE.Matrix4(), ap = new Float32Array(puffs.length * 2);
    puffs.forEach((p, i) => {
      m4.makeScale(p.r, p.r * (p.hop ? 1 : 0.85), p.r).setPosition(p.x, p.y, p.z); im.setMatrixAt(i, m4);
      ap[i * 2] = rand(); ap[i * 2 + 1] = p.hop;
    });
    sphere.setAttribute('aPuff', new THREE.InstancedBufferAttribute(ap, 2));
    im.instanceMatrix.needsUpdate = true; im.receiveShadow = true; im.frustumCulled = false;
    g.add(im);
  }
  return g;
}
