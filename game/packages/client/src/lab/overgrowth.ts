/**
 * Overgrowth (2026-11-27, the infirmary's fix: docs/campaign/01-opening/infirmary-read.md): thick thorny vines grown in
 * code round a set piece's made structure (the well's brass cage and its crystal) and along the glyph paths near it,
 * in the foliage system's look (lab/foliage.ts: painted leaf and blossom cards), never baked into the model. The user:
 * "define the basic structure and make the vines procedural... it can be consistent when it regenerates, and we could
 * animate the recovery". Seeded, so the same scene always grows the same vines.
 *
 * A vine is a woody stem (a tube with thorns, drawn here) with leaves, and white and pale yellow flowers, along it
 * (foliage cards). Every vertex knows how far along its vine it lies, so one number per group, its level, says how
 * much stands: 1 fully grown (choking the well), 0 cut back to stumps at its foot. As the level falls each vine draws
 * back from its tip, its stem tapering to a point at the front and its leaves browning, dropping and shrinking away
 * past it, each vine on its own beat. setOvergrowth(id, level, fade) sets a group's level at run time (eased over
 * `fade` seconds), as setGlyphState does for the glyph paths; the group ids are the set piece's scene id and each
 * overgrown glyph path's id, so a line's vines can be cut as it relights.
 *
 * Units: metres, y up, the set piece's foot at the origin, in its own frame (the model's); kit-render scales by M.
 */
import * as THREE from 'three';
import { blossom, Foliage, LEAVES, OVER_MAX, OVERGROWTH, rng, type Pal, type Rnd } from './foliage';

/** kit.json's `overgrowth` on a set piece: the cage it chokes, in its model's frame (m; post angles in degrees, atan2(z, x)). */
export type OvergrowthSpec = {
  /** the cage's posts: their angles, the ring they stand on (m from the centre), their radius */
  posts: number[]; ring: number; postR?: number;
  /** heights (m): the cage's floor, the top of its posts, the dome's crown */
  floor: number; top: number; dome: number;
  /** the dais under the cage: its radius at the ground and at the cage's floor (m) */
  foot: number; deck: number;
  /** what it chokes in the middle: [bottom m, top m, widest radius m] */
  core?: [number, number, number];
  /** 0 to 1 (default 1): how many vines and how leafy */
  density?: number;
  /** the level a scene starts at (default 1, fully choked) */
  level?: number;
  /** how far (u) vines creep along each glyph path starting within `reach` u of the piece's centre (0: none) */
  paths?: number; reach?: number;
};

// ---- the groups' levels, by id: what the shaders read (OVERGROWTH), eased toward TARGET each frame ----
const LEVEL = OVERGROWTH.value, TARGET = new Float32Array(OVER_MAX).fill(1), FADE = new Float32Array(OVER_MAX).fill(2.5);
const IDS = new Map<string, number>();
let lastT = -1;

/** Forget every group (a new scene is being built). */
export function clearOvergrowth() { IDS.clear(); LEVEL.fill(1); TARGET.fill(1); }
/** The group index for an id, made if new (at `level`); undefined once the scene holds OVER_MAX groups. */
export function overgrowthSlot(id: string, level = 1): number | undefined {
  let i = IDS.get(id);
  if (i === undefined) {
    if (IDS.size >= OVER_MAX) return undefined;
    IDS.set(id, (i = IDS.size));
    LEVEL[i] = TARGET[i] = Math.max(0, Math.min(1, level));
  }
  return i;
}
/** The overgrowth groups built now, by id. */
export const overgrowthIds = (): string[] => [...IDS.keys()];
/**
 * Set an overgrowth's level by its id (a set piece's or a glyph path's scene id): 1 fully grown, 0 cut back to stumps,
 * eased there over `fade` seconds (0: at once). Returns false if no such group is built. For the fix to animate the recovery.
 */
export function setOvergrowth(id: string, level: number, fade = 2.5): boolean {
  const i = IDS.get(id);
  if (i === undefined) return false;
  TARGET[i] = Math.max(0, Math.min(1, level));
  FADE[i] = fade;
  if (fade <= 0) LEVEL[i] = TARGET[i];
  return true;
}
/** A group's level now (0 to 1), or undefined. */
export const overgrowthLevel = (id: string): number | undefined => { const i = IDS.get(id); return i === undefined ? undefined : LEVEL[i]; };
/** Advance every group's level toward its target to time t (seconds): linear, so a vine draws back at a steady pace. Called by spinKit. */
export function stepOvergrowth(t: number) {
  const dt = lastT < 0 ? 0 : Math.max(0, Math.min(0.25, t - lastT)); lastT = t;
  for (const i of IDS.values()) {
    const d = TARGET[i] - LEVEL[i];
    LEVEL[i] = FADE[i] <= 0 || Math.abs(d) <= dt / FADE[i] ? TARGET[i] : LEVEL[i] + Math.sign(d) * dt / FADE[i];
  }
}

// ---- the stems: tubes with thorns, drawn back to their front in the vertex stage ----
type V3 = [number, number, number];
/** One vine: its route (m), its radius at the foot and the tip, its lag (0 to 0.5: higher draws back sooner), the stump it leaves (m). */
export type Vine = { pts: V3[]; r0: number; r1: number; lag: number; stump: number; leaf?: number; bloom?: number };

const STEM = { seg: 0.05, sides: 7, taper: 0.2, thorn: 0.1 };
let stemMats: { mat: THREE.MeshLambertMaterial; depth: THREE.MeshDepthMaterial } | null = null;
/** The stems' vertex stage: past the front a ring collapses onto its axis; for the last `taper` m before it the stem narrows to a point. */
const STEM_VERT = `{
  float oL = uOver[int(aGrow.w + 0.5)];
  float oF = max(aStump, (aGrow.y + 0.3) * smoothstep(aGrow.z, 1.0, oL));
  float oD = oF - aGrow.x;
  transformed = aAxis + (transformed - aAxis) * sqrt(clamp(oD / ${STEM.taper.toFixed(2)}, 0.0, 1.0));
  vOw = (1.0 - smoothstep(0.85, 1.0, oL)) * (1.0 - smoothstep(0.0, 1.2, oD));
}`;
const STEM_DECL = `attribute vec3 aAxis; attribute vec4 aGrow; attribute float aStump; uniform float uOver[${OVER_MAX}]; varying float vOw;`;
function stemMaterials() {
  if (stemMats) return stemMats;
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uOver = OVERGROWTH;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${STEM_DECL}`).replace('#include <begin_vertex>', `#include <begin_vertex>\n${STEM_VERT}`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vOw;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.34, 0.26), vOw * 0.7);   // drying as it draws back');
  };
  mat.customProgramCacheKey = () => 'overgrowth-stem';
  // the shadow follows the stems as they draw back
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = (sh) => {
    sh.uniforms.uOver = OVERGROWTH;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${STEM_DECL}`).replace('#include <begin_vertex>', `#include <begin_vertex>\n${STEM_VERT}`);
  };
  depth.customProgramCacheKey = () => 'overgrowth-stem-depth';
  return (stemMats = { mat, depth });
}

const BARK = [new THREE.Color('#7a5a34'), new THREE.Color('#a88250'), new THREE.Color('#d6b67c'), new THREE.Color('#93a050')];
const THORN = [new THREE.Color('#3a2218'), new THREE.Color('#c8b48a')];

/** A vine's route as a smooth curve, sampled every STEM.seg m: points, unit tangents, frames, and distance along. */
function sample(v: Vine) {
  const curve = new THREE.CatmullRomCurve3(v.pts.map((p) => new THREE.Vector3(...p)), false, 'centripetal');
  const len = curve.getLength(), n = Math.max(2, Math.ceil(len / STEM.seg));
  const fr = curve.computeFrenetFrames(n, false);
  return { len, n, pts: curve.getSpacedPoints(n), T: fr.tangents, N: fr.normals, B: fr.binormals };
}

/** The stems of `vines` as one mesh in `group`: bark tubes twisted with ridges, thorns along the thick ones. */
function stems(r: Rnd, vines: Vine[], group: number): THREE.Mesh {
  const P: number[] = [], Nm: number[] = [], C: number[] = [], AX: number[] = [], G: number[] = [], S: number[] = [], I: number[] = [];
  const put = (p: THREE.Vector3, n: THREE.Vector3, c: THREE.Color, ax: THREE.Vector3, s: number, len: number, lag: number, stump: number) => {
    P.push(p.x, p.y, p.z); Nm.push(n.x, n.y, n.z); C.push(c.r, c.g, c.b); AX.push(ax.x, ax.y, ax.z); G.push(s, len, lag, group); S.push(stump);
    return P.length / 3 - 1;
  };
  const col = new THREE.Color(), n = new THREE.Vector3(), q = new THREE.Vector3();
  for (const v of vines) {
    const sm = sample(v), stump = Math.min(sm.len, v.stump), twist = 5 + r() * 3, hue = r();
    const rad = (s: number) => THREE.MathUtils.lerp(v.r0, v.r1, Math.pow(s / sm.len, 0.7));
    const rings: number[] = [];
    for (let i = 0; i <= sm.n; i++) {
      const s = (i / sm.n) * sm.len, c = sm.pts[i], R = rad(s), k = s / sm.len;
      rings.push(P.length / 3);
      for (let j = 0; j <= STEM.sides; j++) {
        const a = (j / STEM.sides) * Math.PI * 2;
        n.copy(sm.N[i]).multiplyScalar(Math.cos(a)).addScaledVector(sm.B[i], Math.sin(a));
        // twisted ridges: a light and a dark band winding round the stem; darker at the foot, greener toward the tip
        const ridge = 0.5 + 0.5 * Math.sin(a * 2 + s * twist);
        col.copy(BARK[0]).lerp(BARK[1], 0.35 + 0.45 * ridge).lerp(BARK[2], 0.25 * ridge * (1 - k)).lerp(BARK[3], Math.max(0, k - 0.45) * (0.6 + hue * 0.4));
        q.copy(c).addScaledVector(n, R * (0.92 + 0.08 * ridge));
        put(q, n, col, c, s, sm.len, v.lag, stump);
      }
    }
    for (let i = 0; i < sm.n; i++) for (let j = 0; j < STEM.sides; j++) {
      const a = rings[i] + j, b = rings[i + 1] + j;
      I.push(a, b, a + 1, a + 1, b, b + 1);
    }
    // thorns: short hooked cones every STEM.thorn m along stems thicker than 3 cm, pointing out and a little back
    if (v.r0 < 0.03) continue;
    for (let s = 0.12 + r() * 0.05; s < sm.len - 0.1; s += STEM.thorn * (0.6 + r() * 0.8)) {
      const i = Math.round((s / sm.len) * sm.n), c = sm.pts[i], R = rad(s);
      if (R < 0.022) break;
      const a = r() * Math.PI * 2, L = 0.05 + R * 0.6 + r() * 0.03, w = 0.012 + R * 0.18;
      const out = new THREE.Vector3().copy(sm.N[i]).multiplyScalar(Math.cos(a)).addScaledVector(sm.B[i], Math.sin(a));
      const tip = c.clone().addScaledVector(out, R + L).addScaledVector(sm.T[i], -L * 0.45);
      const side = new THREE.Vector3().crossVectors(out, sm.T[i]).normalize();
      const base = c.clone().addScaledVector(out, R * 0.8);
      const t0 = put(tip, out, THORN[1], c, s, sm.len, v.lag, stump);
      const ring = [0, 1, 2, 3].map((k) => {
        const b = base.clone().addScaledVector(side, Math.cos((k * Math.PI) / 2) * w).addScaledVector(sm.T[i], Math.sin((k * Math.PI) / 2) * w);
        return put(b, out, THORN[0], c, s, sm.len, v.lag, stump);
      });
      for (let k = 0; k < 4; k++) I.push(t0, ring[k], ring[(k + 1) % 4]);
    }
  }
  const g = new THREE.BufferGeometry(), f = (xs: number[], k: number) => new THREE.Float32BufferAttribute(xs, k);
  g.setAttribute('position', f(P, 3)); g.setAttribute('normal', f(Nm, 3)); g.setAttribute('color', f(C, 3));
  g.setAttribute('aAxis', f(AX, 3)); g.setAttribute('aGrow', f(G, 4)); g.setAttribute('aStump', f(S, 1)); g.setIndex(I);
  g.computeBoundingSphere();
  const { mat, depth } = stemMaterials();
  const m = new THREE.Mesh(g, mat);
  m.customDepthMaterial = depth;   // (and so kit-batch.ts leaves it out of its batches: its shape moves with its level)
  m.castShadow = m.receiveShadow = true;
  return m;
}

/**
 * Leaves and flowers along each vine (foliage cards that know where on their vine they sit): single leaves off the
 * stem, a clump of leaves every half metre or so, and in some clumps a few white or pale yellow flowers.
 * `rest(p)`: the height a leaf cut there falls to.
 */
function leaves(F: Foliage, vines: Vine[], group: number, rest: (p: THREE.Vector3) => number, leafAmount = 1, bloomAmount = 1) {
  const r = F.r, pals: Pal[] = ['green', 'green', 'deep', 'gold'];
  const out = new THREE.Vector3(), p = new THREE.Vector3();
  const card = (at: THREE.Vector3, dir: THREE.Vector3, size: number, ao: number, sway: number) =>
    F.card([at.x, at.y, at.z], [dir.x, dir.y + 0.5, dir.z], size, r() < 0.55 ? pick(r, LEAVES.droop) : pick(r, LEAVES.broad), pick(r, pals), ao,
      { roll: (r() - 0.5) * 1.4, sway, flip: r() < 0.5, lift: 0.45 });
  for (const v of vines) {
    const sm = sample(v), la = (v.leaf ?? 1) * leafAmount, ba = (v.bloom ?? 1) * bloomAmount;
    let nextClump = 0.3 + r() * 0.5;
    for (let s = 0.08 + r() * 0.1; s < sm.len; s += 0.24 / Math.max(0.2, la) * (0.7 + r() * 0.6)) {
      const i = Math.min(sm.n, Math.round((s / sm.len) * sm.n)), c = sm.pts[i], k = s / sm.len;
      const R = THREE.MathUtils.lerp(v.r0, v.r1, Math.pow(k, 0.7));
      F.over = [s, sm.len, v.lag, group];
      const a = r() * Math.PI * 2;
      out.copy(sm.N[i]).multiplyScalar(Math.cos(a)).addScaledVector(sm.B[i], Math.sin(a));
      const size = 0.13 + 0.05 * r() + 0.03 * (1 - k);
      p.copy(c).addScaledVector(out, R + size * 0.75);
      F.rest = rest(p);
      card(p, out, size, 0.55 + 0.35 * r(), 0.3 + k * 0.8);
      if (s < nextClump) continue;
      nextClump = s + 0.6 + r() * 0.5;
      // a clump: a few leaves round the stem, and maybe flowers among them
      const nL = 2 + Math.floor(r() * 3 * la);
      for (let j = 0; j < nL; j++) {
        const b = r() * Math.PI * 2;
        out.copy(sm.N[i]).multiplyScalar(Math.cos(b)).addScaledVector(sm.B[i], Math.sin(b));
        p.copy(c).addScaledVector(out, R + 0.1 + r() * 0.06).addScaledVector(sm.T[i], (r() - 0.5) * 0.2);
        F.rest = rest(p);
        card(p, out, 0.14 + r() * 0.05, 0.45 + 0.45 * r(), 0.3 + k * 0.8);
      }
      if (r() < 0.6 * ba) {
        const nB = 2 + Math.floor(r() * 2), pal: Pal = r() < 0.75 ? 'white' : 'yellow';
        for (let j = 0; j < nB; j++) {
          const b = r() * Math.PI * 2;
          out.copy(sm.N[i]).multiplyScalar(Math.cos(b)).addScaledVector(sm.B[i], Math.sin(b));
          out.y = Math.abs(out.y) * 0.5 + 0.3;
          p.copy(c).addScaledVector(out, R + 0.12 + r() * 0.05).addScaledVector(sm.T[i], (r() - 0.5) * 0.22);
          F.rest = rest(p);
          blossom(F, [p.x, p.y, p.z], [out.x, out.y, out.z], 0.11 + r() * 0.04, pal, 0.95, 0.4 + k, 1.0);
        }
      }
    }
  }
  F.over = null;
}
const pick = <T>(r: Rnd, xs: readonly T[]): T => xs[Math.min(xs.length - 1, Math.floor(r() * xs.length))];

// ---- the recipes ----
const at = (a: number, rad: number, y: number): V3 => [Math.cos(a) * rad, y, Math.sin(a) * rad];

/**
 * The vines choking a caged set piece (the infirmary's well), in its model's frame (m): climbers from the ground over
 * the dais and up round most of the posts, over the ring and up the dome (some hanging back down outside); stranglers
 * from the cage floor wound twice round the core (the crystal) and on up to a post's head; laces through the cage from
 * post to post past the core; and runners out over the ground from the dais's foot.
 */
export function cageVines(o: OvergrowthSpec, seed: number): Vine[] {
  const r = rng(seed), D = o.density ?? 1, posts = o.posts.map((d) => THREE.MathUtils.degToRad(d)), ring = o.ring, postR = o.postR ?? 0.15;
  const vines: Vine[] = [];
  const order = posts.map((a, i) => ({ a, k: r(), i })).sort((x, y) => x.k - y.k);
  // climbers
  const nClimb = Math.max(1, Math.round(posts.length * (0.45 + 0.4 * D)));
  for (const { a } of order.slice(0, nClimb)) {
    const a0 = a + (r() - 0.5) * 0.5, r0 = 0.085 + r() * 0.03;
    const pts: V3[] = [at(a0, o.foot + 0.45 + r() * 0.5, r0 * 0.8), at(a0 * 0.6 + a * 0.4, o.foot + 0.12, r0 + 0.04),
      at(a * 0.8 + a0 * 0.2, (o.foot + o.deck) / 2 + 0.05, (o.floor * 0.65)), at(a, o.deck + r0 * 0.6, o.floor + 0.02), at(a, ring + postR + r0, o.floor + r0 + 0.08)];
    // the helix round the post: its centre at the post, its radius the post's plus the vine's
    const hr = postR + r0 * 0.9, turns = 1.2 + r() * 1.3, dir = r() < 0.5 ? 1 : -1, y0 = o.floor + 0.2, y1 = o.top - 0.15;
    const cx = Math.cos(a) * ring, cz = Math.sin(a) * ring, steps = Math.ceil(turns * 10);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps, ph = a + dir * t * turns * Math.PI * 2;
      pts.push([cx + Math.cos(ph) * hr, y0 + (y1 - y0) * t, cz + Math.sin(ph) * hr]);
    }
    const b = a + dir * (0.25 + r() * 0.3);
    if (r() < 0.35) pts.push(at(b, ring + 0.25, o.top + 0.2), at(b + dir * 0.1, ring + 0.45, o.top - 0.35 - r() * 0.5));   // over the ring and hanging back down outside
    else pts.push(at(b, ring * 0.92, o.top + 0.3), at(b + dir * 0.15, ring * 0.62, (o.top + o.dome) / 2 + 0.25), at(b + dir * 0.3, ring * 0.3, o.dome - 0.05 + r() * 0.2));   // up the dome
    vines.push({ pts, r0, r1: 0.028, lag: 0.15 + r() * 0.3, stump: 0.35, leaf: 0.75 });
  }
  // stranglers round the core
  if (o.core) {
    const [c0, c1, cw] = o.core, prof = (y: number) => {
      const m = c0 + (c1 - c0) * 0.42;
      return Math.max(0.16, cw * (y < m ? (y - c0) / (m - c0) : (c1 - y) / (c1 - m)));
    };
    const nStr = 2 + (D > 0.6 ? 1 : 0);
    for (let k = 0; k < nStr; k++) {
      const a = posts[Math.floor(r() * posts.length)], r0 = 0.09 + r() * 0.025, dir = k % 2 ? 1 : -1, ph0 = a + k * 2.1;
      const pts: V3[] = [at(a, ring - 0.12, o.floor + r0 * 0.7), at((a + ph0) / 2, (ring + cw) / 2, o.floor + r0)];
      const turns = 1.6 + r() * 0.6, y0 = c0 + 0.12, y1 = c1 - 0.1, steps = Math.ceil(turns * 12);
      for (let i = 0; i <= steps; i++) {
        const t = i / steps, y = y0 + (y1 - y0) * t, ph = ph0 + dir * t * turns * Math.PI * 2;
        pts.push(at(ph, prof(y) + r0 + 0.03, y));
      }
      const end = posts[Math.floor(r() * posts.length)];
      pts.push(at(end, ring * 0.55, c1 + 0.35), at(end, ring - 0.05, o.top - 0.1));
      vines.push({ pts, r0, r1: 0.025, lag: 0.05 * r(), stump: 0.25, bloom: 1.2, leaf: 0.3 });
    }
  }
  // laces through the cage, post to post past the core
  const nLace = Math.round(3 * D);
  for (let k = 0; k < nLace; k++) {
    const i = Math.floor(r() * posts.length), j = (i + 3 + Math.floor(r() * 3)) % posts.length, a = posts[i], b = posts[j];
    const h1 = o.floor + 0.4 + r() * (o.top - o.floor - 0.8), h2 = o.floor + 0.4 + r() * (o.top - o.floor - 0.8);
    const mid = Math.atan2(Math.sin(a) + Math.sin(b), Math.cos(a) + Math.cos(b)) + (r() - 0.5) * 1.2;
    vines.push({ pts: [at(a, ring + postR * 0.5, h1), at(mid, (o.core?.[2] ?? 0.4) + 0.35, (h1 + h2) / 2 - 0.25), at(b, ring + postR * 0.5, h2), at(b + 0.12, ring + 0.3, h2 - 0.4)],
      r0: 0.055, r1: 0.022, lag: 0.25 + r() * 0.25, stump: 0, leaf: 0.5 });
  }
  // runners over the ground from the dais's foot
  const nRun = Math.round(2 + 4 * D);
  for (let k = 0; k < nRun; k++) {
    const a = r() * Math.PI * 2, len = 1.2 + r() * 1.6, r0 = 0.055 + r() * 0.025, bend = (r() - 0.5) * 0.9, pts: V3[] = [];
    for (let i = 0; i <= 5; i++) {
      const t = i / 5, d = o.foot - 0.05 + len * t, aa = a + bend * t * t / Math.max(1, d) + Math.sin(t * 6 + k) * 0.08;
      pts.push(at(aa, d, r0 * 0.7 + 0.02));
    }
    vines.push({ pts, r0, r1: 0.015, lag: 0.3 + r() * 0.2, stump: 0.25, bloom: 0.6 });
  }
  return vines;
}

/** The height a cut leaf falls to round a caged set piece: the cage's floor inside the deck, a step on the dais, else the ground. */
function cageRest(o: OvergrowthSpec) {
  return (p: THREE.Vector3) => {
    const d = Math.hypot(p.x, p.z);
    return d < o.deck ? Math.min(p.y, o.floor + 0.03) : d < o.foot ? Math.min(p.y, o.floor * 0.4) : Math.min(p.y, 0.03);
  };
}

/** A caged set piece's overgrowth as one group (m, the model's frame), its vines in overgrowth group `group`. */
export function cageOvergrowth(o: OvergrowthSpec, seed: number, group: number): THREE.Group {
  const vines = cageVines(o, seed), g = new THREE.Group();
  g.add(stems(rng(seed + 1), vines, group));
  const F = new Foliage(rng(seed + 2));
  leaves(F, vines, group, cageRest(o), 0.6 + 0.3 * (o.density ?? 1));
  g.add(F.build());
  g.userData.overgrowth = true;
  return g;
}

/**
 * The choked core's light (the user, 2026-11-27, q-crystal: "it should be off, and then light up more once we've
 * cleared it"): the green of the model inside the spec's `core` cylinder is dulled and darkened while its vines stand
 * and glows as they are cut back, read from the same level the vines use (group `group`). Only green texels inside the
 * core change, so the brass cage round it keeps its look. `model` is the placed model, `frame` the set piece's group
 * (the spec's frame, in u), `M` u per metre. Each of the model's meshes gets its own material (its own transform).
 */
export function coreGlow(model: THREE.Object3D, frame: THREE.Object3D, o: OvergrowthSpec, group: number, M: number) {
  if (!o.core) return;
  frame.updateMatrixWorld(true);
  const toFrame = new THREE.Matrix4().copy(frame.matrixWorld).invert().premultiply(new THREE.Matrix4().makeScale(1 / M, 1 / M, 1 / M));
  const core = new THREE.Vector3(...o.core);
  model.traverse((n) => {
    const mesh = n as THREE.Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material)) return;
    const m = (mesh.material as THREE.MeshStandardMaterial).clone(), toCore = { value: new THREE.Matrix4().multiplyMatrices(toFrame, mesh.matrixWorld) };
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, { uOver: OVERGROWTH, uToCore: toCore, uCore: { value: core } });
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform mat4 uToCore; varying vec3 vCoreP;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCoreP = (uToCore * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nuniform float uOver[${OVER_MAX}]; uniform vec3 uCore; varying vec3 vCoreP;`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          vec3 coreC = diffuseColor.rgb;
          float coreIn = (1.0 - smoothstep(uCore.z * 0.95, uCore.z * 1.2, length(vCoreP.xz)))
            * smoothstep(uCore.x - 0.05, uCore.x + 0.08, vCoreP.y) * (1.0 - smoothstep(uCore.y, uCore.y + 0.15, vCoreP.y));
          float coreK = coreIn * smoothstep(0.015, 0.08, coreC.g - max(coreC.r, coreC.b));
          float coreLit = pow(1.0 - uOver[${group}], 1.6);   // slow at first: the last cuts light it most
          vec3 coreDull = mix(vec3(dot(coreC, vec3(0.3, 0.59, 0.11))), coreC, 0.3) * 0.42;
          diffuseColor.rgb = mix(coreC, mix(coreDull, coreC * 1.1, coreLit), coreK);`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          totalEmissiveRadiance += (coreC * vec3(0.7, 1.25, 0.8) + vec3(0.02, 0.10, 0.04)) * coreK * coreLit * 1.4;`);
    };
    m.customProgramCacheKey = () => `core-glow-${group}`;
    mesh.material = m;
  });
}

/**
 * Vines lying across a glyph path near the overgrown piece, `len` m along it from its start (pts: the route in m, in
 * the group's frame, the path's start first; w its width m): two or three runners weaving over the line from side to
 * side, low on the floor, cut back with the path's own group.
 */
export function pathOvergrowth(pts: V3[], w: number, len: number, seed: number, group: number, density = 1): THREE.Group {
  const r = rng(seed), vines: Vine[] = [];
  // the path's centre line as a curve, measured
  const line = new THREE.CurvePath<THREE.Vector3>();
  for (let i = 0; i + 1 < pts.length; i++) if (Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][2] - pts[i][2]) > 1e-3) line.add(new THREE.LineCurve3(new THREE.Vector3(...pts[i]), new THREE.Vector3(...pts[i + 1])));
  const total = line.getLength(), L = Math.min(len, total);
  if (L < 0.3) return new THREE.Group();
  const n = 2 + (density > 0.6 ? 1 : 0);
  for (let k = 0; k < n; k++) {
    const r0 = 0.055 + r() * 0.02, reach = L * (0.55 + r() * 0.45), waves = 1.5 + r() * 2, ph = r() * 6.28, amp = w * (0.55 + r() * 0.4);
    const vp: V3[] = [];
    for (let s = 0; s <= reach; s += 0.25) {
      const u = s / total, p = line.getPointAt(Math.min(1, u)), t = line.getTangentAt(Math.min(1, u));
      const side = Math.sin(ph + (s / reach) * waves * Math.PI * 2) * amp * Math.min(1, 0.4 + s);
      vp.push([p.x - t.z * side, p.y + r0 * 0.7 + 0.02, p.z + t.x * side]);
    }
    if (vp.length >= 3) vines.push({ pts: vp, r0, r1: 0.014, lag: 0.1 + r() * 0.3, stump: 0.15, bloom: 0.5, leaf: 0.8 });
  }
  const g = new THREE.Group();
  if (!vines.length) return g;
  g.add(stems(rng(seed + 1), vines, group));
  const F = new Foliage(rng(seed + 2));
  leaves(F, vines, group, (p) => Math.min(p.y, pts[0][1] + 0.03), 0.8 * density, 0.6);
  g.add(F.build());
  g.userData.overgrowth = true;
  return g;
}
