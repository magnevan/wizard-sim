/**
 * Laid stone floors painted live (docs/explorations/2026-11-24-road-stones.md): tools/kit/tess_layout.py lays a
 * scene's road and paving stone by stone (the settled pattern, version E) into content/generated/layouts/<scene>-stones.json,
 * and the floor shader draws each stone from that: exact outlines with rounded corners at any zoom, no repeat, no seam.
 *
 * The stones go to the GPU as two data textures:
 *  - the table, 8 texels a stone: its middle and row direction, its half-sizes, corner radius, corner count, material
 *    and wear, then up to 12 corners of its core (the stone drawn in by half a joint plus its corner radius);
 *  - the grid, 0.5 u cells over the scene, each listing up to 8 stones that reach into it.
 * A fragment looks up its cell, takes the stone it is deepest inside (distance to the core less the radius), and
 * paints it as tess_proof.py does: a tone from the palette varied per stone, painted grain from a Codex sheet laid
 * along the stone, mortar in the joints, and a bevel, here lit by the scene's own light through the normal.
 * Weathered materials (WEATHERED) add a third, small texture: how worn the ground is round each cell.
 */
import * as THREE from 'three';

type Stone = { m: string; h: number; q: number[][]; r: number; c: number[]; t: number; a: number; b: number; w?: number; x?: number };
/** How a material's stones are painted (tess_proof.py LAY). */
type MatPaint = { pal: number[][]; jointc: number[]; tone: number; bevel: number; joint: number; grain: number; sheet: string };
type Layout = { v: number; mats: Record<string, MatPaint>; stones: Stone[] };
type Sheet = { cols: number; rows: number; n: number };

const layoutUrls = import.meta.glob<string>('../../../../content/generated/layouts/*-stones.json', { query: '?url', import: 'default', eager: true });
const sheetUrls = import.meta.glob<string>(['../../../../content/generated/textures/src/stones-sett.png', '../../../../content/generated/textures/src/stones-weathered.png'], { query: '?url', import: 'default', eager: true });
const SHEETS = Object.values(import.meta.glob<Record<string, Sheet>>('../../../../content/generated/textures/src/stones.json', { eager: true, import: 'default' }))[0] ?? {};

const PER = 8, ROW = 128, MAXV = 12, CELL = 0.5, CANDS = 8;
const MORTAR = 0.012;   // u: added to each joint, so it reads at the game camera
/** The materials laid stone by stone, in the order the shader numbers them. */
export const STONE_MATS = ['road', 'cobble', 'weathered'];
/** Each laid material's sheet of painted stones (textures/src/stones-<sheet>.png; tess_proof.py LAY's `sheet`). */
const MAT_SHEET: Record<string, string> = { road: 'sett', cobble: 'sett', weathered: 'weathered' };
/**
 * Weathered materials: old paving going back to the garden. Their stones are chipped and stained (more where the
 * layout's wear w is high), grass and moss grow in the joints and creep over the stones' rims, and where stones are
 * missing (tess_layout.py leaves them out: along the paving's edge onto lawn, in patches of trodden earth, a few
 * anywhere) the floor's own tile (packed earth) shows, going over to the lawn's own texture toward the lawn, so the
 * paving frays out into the grass with no seam.
 */
export const WEATHERED = new Set(['weathered']);
const sheetOf = (m: string): Sheet => SHEETS[MAT_SHEET[m]] ?? { cols: 6, rows: 4, n: 24 };

/** Shared by every laid floor's material: set by loadStones, read by the shader. */
export const STONE_U = {
  stOn: { value: 0 }, stTab: { value: null as THREE.Texture | null }, stGrid: { value: null as THREE.Texture | null },
  stGridO: { value: new THREE.Vector2() }, stGridN: { value: new THREE.Vector2() },
  /** How weathered the ground is round each grid cell (0 to 1, filtered): the stones' wear, spread over the gaps. */
  stWear: { value: null as THREE.Texture | null },
  /** The lawn's tile and its size in u (kit-render sets them), for weathered floors fraying into grass. */
  stLawn: { value: null as THREE.Texture | null }, stLawnS: { value: 4 },
  /** 1 when the lawn is the meadow, which varies over the ground (LAWN_VARY). */
  stLawnV: { value: 0 },
};
/** Per material: its palette (linear), joint colour, tone, bevel and grain, and its sheet of painted stones with each cell's mean. */
export const STONE_PAINT: Record<string, { pal: { value: THREE.Vector3[] }; joint: { value: THREE.Vector3 }; k: { value: THREE.Vector4 }; sheet: { value: THREE.Texture | null }; mean: { value: THREE.Vector3[] } }> = {};
for (const m of STONE_MATS) {
  STONE_PAINT[m] = { pal: { value: Array.from({ length: 6 }, () => new THREE.Vector3(1, 1, 1)) }, joint: { value: new THREE.Vector3(0.3, 0.3, 0.3) }, k: { value: new THREE.Vector4(0.06, 0.035, 0.7, 0) },
    sheet: { value: null }, mean: { value: Array.from({ length: sheetOf(m).n }, () => new THREE.Vector3(1, 1, 1)) } };
}
const SHEET_TEX: Record<string, Promise<{ tex: THREE.Texture; mean: THREE.Vector3[] }>> = {};

const lin = (c: number[]) => { const k = new THREE.Color().setRGB(c[0] / 255, c[1] / 255, c[2] / 255, THREE.SRGBColorSpace); return new THREE.Vector3(k.r, k.g, k.b); };

/** Each sheet cell's mean colour (as the proof divides by it), from the picture itself. */
async function sheetMeans(tex: THREE.Texture, SHEET: Sheet): Promise<THREE.Vector3[]> {
  const img = tex.image as HTMLImageElement, cv = document.createElement('canvas');
  cv.width = img.width; cv.height = img.height;
  const cx = cv.getContext('2d')!; cx.drawImage(img, 0, 0);
  const px = cx.getImageData(0, 0, cv.width, cv.height).data, cw = cv.width / SHEET.cols, ch = cv.height / SHEET.rows, out: THREE.Vector3[] = [];
  for (let k = 0; k < SHEET.n; k++) {
    const x0 = (k % SHEET.cols) * cw, y0 = Math.floor(k / SHEET.cols) * ch; let r = 0, g = 0, b = 0, n = 0;
    for (let y = Math.floor(y0); y < y0 + ch; y += 2) for (let x = Math.floor(x0); x < x0 + cw; x += 2) { const i = (y * cv.width + x) * 4; r += px[i]; g += px[i + 1]; b += px[i + 2]; n++; }
    out.push(lin([r / n, g / n, b / n]));
  }
  return out;
}

/**
 * Load a scene's laid stones (none: its floors keep their tiles): from the map editor's server when given (it lays
 * them again after each edit), else as built with the page.
 */
export async function loadStones(scene: string, server = false): Promise<boolean> {
  const url = server ? `/__map/stones?name=${scene}` : Object.entries(layoutUrls).find(([p]) => p.endsWith(`/${scene}-stones.json`))?.[1];
  const res = url ? await fetch(url).catch(() => null) : null;
  if (!res?.ok) { STONE_U.stOn.value = 0; return false; }
  const L = await res.json() as Layout;
  const st = L.stones.filter((s) => STONE_MATS.includes(s.m) && s.q.length >= 3 && s.q.length <= MAXV);
  // the table
  const rows = Math.ceil(st.length / ROW), tab = new Float32Array(ROW * PER * rows * 4);
  st.forEach((s, i) => {
    const o = ((Math.floor(i / ROW) * ROW * PER) + (i % ROW) * PER) * 4;
    // (the last value packs the corner count, the material * 32 and the wear, in 32 steps, * 1024)
    tab.set([s.c[0], s.c[1], Math.cos(s.t), Math.sin(s.t), s.a, s.b, s.r, s.q.length + 32 * STONE_MATS.indexOf(s.m) + 1024 * Math.round((s.w ?? 0) * 31)], o);
    s.q.forEach((p, k) => { tab[o + 8 + k * 2] = p[0]; tab[o + 9 + k * 2] = p[1]; });
  });
  const tabT = new THREE.DataTexture(tab, ROW * PER, rows, THREE.RGBAFormat, THREE.FloatType);
  // the grid: every stone listed in each cell its outline (and its joint) reaches
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of st) for (const p of s.q) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
  x0 -= 1; y0 -= 1;
  const nx = Math.ceil((x1 + 1 - x0) / CELL), ny = Math.ceil((y1 + 1 - y0) / CELL);
  const lists: number[][] = Array.from({ length: nx * ny }, () => []);
  st.forEach((s, i) => {
    const pad = s.r + 0.06;
    const xs = s.q.map((p) => p[0]), ys = s.q.map((p) => p[1]);
    const cx0 = Math.floor((Math.min(...xs) - pad - x0) / CELL), cx1 = Math.floor((Math.max(...xs) + pad - x0) / CELL);
    const cy0 = Math.floor((Math.min(...ys) - pad - y0) / CELL), cy1 = Math.floor((Math.max(...ys) + pad - y0) / CELL);
    for (let y = cy0; y <= cy1; y++) for (let x = cx0; x <= cx1; x++) lists[y * nx + x].push(i);
  });
  const grid = new Float32Array(nx * 2 * ny * 4);
  let over = 0;
  lists.forEach((l, k) => {
    if (l.length > CANDS) {   // too many: keep those whose middles are nearest the cell's
      over++;
      const mx = x0 + ((k % nx) + 0.5) * CELL, my = y0 + (Math.floor(k / nx) + 0.5) * CELL;
      l.sort((a, b) => Math.hypot(st[a].c[0] - mx, st[a].c[1] - my) - Math.hypot(st[b].c[0] - mx, st[b].c[1] - my));
    }
    const x = k % nx, y = Math.floor(k / nx);
    for (let j = 0; j < Math.min(l.length, CANDS); j++) grid[((y * nx * 2) + x * 2 + (j >> 2)) * 4 + (j & 3)] = l[j] + 1;
  });
  if (over) console.warn(`[stones] ${scene}: ${over} cells hold more than ${CANDS} stones`);
  const gridT = new THREE.DataTexture(grid, nx * 2, ny, THREE.RGBAFormat, THREE.FloatType);
  for (const t of [tabT, gridT]) { t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true; }
  const wearT = wearField(st, L.stones.filter((s) => s.x && WEATHERED.has(s.m)), lists, new THREE.Vector2(x0, y0), nx, ny);
  // the painted grain: each sheet loaded once
  for (const m of STONE_MATS) {
    const name = MAT_SHEET[m], sheetUrl = Object.entries(sheetUrls).find(([p]) => p.endsWith(`/stones-${name}.png`))?.[1];
    if (!sheetUrl || STONE_PAINT[m].sheet.value) continue;
    SHEET_TEX[name] ??= new THREE.TextureLoader().loadAsync(sheetUrl).then(async (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
      return { tex, mean: await sheetMeans(tex, sheetOf(m)) };
    });
    const S = await SHEET_TEX[name];
    STONE_PAINT[m].sheet.value = S.tex; STONE_PAINT[m].mean.value = S.mean;
  }
  for (const m of STONE_MATS) {
    const P = L.mats[m]; if (!P) continue;
    STONE_PAINT[m].pal.value = P.pal.map(lin); STONE_PAINT[m].joint.value = lin(P.jointc);
    STONE_PAINT[m].k.value.set(P.tone, P.bevel, P.grain, 0);
  }
  // (the editor loads them again after each edit: the old ones are let go)
  STONE_U.stTab.value?.dispose(); STONE_U.stGrid.value?.dispose(); STONE_U.stWear.value?.dispose();
  STONE_U.stTab.value = tabT; STONE_U.stGrid.value = gridT; STONE_U.stWear.value = wearT;
  STONE_U.stGridO.value.set(x0, y0); STONE_U.stGridN.value.set(nx, ny);
  STONE_U.stOn.value = 1;
  return true;
}

/**
 * How weathered the ground is round each grid cell, for weathered floors: the mean wear of the weathered stones listed
 * in it, spread into the cells that have none (gaps, and past the paving's edge, climbing toward 1 as it goes), then
 * softened once. A small byte texture, filtered, so it varies smoothly under the shader.
 */
function wearField(st: Stone[], holes: Stone[], lists: number[][], o: THREE.Vector2, nx: number, ny: number): THREE.DataTexture {
  let f = new Float32Array(nx * ny).fill(-1);
  const sum = new Float32Array(nx * ny), cnt = new Float32Array(nx * ny);
  lists.forEach((l, k) => { for (const i of l) if (WEATHERED.has(st[i].m)) { sum[k] += st[i].w ?? 0; cnt[k]++; } });
  for (const s of holes) {   // a missing stone counts in every cell it would have covered
    const R = Math.max(s.a, s.b);
    for (let y = Math.floor((s.c[1] - R - o.y) / CELL); y <= Math.floor((s.c[1] + R - o.y) / CELL); y++) {
      for (let x = Math.floor((s.c[0] - R - o.x) / CELL); x <= Math.floor((s.c[0] + R - o.x) / CELL); x++) {
        if (x >= 0 && y >= 0 && x < nx && y < ny) { sum[y * nx + x] += s.w ?? 0; cnt[y * nx + x]++; }
      }
    }
  }
  for (let k = 0; k < nx * ny; k++) if (cnt[k]) f[k] = sum[k] / cnt[k];
  for (let it = 0; it < 8; it++) {
    const g = f.slice();
    for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
      if (f[y * nx + x] >= 0) continue;
      let s = 0, n = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const X = x + dx, Y = y + dy;
        if (X >= 0 && Y >= 0 && X < nx && Y < ny && f[Y * nx + X] >= 0) { s += f[Y * nx + X]; n++; }
      }
      if (n) g[y * nx + x] = Math.min(1, s / n + 0.15);
    }
    f = g;
  }
  const out = new Uint8Array(nx * ny * 4);
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    let s = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const X = x + dx, Y = y + dy;
      if (X >= 0 && Y >= 0 && X < nx && Y < ny) { const v = f[Y * nx + X]; s += v < 0 ? 1 : v; n++; }
    }
    out[(y * nx + x) * 4] = Math.round((s / n) * 255);
  }
  const t = new THREE.DataTexture(out, nx, ny, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.magFilter = t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true;
  return t;
}

/**
 * The meadow's broad change over the ground (2026-11-27, the user: the lawn "very rough", a flat bright lime): the
 * painted tile (meadow.png) a little less saturated, drifting between straw-warm and cool blue-green over about 20 u,
 * with lusher darker patches and a soft light-and-dark mottle, so a large lawn never reads as one flat colour. The
 * meadow floor (kit-render.ts) and the weathered paving's fray into it (below) both run it, so their edge has no seam.
 */
export const LAWN_VARY = `
float lwH(vec2 q) { return fract(sin(dot(q, vec2(127.1, 311.7))) * 43758.5453); }
float lwN(vec2 x) { vec2 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(lwH(i), lwH(i + vec2(1.0, 0.0)), f.x), mix(lwH(i + vec2(0.0, 1.0)), lwH(i + vec2(1.0, 1.0)), f.x), f.y); }
vec3 lawnVary(vec3 c, vec2 p) {
  float big = lwN(p * 0.045) * 0.6 + lwN(p * 0.11 + 7.3) * 0.4, mid = lwN(p * 0.17 + 3.1) * 0.7 + lwN(p * 0.5 + 9.0) * 0.3;
  c = mix(vec3(dot(c, vec3(0.3, 0.59, 0.11))), c, 0.78);
  c *= mix(vec3(0.8, 0.95, 1.0), vec3(1.18, 1.05, 0.7), smoothstep(0.28, 0.78, big));
  c *= mix(vec3(1.0), vec3(0.66, 0.82, 0.7), smoothstep(0.48, 0.8, mid));
  return c * (0.84 + 0.3 * lwN(p * 0.8 + 1.7));
}
`;

/** The fragment shader's declarations for a laid floor (matId: its place in STONE_MATS). */
export const stoneDecl = (matId: number) => `${WEATHERED.has(STONE_MATS[matId]) ? LAWN_VARY : ''}
uniform float stOn; uniform sampler2D stTab, stGrid, stSheet${WEATHERED.has(STONE_MATS[matId]) ? ', stWear, stLawn; uniform float stLawnS, stLawnV' : ''}; uniform vec2 stGridO, stGridN;
uniform vec3 stMean[${sheetOf(STONE_MATS[matId]).n}]; uniform vec3 stPal[6]; uniform vec3 stJoint; uniform vec4 stK;
vec3 stNrm = vec3(0.0, 1.0, 0.0); float stLaid = 0.0;
float stHash(float n) { return fract(sin(n * 12.9898 + 78.233) * 43758.5453); }
// soft value noise for broad change over the ground (as the proof's patches)
float stNoise(vec2 x) { vec2 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  float a = stHash(i.x + i.y * 57.0), b = stHash(i.x + 1.0 + i.y * 57.0), c = stHash(i.x + (i.y + 1.0) * 57.0), d = stHash(i.x + 1.0 + (i.y + 1.0) * 57.0);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y); }
vec4 stTx(float i, int k) { int ii = int(i); return texelFetch(stTab, ivec2((ii % ${ROW}) * ${PER} + k, ii / ${ROW}), 0); }
// signed distance from p to stone i's core (negative inside), and the outward direction from its nearest edge
float stSd(vec2 p, float i, int n, out vec2 dir) {
  float d = 1e9, s = 1.0; vec2 best = vec2(0.0);
  vec4 t = stTx(i, 2 + (n - 1) / 2); vec2 vj = ((n - 1) & 1) == 0 ? t.xy : t.zw;
  for (int k = 0; k < ${MAXV}; k++) {
    if (k >= n) break;
    vec4 tk = stTx(i, 2 + k / 2); vec2 vi = (k & 1) == 0 ? tk.xy : tk.zw;
    vec2 e = vj - vi, w = p - vi, b = w - e * clamp(dot(w, e) / dot(e, e), 0.0, 1.0);
    float bb = dot(b, b); if (bb < d) { d = bb; best = b; }
    bvec3 c = bvec3(p.y >= vi.y, p.y < vj.y, e.x * w.y > e.y * w.x);
    if (all(c) || all(not(c))) s = -s;
    vj = vi;
  }
  dir = s * best / max(sqrt(d), 1e-6);
  return s * sqrt(d);
}
`;

/** The fragment code, after the tile's colour is in diffuseColor: paints a laid floor's stones over it (matId: its place in STONE_MATS). */
export const stoneFrag = (matId: number) => {
  const SHEET = sheetOf(STONE_MATS[matId]), weath = WEATHERED.has(STONE_MATS[matId]);
  return `
  if (stOn > 0.5 && tpW.y > 0.6) {
    vec2 p = vTpPos.xz;
    ivec2 cell = ivec2(floor((p - stGridO) / ${CELL.toFixed(2)}));
    float bestE = 1e9, bestI = -1.0; vec2 bestDir = vec2(0.0);
    if (cell.x >= 0 && cell.y >= 0 && float(cell.x) < stGridN.x && float(cell.y) < stGridN.y) {
      for (int j = 0; j < 2; j++) {
        vec4 ids = texelFetch(stGrid, ivec2(cell.x * 2 + j, cell.y), 0);
        for (int c = 0; c < 4; c++) {
          float id = ids[c] - 1.0; if (id < 0.0) continue;
          vec4 h1 = stTx(id, 1); float meta = h1.w;
          if (mod(floor(meta / 32.0), 32.0) != ${matId}.0) continue;
          vec2 dir; float e = stSd(p, id, int(mod(meta, 32.0)), dir) - h1.z;
          if (e < bestE) { bestE = e; bestI = id; bestDir = dir; }
        }
      }
    }${weath ? `
    // the ground between and round the stones: the tile's trodden earth, going over to the lawn where the paving frays out
    float wf = texture2D(stWear, (p - stGridO) / (${CELL.toFixed(2)} * stGridN)).r;
    float gN = stNoise(p * 1.1) * 0.45 + stNoise(p * 3.7 + 11.0) * 0.35 + stNoise(p * 9.0 + 5.0) * 0.2;
    vec3 lawnC = texture2D(stLawn, p / stLawnS).rgb;
    if (stLawnV > 0.5) lawnC = lawnVary(lawnC, p);
    vec3 earth = mix(vec3(dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11))), diffuseColor.rgb, 0.75) * vec3(0.9, 0.86, 0.82);   // (the painting is more orange than the stones)
    vec3 ground = mix(earth, lawnC, smoothstep(0.35, 0.65, wf + (gN - 0.5) * 0.8));
    diffuseColor.rgb = ground;
    float sw = 0.0;
    if (bestI >= 0.0) {
      sw = floor(stTx(bestI, 1).w / 1024.0) / 31.0;
      bestE += (stNoise(p * 9.0 + bestI) - 0.4) * (0.025 + 0.09 * sw);          // chipped, uneven rims: more on worn stones
      bestE += smoothstep(0.7, 1.05, wf + (gN - 0.5) * 0.7) * 0.3;              // grass growing over them toward the lawn
    }` : ''}
    if (bestI >= 0.0 && bestE < 0.12) {
      stLaid = 1.0;
      vec4 h0 = stTx(bestI, 0), h1 = stTx(bestI, 1);
      // its tone: a palette colour, lighter or darker and a little warmer or cooler, as in the proof
      float r1 = stHash(bestI), r2 = stHash(bestI + 17.0), r3 = stHash(bestI + 31.0), r4 = stHash(bestI + 47.0);
      vec3 pal = stPal[int(r1 * 5.999)];
      float lum = 1.0 + (r2 * 2.0 - 1.0) * stK.x, warm = (r3 * 2.0 - 1.0) * stK.x * 0.5;
      vec3 col = pal * lum * vec3(1.0 + warm, 1.0, 1.0 - warm);
      // painted grain: one cell of the sheet laid along the stone, as a multiplier round 1
      vec2 d = p - h0.xy;
      vec2 uv = clamp(vec2(dot(d, h0.zw) / h1.x, dot(d, vec2(-h0.w, h0.z)) / h1.y) * 0.42 + 0.5, 0.04, 0.96);
      float fl = floor(r4 * 4.0);
      if (mod(fl, 2.0) > 0.5) uv.x = 1.0 - uv.x;
      if (fl > 1.5) uv.y = 1.0 - uv.y;
      int cellN = int(stHash(bestI + 61.0) * ${SHEET.n}.0 - 0.001);
      vec2 suv = (vec2(float(cellN % ${SHEET.cols}), float(cellN / ${SHEET.cols})) + uv) / vec2(${SHEET.cols}.0, ${SHEET.rows}.0);
      vec3 tex = texture2D(stSheet, vec2(suv.x, 1.0 - suv.y)).rgb;
      col *= 1.0 + (tex / max(stMean[cellN], vec3(0.01)) - 1.0) * stK.z;
      col *= 1.0 + 0.07 * (stNoise(p / 1.6) * 2.0 - 1.0);   // broad, soft change over the ground
      // the joint, and the bevel: depth into the stone, rounded over across stK.y
      // (the joint a little wider than the cut's, so it reads at the game camera as the proof's does)
      float depth = -bestE - ${MORTAR.toFixed(3)}, aa = fwidth(bestE) * 1.2 + 0.002, wb = stK.y * 1.8;
      float k = smoothstep(-aa, aa, depth);
      float ao = 0.84 + 0.16 * clamp(depth / (wb * 1.6), 0.0, 1.0);${weath ? `
      // stains, then moss creeping in over the rim in patches (more on worn stones and toward the lawn)
      float mn = stNoise(p * 5.0 + 3.0) * 0.6 + stNoise(p * 1.6) * 0.4;
      col *= 1.0 - 0.2 * smoothstep(0.45, 0.9, stNoise(p * 2.7 + 7.0)) * (0.4 + 0.6 * sw);
      vec3 moss = mix(lawnC, vec3(dot(lawnC, vec3(0.3, 0.59, 0.11))), 0.35) * vec3(0.66, 0.76, 0.5);
      float rim = 1.0 - clamp(depth / 0.1, 0.0, 1.0);
      col = mix(col, moss, 0.85 * smoothstep(0.5, 0.8, mn + 0.4 * max(sw, wf)) * rim);
      // the joint: dark earth, or grass and moss in patches, fading out into the ground past the stone
      vec3 jointC = mix(ground * 0.42, moss * 0.85, smoothstep(0.38, 0.6, mn + wf * 0.5));
      jointC = mix(jointC, ground, smoothstep(0.03, 0.12, bestE));
      diffuseColor.rgb = mix(jointC, col * ao, k);` : `
      diffuseColor.rgb = mix(stJoint, col * ao, k);`}
      float bev = clamp(depth / wb, 0.0, 1.0);
      float slope = k * (1.0 - bev) * (1.0 - bev) * 2.2;   // steepest at the stone's edge, flat on its face
      stNrm = normalize(vec3(bestDir.x * slope, 1.0, bestDir.y * slope));
    }
  }
`;
};
