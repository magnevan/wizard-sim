/**
 * Draws a compiled kit scene (tools/kit/compile.py) in three.js: floors, and every instance as its fitted Meshy model
 * where one exists (content/generated/meshy/kit/*.glb) or a plain placeholder of its exact size. Shared by the
 * greybox page (lab/kit3d.ts) and the map editor (editor/), so both draw the same pieces. Each piece's group carries
 * userData.inst (its index in compiled.instances) and each floor userData.floor, so a click can find its source.
 * Coordinates: three's x is the scene's x (u), z its y (u), y is height (u; metres * M).
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RAIL_MOD, railFit } from './kit-fit';
import { waterMesh } from './kit-water';
import { FOLIAGE_TIME, grow, type Recipe } from './foliage';

export type Inst = { p: string; x: number; y: number; x2?: number; y2?: number; h: number; low?: number; rot: number; len?: number; v?: string; dx?: number; dy?: number; n?: number; src?: string; e?: [number, number]; o?: string;
  /** per instance (scatters, dressing): size, a colour multiplied in, metres above h, and the parts chosen per slot */
  scale?: number; tint?: string; up?: number; parts?: Record<string, string> };
export type Floor = { t: string; id?: string; h: number; mat: string; polys: number[][][][] };
export type KitData = { G: number; size: [number, number]; floors: Floor[]; instances: Inst[] };

export const M = 1 / 0.6;                         // u per metre
export const yOf = (m: number) => m * M;

/** Lights, environment and the sun (move the sun with its target to follow the camera). */
export function setupStage(renderer: THREE.WebGLRenderer, scene: THREE.Scene): THREE.DirectionalLight {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  scene.background = new THREE.Color(0x1d2027);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.35;
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x5a5048, 0.9));
  const sun = new THREE.DirectionalLight(0xfff0dc, 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 200 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  return sun;
}

// greybox materials: one tone per role, so a join reads by shape, not by texture
const mat = (c: number, r = 0.9) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
const MAT = {
  paving: mat(0xc9c3b8), plaza: mat(0xbdb6aa), road: mat(0x8c8780), lawn: mat(0x8fa877), roof: mat(0x6d7489),
  wall: mat(0xd8d2c6), face: mat(0xb7aea0), coping: mat(0xe6e0d4), stone: mat(0xd2cabd), dark: mat(0x2d2a2c),
  wood: mat(0x8a6a4c), leaf: mat(0x6f8f55), metal: mat(0x3b3d42, 0.5), kerb: mat(0xd9d4ca),
} as const;
export const FLOOR: Record<string, THREE.Material> = { paving: MAT.paving, plaza: MAT.plaza, road: MAT.road, lawn: MAT.lawn, roof: MAT.roof, rock: mat(0x7d7468),
  deck: mat(0x9a7a58), water: mat(0x4f7f9c, 0.25),   // deck: timber (a quay, a bridge); water: the sea, a stream
  woods: mat(0x5f6e45), dirt: mat(0x8a7356), sand: mat(0xd6c49a) };   // the forest floor, a packed earth path, a beach
// props and set pieces have their own stone, so a decal on the ground never paints them
const PROP = { stone: mat(0xd2cabd), coping: mat(0xe6e0d4) };

// ---- a decal (kit.json class "decal": a picture on a footprint, placed like a set piece): projected straight down onto
// the ground under it, floors, steps, kerbs, walls' faces and copings, so it drapes over steps; clipped to its shape.
// One decal at a time (the plaza's disc). Its uniforms are shared by every receiving material, so setting them is enough.
const DECAL = {
  dcOn: { value: 0 }, dcTex: { value: null as THREE.Texture | null }, dcC: { value: new THREE.Vector2() },
  dcH: { value: new THREE.Vector2(1, 1) }, dcRot: { value: 0 }, dcRound: { value: 1 }, dcY: { value: new THREE.Vector2(-1e9, 1e9) },
};
/** Let a material take the decal (after any shader change it already makes). */
function decalable<T extends THREE.Material>(m: T): T {
  const prev = m.onBeforeCompile, key = m.customProgramCacheKey.bind(m);
  m.onBeforeCompile = (sh, r) => {
    prev.call(m, sh, r);
    Object.assign(sh.uniforms, DECAL);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vDcPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDcPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vDcPos;\nuniform float dcOn, dcRot, dcRound;\nuniform vec2 dcC, dcH, dcY;\nuniform sampler2D dcTex;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        if (dcOn > 0.5 && vDcPos.y >= dcY.x && vDcPos.y <= dcY.y) {   // only within its height band: never up a tall wall in its footprint
          vec2 dd = vDcPos.xz - dcC; float cr = cos(dcRot), sr = sin(dcRot);
          vec2 q = vec2(cr * dd.x + sr * dd.y, -sr * dd.x + cr * dd.y) / dcH;      // -1..1 across the footprint
          if (dcRound > 0.5 ? dot(q, q) <= 1.0 : max(abs(q.x), abs(q.y)) <= 1.0) {
            vec4 dc = texture2D(dcTex, vec2(q.x * 0.5 + 0.5, 0.5 - q.y * 0.5));       // the picture's top is north
            diffuseColor.rgb = mix(diffuseColor.rgb, dc.rgb, dc.a);
          }
        }`);
  };
  m.customProgramCacheKey = () => `${key()}|dc`;
  return m;
}
for (const m of [MAT.face, MAT.coping, MAT.stone, MAT.kerb, ...Object.values(FLOOR)]) decalable(m);
const decalUrls = import.meta.glob<string>('../../../../content/generated/textures/**/*.png', { eager: true, query: '?url', import: 'default' });
const decalTex: Record<string, Promise<THREE.Texture | null>> = {};
/** A decal's picture: kit.json's texture path (under content/generated/), or until it is made, textures/src/tex-<name>.png. */
function loadDecal(path: string): Promise<THREE.Texture | null> {
  return (decalTex[path] ??= (async () => {
    const base = '../../../../content/generated/', alt = path.replace(/^textures\/([^/]+)$/, 'textures/src/tex-$1');
    const url = decalUrls[base + path] ?? decalUrls[base + alt];
    if (!url) return null;
    const t = await new THREE.TextureLoader().loadAsync(url).catch(() => null);
    if (t) { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; }
    return t;
  })());
}
/** Put the scene's decal (or none) on the ground: every receiving material shows it at once. */
function setDecal(it: Inst | undefined) {
  const k = it && KIT_PIECES[it.p] as KitPiece & { texture?: string; reach?: number };
  if (!it || !k?.texture) { DECAL.dcOn.value = 0; return; }
  const [w, d] = k.footprint ?? [10, 10];
  DECAL.dcC.value.set(it.x, it.y); DECAL.dcH.value.set(w / 2, d / 2); DECAL.dcRound.value = k.shape === 'round' ? 1 : 0;
  DECAL.dcRot.value = it.rot - Math.PI / 2;   // its front (S by default) is the picture's bottom
  // from its floor up to reach (m; kit.json, default 0.5): steps within it take the picture, a tall wall in its footprint doesn't
  DECAL.dcY.value.set(yOf(it.h) - 0.05, yOf(it.h + (k.reach ?? 0.5)) + 0.05);
  loadDecal(k.texture).then((t) => { if (t) { DECAL.dcTex.value = t; DECAL.dcOn.value = 1; } });
}
export const isDecal = (p: string) => KIT_PIECES[p]?.class === 'decal';

/** The kit's pieces as tools/kit/kit.json describes them (the map editor fetches it): set pieces need their size. */
export type KitPiece = { class?: string; shape?: string; footprint?: [number, number]; height?: number; note?: string; stack?: string[]; parts?: Record<string, string[]>;
  /** a plant grown in code (lab/foliage.ts), with `box` [w, d, h] m for a stone trough or pot under it */
  grow?: Recipe & { box?: [number, number, number] } };
const KIT_PIECES: Record<string, KitPiece> = {};
export function setKitPieces(p: Record<string, KitPiece>) { Object.assign(KIT_PIECES, p); }
export const kitPiece = (p: string): KitPiece | undefined => KIT_PIECES[p];

// ---- made models: a fitted model (tools/kit/fit.py) replaces its placeholder wherever one exists ----
const artUrls = import.meta.glob<string>('../../../../content/generated/meshy/kit/*.glb', { eager: true, query: '?url', import: 'default' });
let ART: Record<string, THREE.Object3D> = {};
/** Load the fitted models once (skip it for pure greybox). */
export async function loadKitArt(): Promise<void> {
  const out: Record<string, THREE.Object3D> = {};
  await Promise.all(Object.entries(artUrls).map(([p, url]) => new GLTFLoader().loadAsync(url).then((g) => {
    g.scene.traverse((c) => { if ((c as THREE.Mesh).isMesh) c.castShadow = c.receiveShadow = true; });
    out[p.split('/').pop()!.replace('.glb', '')] = g.scene;
  })));
  ART = out;
  // the made ground pieces take a decal too (their materials are theirs alone)
  for (const n of ['retain-top', 'retain-course', 'tread', 'kerb', 'corner']) ART[n]?.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh) m.material = decalable((m.material as THREE.Material).clone()); });
  await loadTextures();
}

// ---- tiling textures (content/generated/textures/<name>.png, seamless): floors by their mat, and the plain stone of
// retaining walls (ashlar), kerbs and copings (kerb) and treads (tread), mapped in world space from all three axes, so a
// texture runs on across pieces with no seam. Without a texture, a part draws as before (a flat tone or its made model).
const texUrls = import.meta.glob<string>('../../../../content/generated/textures/*.png', { eager: true, query: '?url', import: 'default' });
const texTiles = import.meta.glob<Record<string, number>>('../../../../content/generated/textures/tiles.json', { eager: true, import: 'default' });
/** u per tile, by texture: tiles.json beside the textures overrides these. */
// (as tools/kit/textures.py makes them, TILE_U: paving 4, plaza 6, road 3, lawn 4)
const TILE: Record<string, number> = { paving: 4, plaza: 6, road: 3, lawn: 4, rock: 6, deck: 3, ashlar: 3, 'smooth-stone': 2, tread: 2, kerb: 2,
  water: 8, woods: 4, dirt: 3, sand: 4, ...(Object.values(texTiles)[0] ?? {}) };
/** Textures that drift on floors (tiles a second): water flows slowly. */
const FLOW: Record<string, [number, number]> = { water: [0.012, 0.007] };
const TP_TIME = { value: 0 };   // shared by every flowing texture; spinKit advances it each frame
const TEX: Record<string, THREE.MeshStandardMaterial> = {}, RAW: Record<string, THREE.Texture> = {};
async function loadTextures() {
  const loader = new THREE.TextureLoader();
  await Promise.all(Object.entries(texUrls).map(([p, url]) => loader.loadAsync(url).then((t) => {
    const name = p.split('/').pop()!.replace('.png', '');
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    TEX[name] = triplanar(t, TILE[name] ?? 4, FLOW[name]); RAW[name] = t;
  }).catch(() => undefined)));
  // one smooth stone serves treads, kerbs and copings, unless each has its own
  if (TEX['smooth-stone']) { TEX.tread ??= TEX['smooth-stone']; TEX.kerb ??= TEX['smooth-stone']; }
}
/** A material that samples tex by world position, blended over the three axes by the surface's facing. */
function triplanar(tex: THREE.Texture, tile: number, flow: [number, number] = [0, 0]): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: flow[0] || flow[1] ? 0.35 : 0.92 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.tpMap = { value: tex }; sh.uniforms.tpScale = { value: 1 / tile };
    sh.uniforms.tpFlow = { value: new THREE.Vector2(...flow) }; sh.uniforms.tpTime = TP_TIME;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vTpPos;\nvarying vec3 vTpNrm;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTpPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvTpNrm = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vTpPos;\nvarying vec3 vTpNrm;\nuniform sampler2D tpMap;\nuniform float tpScale, tpTime;\nuniform vec2 tpFlow;')
      .replace('#include <map_fragment>', `vec3 tpW = pow(abs(normalize(vTpNrm)), vec3(4.0)); tpW /= (tpW.x + tpW.y + tpW.z);
        vec4 tpC = texture2D(tpMap, vTpPos.zy * tpScale) * tpW.x + texture2D(tpMap, vTpPos.xz * tpScale + tpFlow * tpTime) * tpW.y + texture2D(tpMap, vTpPos.xy * tpScale) * tpW.z;
        diffuseColor *= tpC;`);
  };
  m.customProgramCacheKey = () => `tp${tile}`;
  return decalable(m);
}
/** A tiling texture's world-mapped material by name (paving, ashlar, smooth-stone...), once loadKitArt has run. */
export const kitMat = (name: string): THREE.Material | undefined => TEX[name];
/** The material for a floor of this mat: its texture if made, else its tone. */
const floorMat = (mat: string): THREE.Material => TEX[mat] ?? FLOOR[mat] ?? MAT.paving;

function box(g: THREE.Group, m: THREE.Material, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) {
  if (x1 - x0 <= 1e-4 || y1 - y0 <= 1e-4 || z1 - z0 <= 1e-4) return;
  const b = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), m);
  b.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  b.castShadow = b.receiveShadow = true;
  g.add(b);
}

/** A fitted model, placed in a piece's frame: moved, and stretched along x and y (u). */
function art(g: THREE.Group, name: string, x: number, y: number, sx = 1, sy = 1, s = 1): boolean {
  const a = ART[name]; if (!a) return false;
  const o = a.clone(); o.position.set(x, y, 0); o.scale.set(sx * s, sy * s, s); g.add(o);
  findSpinners(o);
  return true;
}

// ---- parts that turn: a made model's nodes named "spin…" with glTF extras {axis: [x, y, z] (local), rpm} (the armillary's rings) ----
const SPINNERS: { node: THREE.Object3D; rest: THREE.Quaternion; axis: THREE.Vector3; rpm: number }[] = [];
function findSpinners(o: THREE.Object3D) {
  o.traverse((n) => {
    if (!n.name.toLowerCase().startsWith('spin')) return;
    const ax = n.userData.axis as number[] | undefined, rpm = Number(n.userData.rpm ?? 1);
    const axis = new THREE.Vector3(...(Array.isArray(ax) && ax.length === 3 ? ax : [0, 1, 0])).normalize();
    if (axis.lengthSq() > 0 && Number.isFinite(rpm)) SPINNERS.push({ node: n, rest: n.quaternion.clone(), axis, rpm });
  });
}
const spinQ = new THREE.Quaternion();
/** Turn every spinning part to where it is at time t (seconds): call it each frame. */
export function spinKit(t: number) {
  TP_TIME.value = t;   // and flowing textures (water) drift
  FOLIAGE_TIME.value = t;   // and the wind in the plants
  for (const s of SPINNERS) s.node.quaternion.copy(s.rest).multiply(spinQ.setFromAxisAngle(s.axis, ((t * s.rpm) / 60) * Math.PI * 2));
}

/** A fitted model placed by a basis (x along, y up, z out): a non-orthogonal x shears it down a slope, balusters upright. */
function artBasis(g: THREE.Group, name: string, X: THREE.Vector3, Z: THREE.Vector3, P: THREE.Vector3): boolean {
  const a = ART[name]; if (!a) return false;
  const o = a.clone(); o.matrixAutoUpdate = false; o.matrix.makeBasis(X, new THREE.Vector3(0, 1, 0), Z).setPosition(P); g.add(o); return true;
}

// ---- pieces: each built in its own frame (x along the edge from its start, z out toward the lower side, y up) ----
function edgeFrame(it: Inst): THREE.Group {
  const g = new THREE.Group();
  const dx = (it.x2! - it.x) / it.len!, dy = (it.y2! - it.y) / it.len!;
  g.matrixAutoUpdate = false;
  g.matrix.makeBasis(new THREE.Vector3(dx, 0, dy), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-dy, 0, dx)).setPosition(it.x, 0, it.y);
  return g;
}
const COP = 0.15, COP_OUT = 0.12, PROUD = 0.05;   // coping: m tall, u overhang, m it stands above the floor it caps
function retain(g: THREE.Group, L: number, h: number, low: number) {
  box(g, TEX.ashlar ?? MAT.face, 0, L, yOf(low) - 0.4, yOf(h - COP), -0.45, 0);
  box(g, TEX.kerb ?? MAT.coping, 0, L, yOf(h - COP), yOf(h + PROUD), -0.5, COP_OUT);
}
function balustrade(g: THREE.Group, L: number, h: number, i0: number, i1 = i0) {
  const y0 = yOf(h), z0 = -0.36, z1 = -0.04;
  box(g, MAT.stone, i0, L - i1, y0, y0 + yOf(0.12), z0, z1);                         // the plinth
  box(g, MAT.stone, i0, L - i1, y0 + yOf(0.82), y0 + yOf(0.95), z0 - 0.03, z1 + 0.03);   // the rail
  const n = Math.max(1, Math.round((L - i0 - i1) / 0.32));
  for (let k = 0; k < n; k++) { const x = i0 + ((k + 0.5) * (L - i0 - i1)) / n; box(g, MAT.stone, x - 0.07, x + 0.07, y0 + yOf(0.12), y0 + yOf(0.82), -0.27, -0.13); }
}
/** The made balustrade between two piers' faces, in whole modules at nearly their own size (kit-fit.ts, railFit). */
function railModules(g: THREE.Group, x0: number, span: number, y: number): boolean {
  if (!ART.balustrade || span <= 0.05) return !!ART.balustrade;
  const f = railFit(span), start = x0 - (f.shown - span) / 2;
  for (let k = 0; k < f.n; k++) art(g, 'balustrade', start + k * RAIL_MOD * f.sx, y, f.sx);
  return true;
}
// the joints of the kit being built, by corner: a balustrade runs to its piers' faces (buildKit fills it)
const JOINTS = new Map<string, Inst>();
const jkey = (x: number, y: number) => `${Math.round(x * 1000)},${Math.round(y * 1000)}`;
const RAIL_Z = -0.2, PIER_HALF = 0.275, NEWEL_HALF = 0.275 * 1.25;
/**
 * How far along a section, from its end at corner (vx, vy) going in direction (dx, dy), its balustrade meets the face
 * of the pier there. A pier is square and turned to the bisector of its two sections, so on a bend its face is
 * oblique to each: a balustrade at depth RAIL_Z behind the front line meets it nearer on one side, further on the
 * other. On a straight run it is the pier's half-width, as before.
 */
function railInset(vx: number, vy: number, dx: number, dy: number, nx: number, ny: number): number {
  const j = JOINTS.get(jkey(vx, vy));
  if (!j || (j.p !== 'joint.pier' && j.p !== 'joint.newel')) return PIER_HALF;
  const half = j.p === 'joint.newel' ? NEWEL_HALF : PIER_HALF;
  const a: [number, number][] = [[Math.cos(j.rot), Math.sin(j.rot)], [-Math.sin(j.rot), Math.cos(j.rot)]];
  let [tx, ty] = a[0];
  if (Math.abs(a[1][0] * dx + a[1][1] * dy) > Math.abs(tx * dx + ty * dy)) [tx, ty] = a[1];   // the face this section meets
  const along = tx * dx + ty * dy, s = Math.sign(along) || 1;
  const x = (half - s * RAIL_Z * (tx * nx + ty * ny)) / Math.abs(along);
  return Math.max(0.05, Math.min(x, 1.2));
}
/** Steps along an edge (a short drop you can step over anywhere along it): treads of about 0.15 m, 0.5 u deep, out onto the lower side. */
function steps(g: THREE.Group, L: number, h: number, low: number) {
  const n = Math.max(2, Math.round((h - low) / 0.15)), rise = (h - low) / n;
  box(g, TEX.tread ?? MAT.face, 0, L, yOf(low) - 0.1, yOf(h), -0.06, 0);                         // the top riser, under the upper floor's edge
  for (let k = 1; k < n; k++) box(g, TEX.tread ?? (k % 2 ? MAT.stone : MAT.coping), 0, L, yOf(low) - 0.1, yOf(h - k * rise), (k - 1) * 0.5, k * 0.5);
}
function wall(g: THREE.Group, L: number, h: number, low: number, v?: string, door = false) {
  box(g, MAT.wall, 0, L, yOf(low) - 0.4, yOf(h), -0.6, 0);
  box(g, MAT.coping, 0, L, yOf(low) - 0.4, yOf(low) + yOf(0.5), -0.6, 0.08);              // a plinth course
  box(g, MAT.coping, 0, L, yOf(h) - yOf(0.35), yOf(h), -0.6, 0.15);                         // the cornice
  const mid = L / 2;
  if (door) { box(g, MAT.dark, mid - 0.7, mid + 0.7, yOf(low), yOf(low + 2.7), -0.1, 0.02); box(g, MAT.coping, mid - 0.9, mid + 0.9, yOf(low + 2.7), yOf(low + 3.0), -0.1, 0.1); }
  if (v === 'window') for (const fl of [low + 1.6, low + 4.6]) {
    box(g, MAT.dark, mid - 0.4, mid + 0.4, yOf(fl), yOf(fl + 1.5), -0.08, 0.02);
    box(g, MAT.coping, mid - 0.55, mid + 0.55, yOf(fl - 0.12), yOf(fl), -0.1, 0.12);
  }
}

function piece(it: Inst): THREE.Group | null {
  const [cls, kind, shape] = it.p.split('.');
  if (isDecal(it.p)) return null;   // a decal draws as a picture on the ground (setDecal), not as a piece
  if (cls === 'edge' || cls === 'sweep') {
    const g = edgeFrame(it), L = it.len!, low = it.low!;
    const drop = it.h - low;
    // a made retaining wall: its top course with the coping, then plain courses stacked down past the lower floor
    // (every other one mirrored, so the joints don't line up), never stretched
    let madeRetain = false;
    const niche = it.v === 'niche' && ART.niche;
    // (with an ashlar texture the wall is a plain shape wearing it, so its courses never repeat at a seam; a niche stays made)
    if ((kind === 'retain' || kind === 'parapet') && drop >= 0.3 && (!TEX.ashlar || niche) && art(g, niche ? 'niche' : 'retain-top', 0, yOf(it.h), L / 2)) {
      madeRetain = true;
      if (TEX.ashlar) box(g, TEX.ashlar, 0, L, yOf(low) - 0.4, yOf(it.h) - 2.0, -0.45, 0);   // under a niche: the textured wall, as beside it
      else for (let y = yOf(it.h) - (niche ? 2.0 : 1.1), k = 0; y > yOf(low) - 0.4; y -= 0.78, k++) {
        if (k % 2) art(g, 'retain-course', L, y, -L / 2); else art(g, 'retain-course', 0, y, L / 2);
      }
    }
    if (kind === 'retain') { if (!madeRetain) retain(g, L, it.h, low); }
    else if (kind === 'parapet') {
      if (!madeRetain) retain(g, L, it.h, low);
      // pier face to pier face: on a straight run 0.275 at each end; on a bend, where the turned pier's face is
      const dx = (it.x2! - it.x) / L, dy = (it.y2! - it.y) / L, nx = -dy, ny = dx;
      const i0 = railInset(it.x, it.y, dx, dy, nx, ny), i1 = railInset(it.x2!, it.y2!, -dx, -dy, nx, ny);
      if (!railModules(g, i0, L - i0 - i1, yOf(it.h + 0.05))) balustrade(g, L, it.h, i0, i1);
    }
    else if (kind === 'kerb') { if (TEX.kerb || !art(g, 'kerb', 0, yOf(it.h), L / 2)) box(g, TEX.kerb ?? MAT.kerb, 0, L, yOf(low) - 0.1, yOf(it.h), -0.32, 0); }
    else if (kind === 'wall') wall(g, L, it.h, low, it.v, shape === 'door');
    else if (kind === 'steps') steps(g, L, it.h, low);   // edge.steps.straight / .chamfer and sweep.steps
    return g;
  }
  if (cls === 'joint') {
    const g = new THREE.Group(); g.position.set(it.x, 0, it.y); g.rotation.y = -it.rot;
    const y = yOf(it.h);
    if ((kind === 'pier' || kind === 'newel') && art(g, 'pier', 0, y, 1, 1, kind === 'newel' ? 1.25 : 1)) return g;
    if (kind === 'pier') { box(g, MAT.stone, -0.275, 0.275, y, y + yOf(1.08), -0.275, 0.275); box(g, MAT.coping, -0.33, 0.33, y + yOf(1.08), y + yOf(1.2), -0.33, 0.33); }
    if (kind === 'newel') {
      box(g, MAT.stone, -0.35, 0.35, y - 0.2, y + yOf(1.25), -0.35, 0.35); box(g, MAT.coping, -0.42, 0.42, y + yOf(1.25), y + yOf(1.4), -0.42, 0.42);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.26, 20, 14), MAT.stone); ball.position.y = y + yOf(1.4) + 0.24; ball.castShadow = true; g.add(ball);
    }
    if (kind === 'corner' && art(g, 'corner', 0, y + yOf(PROUD))) return g;
    if (kind === 'corner') box(g, MAT.coping, -0.36, 0.36, y - yOf(COP), y + yOf(PROUD + 0.04), -0.36, 0.36);
    if (kind === 'pilaster') box(g, MAT.coping, -0.3, 0.3, yOf(it.low ?? it.h - 7) - 0.4, y - yOf(0.35), -0.3, 0.3);
    return g;
  }
  if (cls === 'connector') {
    // a flight: treads from the head out, and a cheek wall each side whose coping follows the steps
    const g = new THREE.Group(), L = it.len!, n = it.n!, W = Math.hypot(it.x2! - it.x, it.y2! - it.y);
    const ax = (it.x2! - it.x) / W, ay = (it.y2! - it.y) / W, ox = it.dx!, oy = it.dy!;
    g.matrixAutoUpdate = false;   // local: x across (head start to end), z out along the flight, y up
    g.matrix.makeBasis(new THREE.Vector3(ax, 0, ay), new THREE.Vector3(0, 1, 0), new THREE.Vector3(ox, 0, oy)).setPosition(it.x, 0, it.y);
    const rise = (it.h - it.low!) / n, go = L / n;
    // the head sill: the terrace's edge stone across the flight (a row of made treads level with the terrace, if made)
    // treads: made tread modules, unless there is a tread texture: then plain steps wearing it, one texture across all
    const madeTreads = !!ART.tread && !TEX.tread, treadMat = TEX.tread ?? MAT.stone;
    if (madeTreads) { for (let m = -0.6; m < W + 0.6 - 0.01; m += (W + 1.2) / Math.ceil((W + 1.2) / 2)) { art(g, 'tread', m, yOf(it.h) + 0.01, (W + 1.2) / Math.ceil((W + 1.2) / 2) / 2); g.children[g.children.length - 1].position.z = 0.0; } }
    else box(g, TEX.tread ?? MAT.coping, -0.6, W + 0.6, yOf(it.h - rise) - 0.1, yOf(it.h + PROUD * 0.4), -0.45, 0.05);
    for (let k = 0; k < n; k++) {
      const top = yOf(it.h - (k + 1) * rise);
      box(g, treadMat, 0, W, yOf(it.low!) - 0.4, madeTreads ? top - 0.3 : top, k * go, (k + 1) * go);
      if (madeTreads && k < n - 1) { for (let m = 0; m + 1.99 < W; m += 2) art(g, 'tread', m, top, 1, 1); g.children.slice(-Math.round(W / 2)).forEach((o) => { o.position.z = (k + 1) * go - 0.06; }); }
      else if (!TEX.tread) box(g, MAT.coping, 0, W, top - 0.05, top, k * go - 0.05, k * go + 0.08);   // a nosing (a textured tread shows its own edge)
    }
    const sl = yOf(it.h - it.low!) / L, topAt = (z: number) => yOf(it.h + 0.1) - sl * z;
    // the cheek walls: made courses (retain-top, retain-course) unless there is an ashlar texture, then a plain wall
    // wearing it; the balustrade and its piers on top are made whenever they exist
    const madeRails = !!(ART.balustrade && ART.pier);
    const madeWalls = madeRails && !!(ART['retain-top'] && ART['retain-course']) && !TEX.ashlar;
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? -0.6 : W, x1 = x0 + 0.6, cx = x0 + 0.3, Z = new THREE.Vector3(side, 0, 0);
      // left (side -1) runs from the head down; right runs from the foot up, so neither side is mirrored inside out
      const along = (z0: number, z1: number, len: number) => (side < 0 ? new THREE.Vector3(0, -sl, 1) : new THREE.Vector3(0, sl, -1)).multiplyScalar((z1 - z0) / len);
      const start = (z0: number, z1: number) => (side < 0 ? z0 : z1);
      if (madeWalls) {
        const nm = Math.max(1, Math.ceil(L / 2)), lm = L / nm;
        for (let i = 0; i < nm; i++) {
          const z0 = i * lm, z1 = z0 + lm, zs = start(z0, z1), wx = side < 0 ? x0 + 0.06 : x0 + 0.54;
          artBasis(g, 'retain-top', along(z0, z1, 2), Z, new THREE.Vector3(wx, topAt(zs), zs));
          for (let y = topAt(zs) - 1.1; y > yOf(it.low!) - 1.6 - sl * lm; y -= 0.78) artBasis(g, 'retain-course', along(z0, z1, 2), Z, new THREE.Vector3(wx, y, zs));
        }
      } else {
        // a plain cheek: up to the coping line under the rails (or a solid parapet, 0.9 m, without them)
        const cap = madeRails ? 0.1 : 0.9;
        const prof = new THREE.Shape([new THREE.Vector2(0, yOf(it.low!) - 0.4), new THREE.Vector2(L + 0.1, yOf(it.low!) - 0.4), new THREE.Vector2(L + 0.1, yOf(it.low! + cap) - sl * 0.1), new THREE.Vector2(0, yOf(it.h + cap))]);
        const cheek = new THREE.Mesh(new THREE.ExtrudeGeometry(prof, { depth: 0.6, bevelEnabled: false }), TEX.ashlar ?? MAT.face); cheek.castShadow = cheek.receiveShadow = true;
        // the profile is drawn in (out, up); turn it so its x runs along the flight (local z) and its depth across (local x)
        cheek.rotation.y = -Math.PI / 2; cheek.position.set(x1, 0, 0);
        g.add(cheek);
        const len = Math.hypot(L + 0.1, yOf(it.h - it.low!)), cop = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.16, len), TEX.kerb ?? MAT.coping);
        cop.position.set((x0 + x1) / 2, (yOf(it.h + cap) + yOf(it.low! + cap) - sl * 0.1) / 2 + 0.02, (L + 0.1) / 2);
        cop.rotation.x = Math.atan2(yOf(it.h - it.low!), L + 0.1); cop.castShadow = true; g.add(cop);
      }
      if (!madeRails) continue;
      const nb = Math.max(1, Math.round(L / 1.75)), lb = L / nb;
      for (let i = 0; i < nb; i++) {
        const z0 = i * lb + 0.15, z1 = (i + 1) * lb - 0.15, zs = start(z0, z1);
        // Z (the model's depth axis) points out (side): its middle depth -0.2 lands on the cheek wall's line, cx, from cx + side*0.2
        artBasis(g, 'balustrade', along(z0, z1, 1.45), Z, new THREE.Vector3(cx + side * 0.2, topAt(zs) + yOf(0.05), zs));
        if (i > 0) { const pz = i * lb; art(g, 'pier', cx, topAt(pz) - 0.1, 1, 1, 0.85); g.children[g.children.length - 1].position.z = pz; }
      }
      art(g, 'pier', cx, yOf(it.low!), 1, 1, 1.25); g.children[g.children.length - 1].position.z = L - 0.4;   // the newel at the foot
    }
    return g;
  }
  if (cls === 'setpiece') {
    // a unique made piece on its footprint (a tower, the armillary): its model if made, else a stone stand-in of its
    // footprint and height (kit.json, given by setKitPieces) on a slightly wider plinth
    // (built from its floor up, at the group's origin, so an instance's scale grows it from where it stands)
    const g = new THREE.Group(), y = 0;
    g.position.set(it.x, yOf(it.h + (it.up ?? 0)), it.y); g.rotation.y = Math.atan2(Math.cos(it.rot), Math.sin(it.rot));   // local +z is the front
    const k = KIT_PIECES[it.p] ?? { shape: 'box', footprint: [2, 2], height: 4 };
    if (k.grow) return growInto(g, k.grow, seedOf(it), y);
    if (art(g, kind, 0, y)) return g;
    const [w, d] = k.footprint ?? [2, 2], H = yOf(k.height ?? 4), P = yOf(0.35);
    const solid = (sx: number, sz: number, y0: number, y1: number, m: THREE.Material) => {
      if (k.shape === 'round') {
        const c = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, y1 - y0, 40), m);
        c.scale.set(sx, 1, sz); c.position.y = (y0 + y1) / 2; c.castShadow = c.receiveShadow = true; g.add(c);
      } else box(g, m, -sx / 2, sx / 2, y0, y1, -sz / 2, sz / 2);
    };
    solid(w * 1.12, d * 1.12, y - 0.1, y + P, PROP.coping);              // the plinth
    solid(w, d, y + P, y + H, PROP.stone);                                // the body
    solid(w * 1.06, d * 1.06, y + H - yOf(0.3), y + H, PROP.coping);      // a cornice, so its top reads
    box(g, MAT.dark, -Math.min(w, 1.4) / 2, Math.min(w, 1.4) / 2, y + P, y + P + Math.min(H * 0.4, yOf(2.6)), d / 2 - 0.05, d / 2 + 0.02);   // a door: its front
    return g;
  }
  if (cls === 'dress') return dressPiece(it, kind);
  if (cls === 'vine') return vinePiece(it);
  if (cls === 'vignette') {
    const g = new THREE.Group(), y = yOf(it.h);
    g.position.set(it.x, 0, it.y); g.rotation.y = Math.atan2(Math.cos(it.rot), Math.sin(it.rot));   // local +z is the front
    if (kind === 'bench-planter') {
      box(g, MAT.wood, -1.0, 1.0, y + yOf(0.4), y + yOf(0.47), -0.3, 0.3); box(g, MAT.wood, -1.0, 1.0, y + yOf(0.47), y + yOf(0.9), -0.35, -0.27);
      for (const sx of [-0.85, 0.85]) box(g, MAT.metal, sx - 0.05, sx + 0.05, y, y + yOf(0.4), -0.25, 0.25);
      for (const sx of [-1.55, 1.55]) {
        box(g, PROP.stone, sx - 0.4, sx + 0.4, y, y + yOf(0.6), -0.4, 0.4);
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), MAT.leaf); b.position.set(sx, y + yOf(0.6) + 0.35, 0); b.castShadow = true; g.add(b);
      }
    }
    if (kind === 'lamp') {
      box(g, MAT.metal, -0.08, 0.08, y, y + yOf(3.0), -0.08, 0.08); box(g, MAT.metal, -0.2, 0.2, y, y + yOf(0.3), -0.2, 0.2);
      box(g, new THREE.MeshStandardMaterial({ color: 0xffe2a8, emissive: 0xffc870, emissiveIntensity: 0.6 }), -0.18, 0.18, y + yOf(3.0), y + yOf(3.45), -0.18, 0.18);
    }
    return g;
  }
  return null;
}

// a floor's sides, down to the ground, in rock: where an edge has no piece (an 'open' edge: a cliff, a bank) this is
// what shows; elsewhere the edge's piece stands in front of it (the offset keeps a wall face drawn over a side in its plane)
const SIDE = decalable(new THREE.MeshStandardMaterial({ color: 0x7d7468, roughness: 0.95, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 }));
/** The rock texture for floors' sides, with the same offset so a wall's face still draws over a side in its plane. */
let sideTex: THREE.MeshStandardMaterial | null = null;
const SIDE_TEX = () => {
  if (!TEX.rock) return null;
  if (!sideTex) { sideTex = TEX.rock.clone(); sideTex.onBeforeCompile = TEX.rock.onBeforeCompile; sideTex.customProgramCacheKey = TEX.rock.customProgramCacheKey; sideTex.side = THREE.DoubleSide; sideTex.polygonOffset = true; sideTex.polygonOffsetFactor = 2; sideTex.polygonOffsetUnits = 2; }
  return sideTex;
};
function sides(rings: number[][][], top: number, bottom: number): THREE.Mesh | null {
  if (top - bottom < 0.02) return null;
  const pos: number[] = [];
  for (const ring of rings) for (let i = 0; i < ring.length; i++) {
    const [ax, ay] = ring[i], [bx, by] = ring[(i + 1) % ring.length];
    if (ax === bx && ay === by) continue;
    pos.push(ax, top, ay, bx, top, by, bx, bottom, by, ax, top, ay, bx, bottom, by, ax, bottom, ay);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  const m = new THREE.Mesh(g, SIDE_TEX() ?? SIDE); m.castShadow = m.receiveShadow = true;
  return m;
}

// ---- dressing (kit.json class "dress": small pieces placed by a style's rules): urns, lanterns, planters, lamps ----
/** An element's colour, for a banner's stand-in until its cloth and emblem texture are made. */
const EMBLEM: Record<string, number> = { fire: 0xd8553a, cold: 0xdcecf4, water: 0x3f7fc8, life: 0x5aa851, shield: 0xd8b24a, arcane: 0x8a5ac8, earth: 0x8a6a44 };
const bannerUrls = import.meta.glob<string>('../../../../content/generated/textures/banner-*.png', { eager: true, query: '?url', import: 'default' });
const bannerTex: Record<string, THREE.Texture> = {};
function bannerMap(emblem: string): THREE.Texture | null {
  const url = bannerUrls[`../../../../content/generated/textures/banner-${emblem}.png`];
  if (!url) return null;
  if (!bannerTex[emblem]) { const t = new THREE.TextureLoader().load(url); t.colorSpace = THREE.SRGBColorSpace; bannerTex[emblem] = t; }
  return bannerTex[emblem];
}
/** A stand-in of a footprint and height (u, world y), round or box, from y0. */
function standIn(g: THREE.Group, shape: string | undefined, w: number, d: number, y0: number, h: number, m: THREE.Material) {
  if (shape === 'round') { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, h, 24), m); c.scale.set(w, 1, d); c.position.y = y0 + h / 2; c.castShadow = c.receiveShadow = true; g.add(c); }
  else box(g, m, -w / 2, w / 2, y0, y0 + h, -d / 2, d / 2);
}
/** A stacked part's stand-in by slot: its share of the piece's width and height, and its shape. */
const SLOT: Record<string, [number, number, string]> = { pot: [0.8, 0.35, 'box'], plant: [1, 0.65, 'round'], post: [0.15, 0.82, 'round'], lantern: [0.45, 0.18, 'box'] };
/** The top of what a group holds, in its own space (where the next stacked part goes). */
function topOf(g: THREE.Group): number {
  if (!g.children.length) return 0;
  g.updateMatrixWorld(true);
  const inv = g.matrixWorld.clone().invert(), b = new THREE.Box3();
  for (const c of g.children) b.union(new THREE.Box3().setFromObject(c).applyMatrix4(inv));
  return b.max.y;
}
/**
 * A dress piece: its made model (<name>.glb) if there is one; else, for a piece of parts, each slot's part (<part>.glb)
 * stacked on the one before; a banner wears its emblem's texture on its cloth; anything not made yet, a stand-in.
 */
function dressPiece(it: Inst, kind: string): THREE.Group {
  const g = new THREE.Group(), k = KIT_PIECES[it.p] ?? {};
  g.position.set(it.x, yOf(it.h + (it.up ?? 0)), it.y); g.rotation.y = Math.atan2(Math.cos(it.rot), Math.sin(it.rot));
  const [w, d] = k.footprint ?? [0.8, 0.8], H = yOf(k.height ?? 1);
  if (art(g, kind, 0, 0)) return g;
  const parts = it.parts ?? {}, stack = k.stack ?? Object.keys(parts);
  if (kind === 'banner') {
    const map = bannerMap(String(parts.emblem ?? ''));
    if (art(g, String(parts.cloth ?? 'banner-cloth'), 0, 0)) {
      if (map) g.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh) { const mm = (m.material as THREE.MeshStandardMaterial).clone(); mm.map = map; mm.needsUpdate = true; m.material = mm; } });
      return g;
    }
    box(g, MAT.dark, -0.04, 0.04, 0, H, -0.04, 0.04);                                         // its pole
    const cloth = map ? new THREE.MeshStandardMaterial({ map, roughness: 0.9, side: THREE.DoubleSide }) : mat(EMBLEM[String(parts.emblem)] ?? 0xb0a090);
    box(g, cloth, -w / 2, w / 2, H * 0.35, H * 0.95, 0.05, 0.1);
    return g;
  }
  if (stack.length) {
    for (const slot of stack) {
      const part = String(parts[slot] ?? ''), y0 = topOf(g);
      if (art(g, part, 0, y0)) continue;
      if (PLANT_PARTS[part]) { growInto(g, PLANT_PARTS[part], seedOf(it), y0); continue; }
      // a stand-in in the slot's proportions (share of the width, share of the height, shape) until the part is made
      const [sw, sh, shape] = SLOT[slot] ?? [1, 1 / stack.length, 'box'];
      standIn(g, shape, w * sw, d * sw, y0, H * sh, slot === 'post' ? MAT.dark : PROP.stone);
    }
    return g;
  }
  standIn(g, k.shape, w, d, 0, H, PROP.stone);
  return g;
}
// ---- plants grown in code (lab/foliage.ts): set pieces with a "grow" recipe, a planter's plant, and vines on walls ----
const seedOf = (it: Inst) => Math.round(it.x * 131 + it.y * 977 + it.h * 53 + (it.x2 ?? 0) * 17);
/** A planter's plant part, grown until (unless) a model is made for it. */
const PLANT_PARTS: Record<string, Recipe> = {
  'plant-topiary': { kind: 'cone', h: 1.2, r: 0.3 }, 'plant-cypress': { kind: 'cone', h: 1.7, r: 0.26 },
  'plant-flowers': { kind: 'bed', w: 0.7, d: 0.7, h: 0.45, back: 0, blooms: ['pink', 'white', 'lilac'] },
  'plant-blossom': { kind: 'bush', r: 0.42, pal: ['green', 'gold'], bloom: { pal: 'pink', amount: 0.8 } },
};
/** Grow a recipe into g at height y0 (u): a stone trough of its `box` first, if it has one, then the plant on its soil. */
function growInto(g: THREE.Group, recipe: Recipe & { box?: [number, number, number] }, seed: number, y0: number): THREE.Group {
  let y = y0;
  if (recipe.box) {
    const [bw, bd, bh] = recipe.box.map(yOf), stone = TEX['smooth-stone'] ?? PROP.stone, lip = yOf(0.04);
    box(g, stone, -bw / 2, bw / 2, y0, y0 + bh, -bd / 2, bd / 2);
    box(g, stone, -bw / 2 - lip, bw / 2 + lip, y0 + bh - yOf(0.09), y0 + bh + yOf(0.02), -bd / 2 - lip, bd / 2 + lip);
    box(g, TEX.dirt ?? MAT.wood, -bw / 2 + lip * 2, bw / 2 - lip * 2, y0 + bh, y0 + bh + yOf(0.03), -bd / 2 + lip * 2, bd / 2 - lip * 2);
    y = y0 + bh + yOf(0.03);
  }
  const f = grow(recipe, seed); f.scale.setScalar(M); f.position.y = y; g.add(f);
  return g;
}
// ---- vines (kit.json class "vine", placed by dress rules on wall faces): painted cards, never stretched with the wall ----
type VinePiece = KitPiece & { texture?: string; sheet?: string; size_m?: number | number[]; cells?: [number, number]; spacing_m?: number };
const vineUrls = import.meta.glob<string>('../../../../content/generated/textures/vine-*.png', { eager: true, query: '?url', import: 'default' });
const vineTex: Record<string, THREE.Texture | null> = {};
function vineTexture(path?: string): THREE.Texture | null {
  if (!path) return null;
  if (!(path in vineTex)) {
    const url = vineUrls[`../../../../content/generated/${path}`];
    vineTex[path] = url ? new THREE.TextureLoader().load(url) : null;
    if (vineTex[path]) { vineTex[path]!.colorSpace = THREE.SRGBColorSpace; vineTex[path]!.wrapS = THREE.RepeatWrapping; vineTex[path]!.anisotropy = 4; }
  }
  return vineTex[path];
}
const vineMats = new Map<string, THREE.Material>();
/** A vine's material: its painting with its alpha (cut, not blended, so it sorts and shadows like a solid), or a green stand-in. */
function vineMat(tex: THREE.Texture | null, tint?: string, strip = false): THREE.Material {
  const key = `${tex?.uuid ?? 'none'}|${tint ?? ''}|${strip}`;
  let m = vineMats.get(key);
  if (!m) {
    m = tex ? new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.95 })
      : new THREE.MeshStandardMaterial({ color: 0x4f7f3a, side: THREE.DoubleSide, roughness: 0.95, transparent: true, opacity: 0.75 });
    if (tint && /^#[0-9a-f]{6}$/i.test(tint)) (m as THREE.MeshStandardMaterial).color.multiply(new THREE.Color(tint));
    if (strip) {
      // a strip fades out over its last 0.6 m at a clump's ends (aEdge: metres to each faded end), the edge's line
      // broken up by the painting itself (sampled elsewhere) and by its own light and dark, so strands end at different places and
      // no straight cut shows where a run of vine starts or stops
      m.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aEdge;\nvarying vec2 vEdge;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEdge = aEdge;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vEdge;')
          .replace('#include <alphatest_fragment>', `{
            float rag = 0.0;
            #ifdef USE_MAP
              // the painting itself, sampled elsewhere, as the edge's noise: its leaves and gaps make the line organic
              vec4 nz = texture2D(map, vMapUv * vec2(0.37, 0.61) + vec2(0.41, 0.17));
              rag = (nz.a * 0.6 + dot(nz.rgb, vec3(0.333)) * 0.4 - 0.45) * 0.7;   // metres
            #endif
            diffuseColor.a *= clamp((min(vEdge.x, vEdge.y) + rag) / 0.6 + (dot(diffuseColor.rgb, vec3(0.333)) - 0.35) * 0.6, 0.0, 1.0);
          }
          #include <alphatest_fragment>`);
      };
      m.customProgramCacheKey = () => 'vine-strip';
    }
    vineMats.set(key, m);
  }
  return m;
}
/** A small seeded random stream, so a vine is the same every time it is drawn. */
function seeded(...ns: number[]) {
  let a = ns.reduce((h, n) => Math.imul(h ^ Math.round(n * 1000), 2654435761) >>> 0, 0x9e3779b9);
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/**
 * A vine on a wall section (x, y to x2, y2; its front, the lower side, to the right): a strip hangs from the coping
 * `len` m down, the painting at its real size (1 m across per metre of wall, repeating; its top at the coping, cut, not
 * stretched), shifted by `offset`, mirrored by `flip`, its foot leaning out a little; a grown vine is cluster stamps
 * from a sheet along its `paths` ([s, z] m along the wall and down from the coping), two abreast for the first third.
 */
function vinePiece(it: Inst & { len?: number; flip?: boolean; offset?: number; paths?: number[][][]; fade_l?: boolean; fade_r?: boolean }): THREE.Group {
  const k = (KIT_PIECES[it.p] ?? {}) as VinePiece;
  const L = Math.hypot(it.x2! - it.x, it.y2! - it.y), dx = (it.x2! - it.x) / L, dy = (it.y2! - it.y) / L;
  const g = new THREE.Group(); g.matrixAutoUpdate = false;   // x along the wall, z out of its face, y up (as edgeFrame)
  g.matrix.makeBasis(new THREE.Vector3(dx, 0, dy), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-dy, 0, dx)).setPosition(it.x, 0, it.y);
  const top = yOf(it.h - 0.15), pos: number[] = [], uv: number[] = [], idx: number[] = [];
  if (k.grow?.kind === 'cascade') {
    // grown in code: a cascade as wide as the section, hanging as far as the strip would, or as its longest path
    const wallDrop = Math.max(0.3, it.h - (it.low ?? it.h - 3) - 0.3);
    const drop = Math.min(wallDrop, it.paths ? Math.max(0.6, ...it.paths.flat().map((p) => p[1])) : it.len ?? 1.5);
    const f = grow({ ...k.grow, w: (L / M) * 0.96, drop }, seedOf(it)); f.scale.setScalar(M); f.position.set(L / 2, top, 0); g.add(f);
    return g;
  }
  const quad = (pts: number[][], uvs: number[][]) => { const b = pos.length / 3; for (const p of pts) pos.push(...p); for (const t of uvs) uv.push(...t); idx.push(b, b + 1, b + 2, b, b + 2, b + 3); };
  if (it.paths) {
    const sheet = vineTexture(k.sheet), [cx, cy] = k.cells ?? [4, 3], size = yOf(Array.isArray(k.size_m) ? k.size_m[0] : k.size_m ?? 0.3) * (it.scale ?? 1);
    const step = yOf(k.spacing_m ?? 0.18), rnd = seeded(it.x, it.y, it.x2!, it.y2!);
    for (const path of it.paths) {
      // resample the path every step: the stamps go along it evenly however it was drawn
      const P = path.map(([s, z]) => [yOf(s), top - yOf(z)]), lens = P.slice(1).map((p, i) => Math.hypot(p[0] - P[i][0], p[1] - P[i][1])), total = lens.reduce((a, b) => a + b, 0);
      for (let t = 0; t <= total + 1e-6; t += step) {
        let r = t, i = 0; while (i < lens.length - 1 && r > lens[i]) { r -= lens[i]; i++; }
        const f = lens[i] ? Math.min(1, r / lens[i]) : 0, px = P[i][0] + ((P[i + 1]?.[0] ?? P[i][0]) - P[i][0]) * f, py = P[i][1] + ((P[i + 1]?.[1] ?? P[i][1]) - P[i][1]) * f;
        for (const side of t < total / 3 ? [-0.3, 0.3] : [0]) {   // thicker near the top: two abreast
          const cell = Math.floor(rnd() * cx * cy), u0 = (cell % cx) / cx, v0 = 1 - (Math.floor(cell / cx) + 1) / cy;
          const a = (rnd() - 0.5) * (Math.PI / 3), s = size * (0.85 + rnd() * 0.3) / 2, fl = rnd() < 0.5, ca = Math.cos(a) * s, sa = Math.sin(a) * s;
          const ox = px + side * size, z = 0.035 + rnd() * 0.03, corner = (u: number, v: number) => [ox + u * ca - v * sa, py + u * sa + v * ca, z];
          const U0 = fl ? u0 + 1 / cx : u0, U1 = fl ? u0 : u0 + 1 / cx;
          quad([corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)], [[U0, v0], [U1, v0], [U1, v0 + 1 / cy], [U0, v0 + 1 / cy]]);
        }
      }
    }
    if (pos.length) g.add(new THREE.Mesh(vineGeo(pos, uv, idx), vineMat(sheet, it.tint)));
    return g;
  }
  // a strip: across the section, from the coping down len m (at most the painting's height), at its real size
  const tex = vineTexture(k.texture), [tw, th] = Array.isArray(k.size_m) ? k.size_m : [1, 3];
  const hang = Math.min(it.len ?? 1.5, th, Math.max(0.2, it.h - (it.low ?? it.h - 3) - 0.2)), H = yOf(hang), Wm = L / yOf(1);
  const off = (it.offset ?? 0) * tw, u0 = off / tw, u1 = (off + Wm) / tw, v1 = 1 - hang / th;
  const [U0, U1] = it.flip ? [-u0, -u1] : [u0, u1], lean = 0.1;
  quad([[0, top - H, 0.03 + lean], [L, top - H, 0.03 + lean], [L, top, 0.03], [0, top, 0.03]], [[U0, v1], [U1, v1], [U1, 1], [U0, 1]]);
  // metres to each faded end of its clump (fade_l: its start is the clump's first, fade_r: its end the last); far otherwise
  const far = 99, el = it.fade_l ? 0 : far, er = it.fade_r ? 0 : far, wl = it.fade_l ? Wm : far, wr = it.fade_r ? Wm : far;
  const edge = [el, wr, wl, er, wl, er, el, wr];   // per corner, in quad's order: (left, right) metres
  g.add(new THREE.Mesh(vineGeo(pos, uv, idx, edge), vineMat(tex, it.tint, true)));
  return g;
}
function vineGeo(pos: number[], uv: number[], idx: number[], edge?: number[]) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  if (edge) geo.setAttribute('aEdge', new THREE.Float32BufferAttribute(edge, 2));
  geo.setIndex(idx); geo.computeVertexNormals();
  return geo;
}

/** An instance's tint ('#rrggbb', multiplying its colours): materials cloned once per tint, shared by every instance with it. */
const tinted = new Map<string, THREE.Material>();
function tintGroup(g: THREE.Object3D, tint: string) {
  if (!/^#[0-9a-f]{6}$/i.test(tint) || tint.toLowerCase() === '#ffffff') return;
  const c = new THREE.Color(tint);
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const tintOne = (src: THREE.Material) => {
      const key = `${src.uuid}|${tint}`;
      let t = tinted.get(key);
      if (!t) { t = src.clone(); const tc = (t as THREE.MeshStandardMaterial).color; if (tc) tc.multiply(c); tinted.set(key, t); }
      return t;
    };
    m.material = Array.isArray(m.material) ? m.material.map(tintOne) : tintOne(m.material);
  });
}

/** The floors and pieces of a compiled scene, as one group. */
export function buildKit(data: KitData): THREE.Group {
  const root = new THREE.Group();
  JOINTS.clear(); SPINNERS.length = 0;
  setDecal(data.instances.find((i) => isDecal(i.p)));
  for (const it of data.instances) if (it.p.startsWith('joint.')) JOINTS.set(jkey(it.x, it.y), it);
  const bottom = yOf(Math.min(0, ...data.floors.map((f) => f.h)) - 0.4);
  for (const f of data.floors) for (const [outer, ...holes] of f.polys) {
    const sd = sides([outer, ...holes], yOf(f.h), bottom); if (sd) root.add(sd);
    const s = new THREE.Shape(outer.map(([x, y]) => new THREE.Vector2(x, -y)));
    for (const h of holes) s.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, -y))));
    const m = new THREE.Mesh(new THREE.ShapeGeometry(s), floorMat(f.mat));
    m.rotation.x = -Math.PI / 2; m.position.y = yOf(f.h); m.receiveShadow = true;
    m.userData.floor = f;
    root.add(m);
    // water: stylised and moving, all in code (kit-water.ts); the flat floor stays, hidden, for picking and painting
    if (f.mat === 'water') { m.visible = false; root.add(waterMesh([outer, ...holes], yOf(f.h), data.size, TP_TIME)); }
  }
  data.instances.forEach((it, i) => {
    const g = piece(it);
    if (!g) return;
    if (it.scale && it.scale !== 1) g.scale.multiplyScalar(it.scale);
    if (it.tint && !it.p.startsWith('vine.')) tintGroup(g, it.tint);   // (a vine takes its tint in its own material)
    g.userData.inst = i;
    root.add(g);
  });
  return root;
}

/** The dark ground beyond the scene, a little below everything. */
export function groundPlane(data: KitData): THREE.Mesh {
  const g = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), mat(0x2a2d33));
  g.rotation.x = -Math.PI / 2;
  g.position.set(data.size[0] / 2, yOf(Math.min(0, ...data.floors.map((f) => f.h)) - 0.4), data.size[1] / 2);
  g.receiveShadow = true;
  return g;
}

/** Dispose a group's own geometries (materials, and the fitted models' geometry that clones share, are kept). */
export function disposeKit(g: THREE.Object3D) {
  const shared = new Set<THREE.BufferGeometry>();
  for (const a of Object.values(ART)) a.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) shared.add(m.geometry); });
  g.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.geometry && !shared.has(m.geometry)) m.geometry.dispose(); });
}
