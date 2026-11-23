/**
 * The stylised-3D spike (2026-11-23, the user approved it as a reversible test of leaving pixel art): the courtyard's
 * plan-made level drawn as real 3D terrain from its heights and ground, with Meshy models of the great hall's pieces
 * (from Codex pictures) standing on it, and the wizard's own 3D model walking about, at a camera as steep and close as
 * Magicka's. Its own page (world3d.html), so nothing in the game's path changes. Not a renderer yet: no sim, no
 * collisions beyond tier steps, no props but the kit.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ROOMS } from '@wizard-sim/sim';
import { heightMap } from '../art/heights';
import { GROUNDS } from '../art/grounds.gen';
import place from './world3d-place.json';
import ground3dJson from './world3d-ground.json';
const ground3d = ground3dJson as unknown as { regions: { mat: string; h: number; kind: string; ground: number | null; polys: number[][][][]; under?: number[][][][] }[]; faces: [number, number, number, number, number, number, string, string][] };

const ROOM = 'court';
const U_PER_M = 1 / 0.6;                 // world units per metre (art/massing.ts)
const CELL = 0.5;
const q = new URLSearchParams(location.search);

const groundUrls = import.meta.glob<string>('../../../../content/assets/ground/*.png', { eager: true, query: '?url', import: 'default' });
// round 3: seamless 3D textures from Codex (tools/building-art/tile3d.py), used where they exist
const tileUrls = import.meta.glob<string>('../../../../content/generated/codex/tex3d-tiles/*.png', { eager: true, query: '?url', import: 'default' });
/** World units one repeat of each texture covers. */
const TILE: Record<string, number> = { slate: 3, flagstone: 4.5, cobble: 3.5, grass: 6, ashlar: 5, coping: 3 };
const kitUrls = import.meta.glob<string>('../../../../content/generated/meshy/court-kit/*.glb', { eager: true, query: '?url', import: 'default' });
const modelUrls = import.meta.glob<string>('../../../../content/assets/models/wizard.glb', { eager: true, query: '?url', import: 'default' });
import wizMeta from '../../../../content/assets/models/wizard.json';
const urlOf = (all: Record<string, string>, name: string) => Object.entries(all).find(([p]) => p.endsWith('/' + name))?.[1];

const GROUND_FILE: Record<string, string> = { g: 'grass', d: 'dirt', s: 'sand', f: 'flagstone', c: 'cobble', m: 'mud', l: 'leaves', r: 'coping', a: 'slate', p: 'planks', h: 'flagstone', w: 'water' };

// ---- the scene ----
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1d2230);
scene.fog = new THREE.Fog(0x2a2f3c, 70, 140);
// a soft environment for PBR materials to reflect (metal and gloss read dark without one)
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.15;

// screen axes in world (x, y): the plan's U (screen right) and V (screen down) are turned 45 degrees to the world grid
const R2 = Math.SQRT1_2;
const RIGHT = new THREE.Vector3(R2, 0, -R2), DOWN = new THREE.Vector3(R2, 0, R2);

scene.add(new THREE.HemisphereLight(0xc8d8ff, 0x9a7050, 1.5));
const sun = new THREE.DirectionalLight(0xffc98f, 3.0);   // a low warm morning sun (the critic: flat midday light)
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
const sc = sun.shadow.camera as THREE.OrthographicCamera;
sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 200;
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);
// from the upper left of the screen, fairly high: shadows fall down and to the right
const SUN_OFF = RIGHT.clone().multiplyScalar(-46).add(DOWN.clone().multiplyScalar(22)).add(new THREE.Vector3(0, 34, 0));   // on the camera's side, so the faces you see are lit

// ---- the terrain, from the level's heights and ground ----
const def = (ROOMS as Record<string, Parameters<typeof heightMap>[0]>)[ROOM];
const hm = heightMap(def)!;
const rows = GROUNDS[ROOM];
const { gw, gh } = hm;
const m = Float32Array.from(hm.m);
const ground = (cx: number, cy: number) => rows[cy]?.[cx] ?? 'g';
// buildings' roofs ('a', ash) stand at the wall modules' eaves above the ground they stand on, in slate (round 4: the
// modules ring each footprint; their own roof pieces meet this one). ?roof= sets the height in metres.
const ROOF_M = Number(q.get('roof') ?? 3.4);
const isRoof = new Uint8Array(gw * gh);
{
  const roof = new Uint8Array(gw * gh);
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) if (ground(x, y) === 'a' && !hm.out[y * gw + x]) roof[y * gw + x] = 1;
  for (let pass = 0; pass < 200; pass++) {
    let left = 0;
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      const k = y * gw + x;
      if (roof[k] !== 1) continue;
      let lo = Infinity;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, n = ny * gw + nx;
        if (nx < 0 || ny < 0 || nx >= gw || ny >= gh || hm.out[n] || roof[n] === 1) continue;
        lo = Math.min(lo, m[n]);
      }
      if (lo < Infinity) { m[k] = lo; roof[k] = 2; } else left++;
    }
    for (let k = 0; k < roof.length; k++) if (roof[k] === 2) roof[k] = 3;
    if (!left) break;
  }
  for (let k = 0; k < roof.length; k++) if (roof[k]) { m[k] += ROOF_M; isRoof[k] = 1; }
}
// the plan's parapets (a lip 1 m above the walkway, ground 'r') come down to the walkway: modelled balustrades stand
// along the edges instead (round 3)
for (let pass = 0; pass < 3; pass++) for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
  const k = y * gw + x;
  if (ground(x, y) !== 'r' || hm.out[k]) continue;
  let best = -Infinity;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + dx, ny = y + dy, n = ny * gw + nx;
    if (nx < 0 || ny < 0 || nx >= gw || ny >= gh || hm.out[n] || ground(nx, ny) === 'r') continue;
    if (m[n] < m[k] - 0.5 && m[n] > best) best = m[n];
  }
  if (best > -Infinity && m[k] - best <= 1.3) m[k] = best;
}
// a piece placed with `flatten` (a pier standing where the plan had a block) levels the ground under it to its own height
for (const pc of place.pieces as { x: number; y: number; z: number; flatten?: number }[]) {
  if (!pc.flatten) continue;
  const r = pc.flatten, c0 = Math.floor((pc.x - r + hm.w / 2) / CELL), c1 = Math.ceil((pc.x + r + hm.w / 2) / CELL);
  const r0 = Math.floor((pc.y - r + hm.h / 2) / CELL), r1 = Math.ceil((pc.y + r + hm.h / 2) / CELL);
  for (let cy = Math.max(0, r0); cy <= Math.min(gh - 1, r1); cy++) for (let cx = Math.max(0, c0); cx <= Math.min(gw - 1, c1); cx++) {
    const x = -hm.w / 2 + (cx + 0.5) * CELL, y = -hm.h / 2 + (cy + 0.5) * CELL;
    if (Math.hypot(x - pc.x, y - pc.y) <= r) m[cy * gw + cx] = pc.z;
  }
}
const wx = (cx: number) => -hm.w / 2 + cx * CELL, wy = (cy: number) => -hm.h / 2 + cy * CELL;
const yOf = (metres: number) => metres * U_PER_M;
const loader = new THREE.TextureLoader();
const tex = new Map<string, THREE.Texture>();
const texOf = (file: string) => {
  let t = tex.get(file);
  if (!t) {
    t = loader.load(urlOf(tileUrls, file + '.png') ?? urlOf(groundUrls, file + '.png')!);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    if (TILE[file]) t.repeat.setScalar(TS / TILE[file]);
    tex.set(file, t);
  }
  return t;
};
interface Buf { pos: number[]; uv: number[]; nrm: number[] }
const bufs = new Map<string, Buf>();
const buf = (key: string) => { let b = bufs.get(key); if (!b) { b = { pos: [], uv: [], nrm: [] }; bufs.set(key, b); } return b; };
const TS = 4; // world units per texture repeat
function tri(bf: Buf, p: number[][], n: number[], uv: (q: number[]) => number[]) {
  // wind it counter-clockwise about its normal, so a double-sided material never flips it
  const [a, b, c] = p, ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
  const order = cx * n[0] + cy * n[1] + cz * n[2] < 0 ? [a, c, b] : [a, b, c];
  for (const q of order) { bf.pos.push(...q); bf.nrm.push(...n); bf.uv.push(...uv(q)); }
}
const topUV = (q: number[]) => [q[0] / TS, q[2] / TS];
/** A vertical face along p -> q (top points), from height `hi` down to `lo`, facing away from (cx, cz). */
function side(key: string, p: number[], q: number[], hi: number, lo: number, cx: number, cz: number) {
  let nx = q[2] - p[2], nz = -(q[0] - p[0]);
  const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
  if (nx * ((p[0] + q[0]) / 2 - cx) + nz * ((p[2] + q[2]) / 2 - cz) < 0) { nx = -nx; nz = -nz; }
  const along = (v: number[]) => (Math.abs(nx) > Math.abs(nz) ? v[2] : v[0]) / TS;
  const A = [p[0], hi, p[2]], Bq = [q[0], hi, q[2]], C2 = [q[0], lo, q[2]], D = [p[0], lo, p[2]];
  const uv = (v: number[]) => [along(v), v[1] / TS];
  tri(buf(key), [A, D, C2], [nx, 0, nz], uv); tri(buf(key), [A, C2, Bq], [nx, 0, nz], uv);
}
/** A convex polygon at height y, fanned. */
function top(key: string, pts: number[][], y: number) {
  const v = pts.map((q) => [q[0], y, q[1]]);
  for (let i = 1; i + 1 < v.length; i++) tri(buf(key), [v[0], v[i], v[i + 1]], [0, 1, 0], topUV);
}
// The level comes in 1 u blocks (2 x 2 cells) on a grid turned 45 degrees to the screen, so a straight edge across the
// screen is a staircase of blocks. Each outer step corner is cut on the diagonal and the notch filled at the lower
// height, so the staircase reads as the straight line the plan drew.
// ---- the ground: from the plan's exact shapes (tools/place-plans/vector.py), or from the cells with ?ground=cells ----
/** Plan material -> texture. */
const PLAN_TEX: Record<string, string> = {
  grass: 'grass', path: 'dirt', road: 'cobble', paving: 'flagstone', plaza: 'flagstone', dais: 'flagstone', stairs: 'flagstone',
  wood: 'planks', sand: 'sand', water: 'water', deep: 'water', trees: 'leaves', rock: 'coping', roof: 'slate', wall: 'coping',
};
const sideKey = (mat: string) => (mat === 'grass' || mat === 'trees' || mat === 'path' ? 'cliff' : 'wall');
if (q.get('ground') === 'cells') {
const B = hm.b, BS = B * CELL, bw = Math.floor(gw / B), bh = Math.floor(gh / B);
  const CLIFF = 0.2; // metres: a flight's own treads (about 0.1) are never cut
  const Hb = (i: number, j: number) => (i < 0 || j < 0 || i >= bw || j >= bh || hm.out[j * B * gw + i * B] ? -Infinity : m[j * B * gw + i * B]);
  const Gb = (i: number, j: number) => ground(i * B, j * B);
  const fileOf = (ch: string) => GROUND_FILE[ch] ?? 'grass';
  const sideOf = (ch: string) => (ch === 'g' || ch === 'l' || ch === 'd' ? 'cliff' : 'wall');
  const yb = (h: number) => (h === -Infinity ? -12 : yOf(h));
  for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) {
    const h = Hb(i, j);
    if (h === -Infinity) continue;
    const ch = Gb(i, j), y = yOf(h);
    const x0 = wx(i * B), z0 = wy(j * B), x1 = x0 + BS, z1 = z0 + BS, cx = x0 + BS / 2, cz = z0 + BS / 2;
    const corner = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
    // each corner's two edge neighbours: 0 (left, up), 1 (right, up), 2 (right, down), 3 (left, down)
    const nb: [number, number][][] = [[[i - 1, j], [i, j - 1]], [[i + 1, j], [i, j - 1]], [[i + 1, j], [i, j + 1]], [[i - 1, j], [i, j + 1]]];
    const cut = nb.map(([a, c]) => Hb(...a) < h - CLIFF && Hb(...c) < h - CLIFF);
    const n = cut.filter(Boolean).length;
    const leg = n === 1 ? BS : BS / 2;
    const pts: number[][] = [];
    const at = (c: number, toward: number, d: number) => [corner[c][0] + ((corner[toward][0] - corner[c][0]) * d) / BS, corner[c][1] + ((corner[toward][1] - corner[c][1]) * d) / BS];
    for (let c = 0; c < 4; c++) {
      const add = (q: number[]) => { const l = pts[pts.length - 1]; if (!l || Math.hypot(l[0] - q[0], l[1] - q[1]) > 1e-6) pts.push(q); };
      if (cut[c]) { add(at(c, (c + 3) % 4, leg)); add(at(c, (c + 1) % 4, leg)); } else add(corner[c]);
    }
    if (pts.length > 2 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 1e-6) pts.pop();
    top(fileOf(ch), pts, y);
    // which neighbour a straight piece of edge borders
    const edgeNb = (p: number[], q: number[]): [number, number] | null => {
      if (Math.abs(p[1] - z0) < 1e-6 && Math.abs(q[1] - z0) < 1e-6) return [i, j - 1];
      if (Math.abs(p[1] - z1) < 1e-6 && Math.abs(q[1] - z1) < 1e-6) return [i, j + 1];
      if (Math.abs(p[0] - x0) < 1e-6 && Math.abs(q[0] - x0) < 1e-6) return [i - 1, j];
      if (Math.abs(p[0] - x1) < 1e-6 && Math.abs(q[0] - x1) < 1e-6) return [i + 1, j];
      return null;
    };
    const fillOf = (c: number) => Math.max(Hb(...nb[c][0]), Hb(...nb[c][1]));
    for (let k = 0; k < pts.length; k++) {
      const p = pts[k], q = pts[(k + 1) % pts.length], e = edgeNb(p, q);
      let lo: number;
      if (e) lo = Hb(...e);
      else { // a cut: which corner's?
        const mid = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
        let best = 0, bd = Infinity;
        for (let c = 0; c < 4; c++) { const d = Math.hypot(corner[c][0] - mid[0], corner[c][1] - mid[1]); if (cut[c] && d < bd) { bd = d; best = c; } }
        lo = fillOf(best);
      }
      if (yb(lo) < y - 0.01) side(sideOf(ch), [p[0], 0, p[1]], [q[0], 0, q[1]], y, yb(lo), cx, cz);
    }
    // the notches, filled at the higher of the two lower neighbours, with its own faces down to a lower one still
    for (let c = 0; c < 4; c++) {
      if (!cut[c]) continue;
      const f = fillOf(c);
      if (f === -Infinity) continue;
      const fy = yOf(f), src = Hb(...nb[c][0]) >= Hb(...nb[c][1]) ? nb[c][0] : nb[c][1];
      const A = at(c, (c + 3) % 4, leg), Cc = corner[c], D = at(c, (c + 1) % 4, leg);
      top(fileOf(Gb(...src)), [A, Cc, D], fy);
      for (const [p, q] of [[A, Cc], [Cc, D]]) {
        const e = edgeNb(p, q);
        if (!e) continue;
        const lo = Hb(...e);
        if (yb(lo) < fy - 0.01) side(sideOf(Gb(...src)), [p[0], 0, p[1]], [q[0], 0, q[1]], fy, yb(lo), cx, cz);
      }
    }
  }
} else {
  for (const rg of ground3d.regions) {
    // a pier or post: its footprint is paved ground at its base, and the pier model stands on it (spike3d_place.py)
    const file = rg.kind === 'post' ? 'flagstone' : PLAN_TEX[rg.mat] ?? 'grass';
    const top = rg.kind === 'post' ? (rg.ground ?? rg.h) : rg.mat === 'roof' ? (rg.ground ?? rg.h) + ROOF_M : rg.h;
    const bf = buf(file);
    for (const [polys, y] of [[rg.under ?? [], yOf(top) - 0.03], [rg.polys, yOf(top)]] as [number[][][][], number][]) for (const [outer, ...holes] of polys) {
      const contour = outer.map(([x, z]) => new THREE.Vector2(x, z)), hs = holes.map((h) => h.map(([x, z]) => new THREE.Vector2(x, z)));
      const pts = [...contour, ...hs.flat()];
      for (const [i0, i1, i2] of THREE.ShapeUtils.triangulateShape(contour, hs)) tri(bf, [i0, i1, i2].map((i) => [pts[i].x, y, pts[i].y]), [0, 1, 0], topUV);
    }
  }
  const regionTop = new Map(ground3d.regions.map((r) => [r.mat + ':' + r.h, r.mat === 'roof' ? (r.ground ?? r.h) + ROOF_M : r.h]));
  for (const [ax, ay, bx, by, top, low, mat, fkind] of ground3d.faces) {
    if (fkind === 'post') continue;
    const t = mat === 'roof' ? (regionTop.get(mat + ':' + top) ?? top) : top;
    if (low >= t - 0.01) continue;
    // outward: exteriors run counter-clockwise, so the right-hand side of a -> b
    const L = Math.hypot(bx - ax, by - ay), nx = (by - ay) / L, nz = -(bx - ax) / L;
    side(sideKey(mat), [ax, 0, ay], [bx, 0, by], yOf(t), yOf(low), (ax + bx) / 2 - nx, (ay + by) / 2 - nz);
  }
}
// ---- phase B: sweeps along the exact edges (tools/place-plans/vector.py): a stone coping on every retaining wall's top,
// a kerb or edging where two ground materials meet. Built along the line itself, so they fit any curve; mitred joins. ----
/** A box swept along `pts` (world x, y): `a`..`b` across the line (negative = outward, the right-hand side), `y0`..`y1`
 *  in world units. Textured along its length. */
function sweep(key: string, pts: number[][], a: number, b: number, y0: number, y1: number) {
  const n = pts.length;
  if (n < 2) return;
  // per-vertex inward normal (left of the direction), mitred
  const nrm: number[][] = [];
  for (let k = 0; k < n; k++) {
    const p = pts[Math.max(0, k - 1)], q = pts[Math.min(n - 1, k + 1)], cur = pts[k];
    const d0 = k > 0 ? [cur[0] - p[0], cur[1] - p[1]] : [q[0] - cur[0], q[1] - cur[1]];
    const d1 = k < n - 1 ? [q[0] - cur[0], q[1] - cur[1]] : d0;
    const l0 = Math.hypot(d0[0], d0[1]) || 1, l1 = Math.hypot(d1[0], d1[1]) || 1;
    const n0 = [-d0[1] / l0, d0[0] / l0], n1 = [-d1[1] / l1, d1[0] / l1];
    let mx = n0[0] + n1[0], my = n0[1] + n1[1]; const ml = Math.hypot(mx, my) || 1; mx /= ml; my /= ml;
    const c = Math.max(0.35, mx * n1[0] + my * n1[1]);
    nrm.push([mx / c, my / c]);
  }
  let along = 0;
  const bf = buf(key);
  for (let k = 0; k + 1 < n; k++) {
    const [p, q] = [pts[k], pts[k + 1]], [np, nq] = [nrm[k], nrm[k + 1]];
    const L = Math.hypot(q[0] - p[0], q[1] - p[1]), u0 = along / TS, u1 = (along + L) / TS;
    along += L;
    const P = (pt: number[], nn: number[], off: number, y: number) => [pt[0] + nn[0] * off, y, pt[1] + nn[1] * off];
    const pa0 = P(p, np, a, y1), pb0 = P(p, np, b, y1), qa0 = P(q, nq, a, y1), qb0 = P(q, nq, b, y1);
    const pa1 = P(p, np, a, y0), qa1 = P(q, nq, a, y0), pb1 = P(p, np, b, y0), qb1 = P(q, nq, b, y0);
    const topUVf = (v: number[]) => [(v[0] + v[2]) / TS, (v[0] - v[2]) / TS * 0.25];
    // top
    tri(bf, [pa0, qa0, qb0], [0, 1, 0], topUVf); tri(bf, [pa0, qb0, pb0], [0, 1, 0], topUVf);
    // the outer face (a side) and the inner face (b side)
    const on = [-(np[0] + nq[0]) / 2, 0, -(np[1] + nq[1]) / 2], inn = [-on[0], 0, -on[2]];
    const uvOut = (v: number[]) => [Math.abs(v[0] - p[0]) + Math.abs(v[2] - p[1]) > 1e-6 && (v[0] === qa0[0] || v[0] === qa1[0]) ? u1 : u0, (v[1] - y0) / TS];
    tri(bf, [pa0, pa1, qa1], on, uvOut); tri(bf, [pa0, qa1, qa0], on, uvOut);
    const uvIn = (v: number[]) => [(v[0] === qb0[0] || v[0] === qb1[0]) ? u1 : u0, (v[1] - y0) / TS];
    tri(bf, [pb0, qb1, pb1], inn, uvIn); tri(bf, [pb0, qb0, qb1], inn, uvIn);
  }
}
if (q.get('ground') !== 'cells') {
  const groundEdges = (ground3dJson as unknown as { edges?: { type: string; pts: number[][]; top: number; low: number }[] }).edges ?? [];
  for (const e of groundEdges) {
    const top = yOf(e.top);
    if (e.type === 'retain' || e.type === 'parapet') sweep('coping', e.pts, -0.25, 0.55, top - 0.05, top + 0.28);   // a coping, overhanging the face
    else if (e.type === 'kerb') sweep('coping', e.pts, -0.18, 0.18, top - 0.1, top + 0.1);                              // a kerb on the line
  }
}
for (const [key, b] of bufs) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
  const mat = key === 'water'
    ? new THREE.MeshStandardMaterial({ color: 0x3f8fb8, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.88 })
    : key === 'wall' ? new THREE.MeshStandardMaterial({ map: texOf('ashlar'), roughness: 0.9 })
    : key === 'cliff' ? new THREE.MeshStandardMaterial({ map: texOf('ashlar'), color: 0xc9b9a0, roughness: 1 })
    : new THREE.MeshStandardMaterial({ map: texOf(key), roughness: 0.95 });
  mat.side = THREE.DoubleSide;
  const mesh = new THREE.Mesh(g, mat);
  mesh.receiveShadow = true; mesh.castShadow = key === 'wall' || key === 'cliff';
  scene.add(mesh);
}

// ---- the kit and the wizard ----
const gltf = new GLTFLoader();
const pending: Promise<unknown>[] = [];
const kitCache = new Map<string, Promise<THREE.Object3D>>();
const kit = (name: string) => {
  let p = kitCache.get(name);
  // ?kit=gateway:/@fs/<abs path>.glb swaps a piece for any model file (the dev server serves it), to compare
  const swap = new Map((q.get('kit') ?? '').split(',').filter(Boolean).map((e) => e.split(/:(.*)/s).slice(0, 2) as [string, string]));
  if (!p) {
    const url = swap.get(name) ?? urlOf(kitUrls, name + '.glb');
    p = url ? gltf.loadAsync(url).then((g) => g.scene) : Promise.reject(new Error(`no model file for "${name}" in content/generated/meshy/court-kit/`));
    kitCache.set(name, p);
  }
  return p;
};
for (const pc of place.pieces) {
  pending.push(kit(pc.kit).then((src) => {
    const o = src.clone(true);
    o.traverse((c) => {
      const mesh = c as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true; mesh.receiveShadow = true;
      const mt = mesh.material as THREE.MeshStandardMaterial;
      if (mt && 'metalness' in mt && !mt.metalnessMap) { mt.metalness = 0; mt.roughness = 0.85; }   // a flat Meshy material comes in metallic, which reads dark with no environment; a PBR one keeps its maps
    });
    const box = new THREE.Box3().setFromObject(o), size = box.getSize(new THREE.Vector3());
    // a piece with a height (a retaining wall sized to its drop) takes it, stretching along its width to fill its run
    const s = pc.width / Math.max(size.x, 1e-6), sh = (pc as { height?: number }).height ? (pc as { height: number }).height / Math.max(size.y, 1e-6) : s;
    const holder = new THREE.Group();
    o.scale.set(s, sh, sh);
    o.position.set(-(box.min.x + size.x / 2) * s, -box.min.y * sh, -(box.min.z + size.z / 2) * sh);
    holder.add(o);
    holder.position.set(pc.x, yOf(pc.z), pc.y);
    holder.rotation.y = Math.atan2(pc.fx, pc.fy);   // the model's front (+z) turned to face (fx, fy)
    scene.add(holder);
  }));
}
const WIZ_H = 2.9; // world units (about 1.75 m)
let wizard: THREE.Object3D | null = null, mixer: THREE.AnimationMixer | null = null, walk: THREE.AnimationAction | null = null;
pending.push(gltf.loadAsync(urlOf(modelUrls, 'wizard.glb')!).then((g) => {
  const o = g.scene;
  o.traverse((c) => { if ((c as THREE.Mesh).isMesh) { c.castShadow = true; c.receiveShadow = true; } });
  // only the props the model shows by default (its staff): the conjured weapons and guards wait hidden (art/live3d.ts)
  const show = new Set<string>(wizMeta.show ?? []);
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const hide = new Set((wizMeta.props ?? []).filter((pr) => !show.has(pr.name ?? '')).map((pr) => norm(pr.node)));
  o.traverse((c) => { if (hide.has(norm(c.name))) c.visible = false; });
  const box = new THREE.Box3().setFromObject(o), size = box.getSize(new THREE.Vector3());
  const holder = new THREE.Group();
  o.scale.setScalar(WIZ_H / size.y);
  o.position.y = -box.min.y * (WIZ_H / size.y);
  holder.add(o); scene.add(holder);
  wizard = holder;
  mixer = new THREE.AnimationMixer(o);
  const clip = g.animations.find((a) => a.name.toLowerCase().includes('walk')) ?? g.animations[0];
  if (clip) { walk = mixer.clipAction(clip); walk.play(); walk.paused = true; }
}));

// ---- the camera: steep and close, as Magicka's ----
const PITCH = THREE.MathUtils.degToRad(Number(q.get('pitch') ?? 46));   // Magicka's, about (the critic: 52 let roofs take over)
const ortho = q.get('ortho') === '1';
const VIEW_H = Number(q.get('view') ?? 18); // world units of ground-plane height the screen shows at the target
const cam: THREE.Camera = ortho
  ? new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400)
  : new THREE.PerspectiveCamera(28, innerWidth / innerHeight, 0.5, 400);
function frame(target: THREE.Vector3) {
  const aspect = innerWidth / innerHeight;
  let dist = 60;
  if (cam instanceof THREE.PerspectiveCamera) { cam.aspect = aspect; dist = (VIEW_H * Math.sin(PITCH)) / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))); cam.updateProjectionMatrix(); }
  else { const o = cam as THREE.OrthographicCamera, hh = (VIEW_H * Math.sin(PITCH)) / 2; o.top = hh; o.bottom = -hh; o.left = -hh * aspect; o.right = hh * aspect; o.updateProjectionMatrix(); }
  const back = DOWN.clone().multiplyScalar(Math.cos(PITCH) * dist).add(new THREE.Vector3(0, Math.sin(PITCH) * dist, 0));
  cam.position.copy(target).add(back);
  cam.lookAt(target);
  sun.position.copy(target).add(SUN_OFF); sun.target.position.copy(target);
}

// ---- walking ----
const pos = new THREE.Vector2(Number(q.get('x') ?? place.start.x), Number(q.get('y') ?? place.start.y));
const metresAt = (x: number, y: number) => {
  const cx = Math.floor((x + hm.w / 2) / CELL), cy = Math.floor((y + hm.h / 2) / CELL);
  if (cx < 0 || cy < 0 || cx >= gw || cy >= gh || hm.out[cy * gw + cx]) return NaN;
  return m[cy * gw + cx];
};
const keys = new Set<string>();
addEventListener('keydown', (e) => keys.add(e.key.toLowerCase()));
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('resize', () => renderer.setSize(innerWidth, innerHeight));
// ambient occlusion in the corners and at the feet of walls (?ao=0 to compare)
let composer: EffectComposer | null = null;
if (q.get('ao') !== '0') {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, cam));
  const ao = new GTAOPass(scene, cam, innerWidth, innerHeight);
  ao.updateGtaoMaterial({ radius: 1.2, distanceFallOff: 1, thickness: 1.5 });
  ao.blendIntensity = 0.85;
  composer.addPass(ao);
  composer.addPass(new OutputPass());
}
addEventListener('resize', () => composer?.setSize(innerWidth, innerHeight));
const clock = new THREE.Clock();
let facing = Math.atan2(-DOWN.x, -DOWN.z);
function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const up = keys.has('w') || keys.has('arrowup'), dn = keys.has('s') || keys.has('arrowdown');
  const lf = keys.has('a') || keys.has('arrowleft'), rt = keys.has('d') || keys.has('arrowright');
  const mv = RIGHT.clone().multiplyScalar((rt ? 1 : 0) - (lf ? 1 : 0)).add(DOWN.clone().multiplyScalar((dn ? 1 : 0) - (up ? 1 : 0)));
  const moving = mv.lengthSq() > 0;
  if (moving) {
    mv.normalize().multiplyScalar(6 * dt);
    const here = metresAt(pos.x, pos.y), there = metresAt(pos.x + mv.x, pos.y + mv.z);
    if (!Number.isNaN(there) && (Number.isNaN(here) || Math.abs(there - here) <= 0.6)) pos.set(pos.x + mv.x, pos.y + mv.z);
    facing = Math.atan2(mv.x, mv.z);
  }
  if (walk) walk.paused = !moving;
  mixer?.update(dt);
  const z = yOf(metresAt(pos.x, pos.y) || 0);
  if (wizard) { wizard.position.set(pos.x, z, pos.y); wizard.rotation.y = facing; }
  // lead the view up the screen, so the buildings ahead keep their roofs in frame (?lead=0 to centre on the wizard)
  const lead = Number(q.get('lead') ?? 3.5);
  frame(new THREE.Vector3(pos.x - DOWN.x * lead, z + 1.2, pos.y - DOWN.z * lead));
  if (composer) composer.render(); else renderer.render(scene, cam);
  requestAnimationFrame(tick);
}
// a status line, so a slow or failed load says so (the models are 9-17 MB each)
const info = document.getElementById('info');
let done = 0;
const status = (t: string) => { if (info) info.textContent = t; console.log('[world3d]', t); };
for (const p of pending) p.then(() => { done++; status(`Loading models ${done}/${pending.length}...`); }, (e: unknown) => status(`A model failed to load: ${e instanceof Error ? e.message : String(e)}`));
status(`Loading models 0/${pending.length}... (about 55 MB)`);
Promise.all(pending).then(() => {
  (window as unknown as { __ready: boolean }).__ready = true;
  status('Ready. WASD or arrows to walk. ?view=24 wider, ?pitch=40 shallower, ?ao=0 no ambient occlusion.');
});
tick();
