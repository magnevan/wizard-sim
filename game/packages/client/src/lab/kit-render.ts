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
import { fallMesh } from './kit-fall';
import { pipeMesh, type PipeMats, type PipeRun } from './kit-pipe';
import { glyphMaterial, glyphPick, glyphScene, stepGlyphs, type GlyphRun } from './kit-glyph';
import { waterMesh } from './kit-water';
import { clearInlays, flowInlays, inlayInto, type InlaySpec } from './kit-inlay';
import { FOLIAGE_TIME, grow, groundShade, type Recipe } from './foliage';
import { cageOvergrowth, clearOvergrowth, overgrowthSlot, pathOvergrowth, stepOvergrowth, type OvergrowthSpec } from './overgrowth';
import { smokeMesh, type SmokeSpec } from './kit-smoke';
import { kerbRows, KERB_ROUND, KERB_W, type KerbSeg } from './kit-road';
import { LAWN_VARY, STONE_MATS, STONE_PAINT, STONE_U, WEATHERED, stoneDecl, stoneFrag } from './kit-stones';
import { buildGround, cloudify, GROUND_U, setGroundArt } from './kit-ground';

export type Inst = { p: string; x: number; y: number; x2?: number; y2?: number; h: number; low?: number; rot: number; len?: number; v?: string; dx?: number; dy?: number; n?: number; src?: string; e?: [number, number]; o?: string; ox?: number; oy?: number;
  /** a fall's lip (fall.curtain): its line in u, the lower water on the right */
  pts?: number[][];
  /** per instance (scatters, dressing): size, a colour multiplied in, metres above h, and the parts chosen per slot */
  scale?: number; tint?: string; up?: number; parts?: Record<string, string>;
  /** a worn path's width (u) */
  w?: number };
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
    const alt = path.replace(/^textures\/([^/]+)$/, 'textures/src/tex-$1');
    const url = urlOf(path, decalUrls) ?? urlOf(alt, decalUrls);
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
  /** a plant grown in code (lab/foliage.ts), with `box` [w, d, h] m for a stone trough or pot under it, or `soil` [w, d] m of bare earth (a field) */
  grow?: Recipe & { box?: [number, number, number]; soil?: [number, number] };
  /** a made tree's shade: a soft dark patch this many m across on the ground under it (darker grass under trees) */
  shade?: number;
  /** vines grown in code round its made structure (lab/overgrowth.ts: the infirmary's well), cut back at run time by setOvergrowth */
  overgrowth?: OvergrowthSpec;
  /** smoke from its flue (lab/kit-smoke.ts: the battery's stack) */
  smoke?: SmokeSpec };
const KIT_PIECES: Record<string, KitPiece> = {};
export function setKitPieces(p: Record<string, KitPiece>) { Object.assign(KIT_PIECES, p); }
export const kitPiece = (p: string): KitPiece | undefined => KIT_PIECES[p];

// ---- made models: a fitted model (tools/kit/fit.py) replaces its placeholder wherever one exists ----
const artUrls = import.meta.glob<string>('../../../../content/generated/meshy/kit/*.glb', { eager: true, query: '?url', import: 'default' });
let ART: Record<string, THREE.Object3D> = {};
/**
 * Art handed in by a page that chooses what to load (the 3D game, view3d/kit-assets.ts): `urls` by path under
 * content/generated/ ('meshy/kit/pier.glb', 'textures/ashlar.png'), and the models and tiling textures loadKitArt loads
 * (by name), so a scene loads only what it uses; a later call adds to what earlier ones loaded. Unset (the editor, the
 * labs): every original, as before.
 */
let GIVEN: { urls: Record<string, string>; models: string[]; textures: string[] } | null = null;
/** Hand in what loadKitArt should load (see GIVEN), before calling it; null goes back to every original. */
export function useKitArt(given: typeof GIVEN) { GIVEN = given; }
/** A URL by its path under content/generated/: from what was given, or (nothing given) the original from `globbed`. */
const urlOf = (path: string, globbed: Record<string, string>) => (GIVEN ? GIVEN.urls[path] : globbed[`../../../../content/generated/${path}`]);
/** Load the fitted models once (skip it for pure greybox). */
export async function loadKitArt(): Promise<void> {
  const out: Record<string, THREE.Object3D> = {};
  const models = GIVEN ? GIVEN.models.flatMap((n) => (!ART[n] && GIVEN!.urls[`meshy/kit/${n}.glb`] ? [[`${n}.glb`, GIVEN!.urls[`meshy/kit/${n}.glb`]]] : [])) : Object.entries(artUrls);
  await Promise.all(models.map(([p, url]) => new GLTFLoader().loadAsync(url).then((g) => {
    g.scene.traverse((c) => { if ((c as THREE.Mesh).isMesh) c.castShadow = c.receiveShadow = true; });
    out[p.split('/').pop()!.replace('.glb', '')] = g.scene;
  })));
  ART = GIVEN ? { ...ART, ...out } : out;
  // the made ground pieces take a decal too (their materials are theirs alone)
  for (const n of ['retain-top', 'retain-course', 'tread', 'kerb', 'corner']) out[n]?.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh) m.material = decalable((m.material as THREE.Material).clone()); });
  await loadTextures();
}

// ---- tiling textures (content/generated/textures/<name>.png, seamless): floors by their mat, and the plain stone of
// retaining walls (ashlar), kerbs and copings (kerb) and treads (tread), mapped in world space from all three axes, so a
// texture runs on across pieces with no seam. Without a texture, a part draws as before (a flat tone or its made model).
const texUrls = import.meta.glob<string>('../../../../content/generated/textures/*.png', { eager: true, query: '?url', import: 'default' });
const texTiles = import.meta.glob<Record<string, number>>('../../../../content/generated/textures/tiles.json', { eager: true, import: 'default' });
/** Textures that dress walls, steps and props, not floors. */
const NOT_FLOOR = /^(ashlar|smooth-stone|tread|kerb|plaza-disc|magic-flow|tiles|vine-.*|banner-.*|brass|pipe-.*|glyph-.*|foliage-.*)$/;
/**
 * The floor materials a level can have, for the editor: the flat tones, and every texture (in the textures folder or
 * in tiles.json) that isn't for walls, steps or props, so a new texture shows up as a floor on its own.
 */
export function floorMats(): string[] {
  const named = [...Object.keys(texUrls).map((p) => p.split('/').pop()!.replace('.png', '')), ...Object.keys(Object.values(texTiles)[0] ?? {})];
  return [...new Set([...Object.keys(FLOOR), ...named.filter((n) => !NOT_FLOOR.test(n))])].sort();
}
/** u per tile, by texture: tiles.json beside the textures overrides these. */
// (as tools/kit/textures.py makes them, TILE_U: paving 4, plaza 6, road 3, lawn 4)
const TILE: Record<string, number> = { paving: 4, plaza: 6, road: 9, lawn: 4, rock: 6, deck: 3, ashlar: 3, 'smooth-stone': 2, tread: 2, kerb: 2,
  water: 8, woods: 4, dirt: 3, sand: 4, ...(Object.values(texTiles)[0] ?? {}) };
/** Textures that drift on floors (tiles a second): water flows slowly. */
const FLOW: Record<string, [number, number]> = { water: [0.012, 0.007] };
/** Switches for trying things out (kit3d's URL): `kerb` draws kerbs as blocks (kit-road.ts), kerbW u wide, their corners kerbRound round. */
export const KIT_OPTS = { kerb: true, kerbW: KERB_W, kerbRound: KERB_ROUND };
const TP_TIME = { value: 0 };   // shared by every flowing texture; spinKit advances it each frame
/**
 * Floors that vary over a long distance, so a tile's repeat doesn't show as a grid: the tile's own colour, read again
 * blurred at about a seventh of its scale and turned, lightens and darkens the ground in broad soft patches that never
 * line up with the tiles (how strongly: 0 none, 1 as far as the tile itself varies, more exaggerates it).
 */
const MACRO: Record<string, number> = { road: 2.2 };
/** A tone multiplied into a floor's texture (the road's painting came out pinker than the court's warm brown). */
const TONE: Record<string, number> = { road: 0xf4d9b0 };
/** Floors that drift in colour over the ground (kit-stones.ts LAWN_VARY): the meadow. */
const VARY = new Set(['meadow']);
const JOINT = mat(0x6a584a);   // a kerb piece under its blocks (a click target only)
const TEX: Record<string, THREE.MeshStandardMaterial> = {}, RAW: Record<string, THREE.Texture> = {};
async function loadTextures() {
  const loader = new THREE.TextureLoader();
  const texs = GIVEN ? GIVEN.textures.flatMap((n) => (!TEX[n] && GIVEN!.urls[`textures/${n}.png`] ? [[`${n}.png`, GIVEN!.urls[`textures/${n}.png`]]] : [])) : Object.entries(texUrls);
  await Promise.all(texs.map(([p, url]) => loader.loadAsync(url).then((t) => {
    const name = p.split('/').pop()!.replace('.png', '');
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    TEX[name] = triplanar(t, TILE[name] ?? 4, FLOW[name], true, MACRO[name] ?? 0, STONE_MATS.indexOf(name), VARY.has(name)); RAW[name] = t;
    if (TONE[name]) TEX[name].color.setHex(TONE[name]);
  }).catch(() => undefined)));
  // one smooth stone serves treads, kerbs and copings, unless each has its own
  if (TEX['smooth-stone']) { TEX.tread ??= TEX['smooth-stone']; TEX.kerb ??= TEX['smooth-stone']; }
  // weathered paving frays out into the lawn's own texture (kit-stones.ts WEATHERED)
  // (the meadow where there is one: the infirmary's lawns since 2026-11-27)
  const lawn = RAW.meadow ? 'meadow' : 'lawn';
  STONE_U.stLawn.value = RAW[lawn] ?? RAW.weathered ?? null; STONE_U.stLawnS.value = TILE[lawn] ?? 4; STONE_U.stLawnV.value = VARY.has(lawn) ? 1 : 0;
  setGroundArt(RAW['foliage-tufts'], RAW.weathered, TILE.weathered ?? 3);   // the ground's painted tufts and its earth (kit-ground.ts)
}
/**
 * A material that samples tex by world position, blended over the three axes by the surface's facing. stone: the
 * floor's place in STONE_MATS when it is laid stone by stone once a scene's stones are loaded (kit-stones.ts), else -1.
 */
function triplanar(tex: THREE.Texture, tile: number, flow: [number, number] = [0, 0], decal = true, macro = 0, stone = -1, vary = false): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: flow[0] || flow[1] ? 0.35 : 0.92 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.tpMap = { value: tex }; sh.uniforms.tpScale = { value: 1 / tile };
    sh.uniforms.tpFlow = { value: new THREE.Vector2(...flow) }; sh.uniforms.tpTime = TP_TIME;
    if (stone >= 0) { const P = STONE_PAINT[STONE_MATS[stone]]; Object.assign(sh.uniforms, STONE_U, { stPal: P.pal, stJoint: P.joint, stK: P.k, stSheet: P.sheet, stMean: P.mean }); }
    if (vary || (stone >= 0 && WEATHERED.has(STONE_MATS[stone]))) Object.assign(sh.uniforms, GROUND_U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vTpPos;\nvarying vec3 vTpNrm;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTpPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvTpNrm = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vTpPos;\nvarying vec3 vTpNrm;\nuniform sampler2D tpMap;\nuniform float tpScale, tpTime;\nuniform vec2 tpFlow;' + (stone >= 0 ? stoneDecl(stone) : '') + (vary ? LAWN_VARY : ''))
      .replace('#include <map_fragment>', `vec3 tpW = pow(abs(normalize(vTpNrm)), vec3(4.0)); tpW /= (tpW.x + tpW.y + tpW.z);
        vec4 tpC = texture2D(tpMap, vTpPos.zy * tpScale) * tpW.x + texture2D(tpMap, vTpPos.xz * tpScale + tpFlow * tpTime) * tpW.y + texture2D(tpMap, vTpPos.xy * tpScale) * tpW.z;
        ${macro ? `vec3 tpFar = texture2D(tpMap, mat2(0.8, -0.6, 0.6, 0.8) * vTpPos.xz * tpScale * 0.137, 5.0).rgb, tpMean = texture2D(tpMap, vec2(0.5), 20.0).rgb;
        tpC.rgb *= clamp(1.0 + (dot(tpFar, vec3(0.333)) / max(dot(tpMean, vec3(0.333)), 0.02) - 1.0) * ${macro.toFixed(2)}, 0.8, 1.2);` : ''}
        ${vary ? 'tpC.rgb = tpW.y > 0.6 ? groundLawn(tpMap, 1.0 / tpScale, vTpPos.xz) : lawnVary(tpC.rgb, vTpPos.xz);' : ''}
        diffuseColor *= tpC;
        ${stone >= 0 ? stoneFrag(stone) : ''}
`);
    // a laid stone's bevel, lit by the scene's own light
    if (stone >= 0) sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nif (stLaid > 0.5) normal = normalize((viewMatrix * vec4(stNrm, 0.0)).xyz);');
  };
  m.customProgramCacheKey = () => `tp${tile}m${macro}s${stone}v${vary ? 1 : 0}`;
  return decal ? decalable(m) : m;
}
/** An inlay's rim stone: the smooth stone, kept clear of the decal, so the rim reads as its own kerb round the picture. */
let RIM_MAT: THREE.Material | undefined;
/** An inlay (kit.json class "inlay", kit-inlay.ts): a slab set into its floor with flowing channels, the decal on its top. */
function inlay(it: Inst): THREE.Group {
  const g = new THREE.Group();
  g.position.set(it.x, yOf(it.h), it.y); g.rotation.y = Math.atan2(Math.cos(it.rot), Math.sin(it.rot));   // as a set piece: local +z its front
  const k = KIT_PIECES[it.p] as KitPiece & InlaySpec;
  const stone = RAW['smooth-stone'];
  const rim = stone ? (RIM_MAT ??= triplanar(stone, TILE['smooth-stone'] ?? 2, undefined, false)) : PROP.coping;
  const field = RAW[k.channels?.texture ?? 'magic-flow'];
  return inlayInto(g, k, { top: floorMat('plaza'), side: TEX['smooth-stone'] ?? MAT.kerb, rim }, field);
}
let KERB_BLOCK: THREE.MeshStandardMaterial | undefined;
/** What kerb blocks wear: the smooth stone mapped by world position on top and sides alike (so nothing drags down a side), each block's own tone in its vertices, Undefined without the texture, or with ?kerb=0. */
function kerbMat(): THREE.MeshStandardMaterial | undefined {
  const stone = RAW['smooth-stone'];
  if (!stone || !KIT_OPTS.kerb) return undefined;
  if (!KERB_BLOCK) { KERB_BLOCK = triplanar(stone, TILE['smooth-stone'] ?? 2, undefined, true); KERB_BLOCK.vertexColors = true; }
  return KERB_BLOCK;
}
let PIPE_MATS: PipeMats | undefined;
/** The saddles' sandstone: the smooth stone, world-mapped, warmed toward the reference's sandstone (its own material, so the kerbs keep theirs). */
function saddleStone(): THREE.Material {
  const stone = RAW['smooth-stone'];
  if (!stone) return PROP.stone;
  const m = triplanar(stone, TILE['smooth-stone'] ?? 2, undefined, false); m.color.setHex(0xf2d2a2);
  return m;
}
/** The pipes' materials (kit-pipe.ts): the Codex-painted brass, collar and band pictures on the pipe's own UVs, the saddles in the smooth stone. */
function pipeMats(): PipeMats {
  if (PIPE_MATS && (PIPE_MATS.brass as THREE.MeshStandardMaterial).map === (RAW.brass ?? null) || PIPE_MATS && !RAW.brass) return PIPE_MATS;   // made again once the textures are in
  const metal = (name: string, c: number, rough: number, metalness: number) => {
    const t = RAW[name];   // (loaded repeating, in sRGB)
    return new THREE.MeshStandardMaterial({ map: t ?? null, color: t ? 0xffffff : c, roughness: rough, metalness });
  };
  return (PIPE_MATS = {
    brass: metal('brass', 0xc8902c, 0.38, 0.55), collar: metal('pipe-collar', 0xd09a34, 0.35, 0.55), band: metal('pipe-band', 0x2a3a8c, 0.3, 0.15),
    inside: new THREE.MeshStandardMaterial({ color: 0x2a1c0c, roughness: 0.8, side: THREE.DoubleSide }), stone: saddleStone(),
  });
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
  flowInlays(t);       // and the fields in an inlay's channels
  FOLIAGE_TIME.value = t;   // and the wind in the plants
  stepGlyphs(t);            // and the glyph paths' pulse and brightness
  stepOvergrowth(t);        // and overgrowth being cut back (or growing again)
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
// ---- arches, shaped by code to size (no models), dressed in the painted stone like the walls ----
const GOLD = new THREE.MeshStandardMaterial({ color: 0xd8aa48, roughness: 0.35, metalness: 0.75 });
/** A round-headed opening's outline (x from cx - r to cx + r, from y0 up, its crown at top), as a path. */
function archPath(p: THREE.Path, cx: number, r: number, y0: number, top: number, close = true) {
  p.moveTo(cx - r, y0); p.lineTo(cx - r, top - r); p.absarc(cx, top - r, r, Math.PI, 0, true); p.lineTo(cx + r, y0);
  if (close) p.lineTo(cx - r, y0);
  return p;
}
/** A shape extruded `depth` along +z, at z0, into g. */
function slab(g: THREE.Group, s: THREE.Shape, depth: number, z0: number, m: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 24 }), m);
  mesh.position.z = z0; mesh.castShadow = mesh.receiveShadow = true; g.add(mesh);
}
// ---- a bay: one blind arch over three wall sections (its centre v 'blind' with bay: 3, the sides v 'blind-side'), laid
// out along the whole bay ("bay coordinates", u from the bay's start), so it follows the wall round a curve ----
type Bay = { s0: number; total: number; first: boolean; last: boolean };
const BAYS = new Map<string, Bay>();
const segKey = (it: { x: number; y: number; x2?: number; y2?: number }) => `${Math.round(it.x * 100)},${Math.round(it.y * 100)},${Math.round((it.x2 ?? 0) * 100)},${Math.round((it.y2 ?? 0) * 100)}`;
/** Each bay's three sections: a centre and the sides sharing its endpoints; each section's start along the bay. */
function findBays(insts: Inst[]) {
  BAYS.clear();
  const near = (a: number, b: number) => Math.abs(a - b) < 0.01;
  const sides = insts.filter((i) => i.v === 'blind-side' && i.x2 != null);
  for (const c of insts) {
    if (c.v !== 'blind' || !(c as Inst & { bay?: number }).bay || c.x2 == null) continue;
    const a = sides.find((s) => near(s.x2!, c.x) && near(s.y2!, c.y)) ?? sides.find((s) => near(s.x, c.x) && near(s.y, c.y));
    const b = sides.find((s) => s !== a && near(s.x, c.x2!) && near(s.y, c.y2!)) ?? sides.find((s) => s !== a && near(s.x2!, c.x2!) && near(s.y2!, c.y2!));
    const len = (s: Inst) => Math.hypot(s.x2! - s.x, s.y2! - s.y), La = a ? len(a) : 0, Lc = len(c), Lb = b ? len(b) : 0, total = La + Lc + Lb;
    if (a) BAYS.set(segKey(a), { s0: 0, total, first: true, last: false });
    BAYS.set(segKey(c), { s0: La, total, first: !a, last: !b });
    if (b) BAYS.set(segKey(b), { s0: La + Lc, total, first: false, last: true });
  }
}
/**
 * One section's share of its bay's blind arch: the face with the arch's part in this section cut away (built as plain
 * polygons, never a hole across the outline), the recess's back, its share of the sill and of the gold moulding (short
 * pieces along the arch, each drawn by the section it falls in), and a half-pilaster at the bay's two ends.
 */
function bayWall(g: THREE.Group, L: number, h: number, low: number, bay: Bay) {
  const face = TEX.ashlar ?? MAT.face, cop = TEX.kerb ?? MAT.coping, R = 0.25, base = yOf(low) - 0.4, wallTop = yOf(h - COP);
  const r = Math.max(0.25, (bay.total - yOf(0.6)) / 2), cx = bay.total / 2 - bay.s0, top = wallTop - yOf(0.8);   // cx: in this section's x
  const bot = Math.max(yOf(low + 1.5), top - r * 2 * 4);   // down to a base course 1.5 m over the lower floor, at most 4:1
  const archY = (x: number) => top - r + Math.sqrt(Math.max(0, r * r - (x - cx) * (x - cx)));   // the opening's top at x
  box(g, cop, 0, L, wallTop, yOf(h + PROUD), -0.5, COP_OUT);                                  // the coping
  const poly = (pts: number[][]) => slab(g, new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y))), R, -R, face);
  const xa = Math.max(0, cx - r), xb = Math.min(L, cx + r);
  if (cx - r > 0) poly([[0, base], [Math.min(L, cx - r), base], [Math.min(L, cx - r), wallTop], [0, wallTop]]);   // stone left of the arch
  if (cx + r < L) poly([[Math.max(0, cx + r), base], [L, base], [L, wallTop], [Math.max(0, cx + r), wallTop]]);   // and right of it
  if (xb > xa) {
    poly([[xa, base], [xb, base], [xb, bot], [xa, bot]]);                                     // under the sill
    const n = Math.max(2, Math.ceil((xb - xa) / 0.12)), arc: number[][] = [];
    for (let k = 0; k <= n; k++) { const x = xa + ((xb - xa) * k) / n; arc.push([x, archY(x)]); }
    poly([...arc, [xb, wallTop], [xa, wallTop]]);                                               // above the arch's head
    box(g, face, xa, xb, base, wallTop, -0.45, -R);                                             // the recess's back
    box(g, cop, Math.max(0, cx - r - 0.1), Math.min(L, cx + r + 0.1), bot - 0.14, bot, -R, 0.1);   // the sill
  }
  // the gold moulding: short pieces along jambs and head, at r + 0.035 out, each in the section that holds its middle
  const rr = r + 0.035, path: number[][] = [];
  for (let y = bot; y < top - r; y += 0.15) path.push([cx - rr, y]);
  for (let k = 0; k <= 32; k++) { const a = Math.PI - (Math.PI * k) / 32; path.push([cx + rr * Math.cos(a), top - r + rr * Math.sin(a)]); }
  for (let y = top - r; y >= bot; y -= 0.15) path.push([cx + rr, y]);
  for (let k = 0; k + 1 < path.length; k++) {
    const [x0, y0] = path[k], [x1, y1] = path[k + 1], mx = (x0 + x1) / 2;
    if (mx < 0 || mx >= L) continue;
    const len = Math.hypot(x1 - x0, y1 - y0), piece = new THREE.Mesh(new THREE.BoxGeometry(len + 0.02, 0.07, 0.04), GOLD);
    piece.position.set(mx, (y0 + y1) / 2, 0.02); piece.rotation.z = Math.atan2(y1 - y0, x1 - x0); g.add(piece);
  }
  if (bay.first) box(g, face, 0, 0.32, base, wallTop, 0, 0.07);                              // half-pilasters at the bay's ends
  if (bay.last) box(g, face, L - 0.32, L, base, wallTop, 0, 0.07);
}

/** A wall section's body by its variant: a blind arch recessed in it, a bridge face's coping alone, or the plain wall. */
function wallBody(g: THREE.Group, L: number, h: number, low: number, v?: string, bay?: Bay) {
  if (bay && (v === 'blind' || v === 'blind-side')) { bayWall(g, L, h, low, bay); return; }
  const cop = TEX.kerb ?? MAT.coping;
  if (v === 'bridge') { box(g, cop, 0, L, yOf(h - COP), yOf(h + PROUD), -0.5, COP_OUT); return; }   // the arch under it draws the wall
  if (v !== 'blind') { retain(g, L, h, low); return; }
  // a blind arch (the court's sea walls; docs/reference/court-kit/court-sea-paintover.png): tall and narrow, up to four
  // times its width, high under the coping, recessed 0.25 u, with a sill, a thin gold moulding, and flat pilasters
  const face = TEX.ashlar ?? MAT.face, R = 0.25, base = yOf(low) - 0.4, wallTop = yOf(h - COP);
  const r = Math.max(0.25, (L - yOf(0.6)) / 2), cx = L / 2, top = wallTop - yOf(0.8);
  const bot = Math.max(yOf(low + 1.5), top - r * 2 * 4);   // down to a base course 1.5 m over the lower floor, at most 4 times its width tall
  box(g, cop, 0, L, wallTop, yOf(h + PROUD), -0.5, COP_OUT);                                    // the coping
  const front = new THREE.Shape([new THREE.Vector2(0, base), new THREE.Vector2(L, base), new THREE.Vector2(L, wallTop), new THREE.Vector2(0, wallTop)]);
  front.holes.push(archPath(new THREE.Path(), cx, r, bot, top));
  slab(g, front, R, -R, face);                                                                     // the face, the arch cut through it
  box(g, face, 0, L, base, wallTop, -0.45, -R);                                                    // the wall behind: the recess's back
  box(g, cop, cx - r - 0.1, cx + r + 0.1, bot - 0.14, bot, -R, 0.1);                              // the sill
  const ring = archPath(new THREE.Shape(), cx, r + 0.07, bot, top + 0.07, false) as THREE.Shape;
  ring.lineTo(cx + r, bot); ring.lineTo(cx + r, top - r); ring.absarc(cx, top - r, r, 0, Math.PI, false); ring.lineTo(cx - r, bot); ring.lineTo(cx - r - 0.07, bot);
  slab(g, ring, 0.04, 0, GOLD);                                                                    // the gold moulding round it
  box(g, face, 0, 0.32, base, wallTop, 0, 0.07); box(g, face, L - 0.32, L, base, wallTop, 0, 0.07);   // half-pilasters at its ends
}
/**
 * A level crossing water on arches (arch.through): one face from (x, y) to (x2, y2), the other `depth` along (nx, ny);
 * n segmental arches springing 0.3 m over the water at `low`, crowned 0.4 m under the deck at h. One outline with the
 * arches as holes, extruded through the depth: both faces, the piers and the barrel soffits at once, in ashlar; a
 * voussoir ring on each face. The water runs on under it (kit-water, open at the arch's mouths).
 */
function archThrough(it: Inst & { nx?: number; ny?: number; depth?: number; mat?: string }): THREE.Group {
  const span = Math.hypot(it.x2! - it.x, it.y2! - it.y), D = it.depth ?? 4, nx = it.nx ?? 0, ny = it.ny ?? 1;
  let ox = it.x, oy = it.y, dx = (it.x2! - it.x) / span, dy = (it.y2! - it.y) / span;
  if (Math.abs(-dy - nx) + Math.abs(dx - ny) > 0.5) { ox = it.x2!; oy = it.y2!; dx = -dx; dy = -dy; }   // keep the frame right-handed (z = x × y)
  const g = new THREE.Group(); g.matrixAutoUpdate = false;
  g.matrix.makeBasis(new THREE.Vector3(dx, 0, dy), new THREE.Vector3(0, 1, 0), new THREE.Vector3(nx, 0, ny)).setPosition(ox, 0, oy);
  const n = Math.max(1, it.n ?? 1), pier = 0.8, edge = 0.3, ow = (span - 2 * edge - (n - 1) * pier) / n;
  const under = yOf(it.low!) - 0.4, deck = yOf(it.h) - 0.02, spring = yOf(it.low! + 0.3), crown = yOf(it.h - 0.4);
  const body = new THREE.Shape([new THREE.Vector2(0, under), new THREE.Vector2(span, under), new THREE.Vector2(span, deck), new THREE.Vector2(0, deck)]);
  const rings: THREE.Shape[] = [];
  for (let k = 0; k < n; k++) {
    const x0 = edge + k * (ow + pier), a = ow / 2, cx = x0 + a;
    let rise = Math.max(0.2, crown - spring), ys = spring;
    if (rise > a) { ys = crown - a; rise = a; }                        // no taller than a half circle: straight jambs below it
    const R = (a * a + rise * rise) / (2 * rise), cy = ys + rise - R, th = Math.atan2(ys - cy, a);
    // (the hole stays inside the outline, its foot just under the water: a hole crossing its outline breaks the triangulation)
    const foot = under + 0.12, hole = new THREE.Path(); hole.moveTo(x0, foot); hole.lineTo(x0, ys); hole.absarc(cx, cy, R, Math.PI - th, th, true); hole.lineTo(x0 + ow, foot); hole.lineTo(x0, foot);
    body.holes.push(hole);
    // the voussoirs: a band round the arch, 0.35 u deep
    const W = 0.35, ring = new THREE.Shape(), Ro = R + W, tho = Math.asin(Math.max(-1, Math.min(1, (ys - cy) / Ro)));
    ring.moveTo(cx - Math.cos(tho) * Ro, ys); ring.absarc(cx, cy, Ro, Math.PI - tho, tho, true); ring.lineTo(cx + a, ys); ring.absarc(cx, cy, R, th, Math.PI - th, false); ring.lineTo(cx - Math.cos(tho) * Ro, ys);
    rings.push(ring);
  }
  slab(g, body, D, 0, TEX.ashlar ?? MAT.face);
  for (const ring of rings) { slab(g, ring, 0.06, -0.06, TEX.kerb ?? MAT.coping); slab(g, ring, 0.06, D, TEX.kerb ?? MAT.coping); }
  return g;
}
/** The faces of the arches being built, in world u: water is open there (no foam) and floors grow no rock side over them. */
const ARCH_FACES: number[][] = [];
/** The wall sections with a blind arch cut in them: no rock side there either (it would fill the recess). */
const BLIND_SEGS: number[][] = [];
const onArchFace = (ax: number, ay: number, bx: number, by: number) => onSegs(ARCH_FACES, ax, ay, bx, by);
/** The lips of the falls being built: [ax, ay, bx, by, the upper water's height (m)]. The upper water is open there (it runs on over the lip) and flows toward it. */
const FALL_LIPS: number[][] = [];
/** Whether segment a-b lies along one of these (within a hair), as a floor's outline does along a face it bounds. */
function onSegs(list: number[][], ax: number, ay: number, bx: number, by: number): boolean {
  for (const [px, py, qx, qy] of list) {
    const L = Math.hypot(qx - px, qy - py), ux = (qx - px) / L, uy = (qy - py) / L;
    const off = (x: number, y: number) => Math.abs((x - px) * uy - (y - py) * ux), at = (x: number, y: number) => (x - px) * ux + (y - py) * uy;
    if (off(ax, ay) < 0.06 && off(bx, by) < 0.06 && Math.min(at(ax, ay), at(bx, by)) > -0.06 && Math.max(at(ax, ay), at(bx, by)) < L + 0.06) return true;
  }
  return false;
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
const RAIL_Z = -0.2, PIER_SET = 0.3, PIER_HALF = 0.275, NEWEL_HALF = 0.275 * 1.25;
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
  // the post stands PIER_SET inside the edge line (compile.py), so the rail lies RAIL_Z + PIER_SET from its centre
  const x = (half - s * (RAIL_Z + PIER_SET) * (tx * nx + ty * ny)) / Math.abs(along);
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
  if (cls === 'ground') return null;   // painted into the ground (kit-ground.ts): worn paths
  if (KIT_PIECES[it.p]?.class === 'inlay') return inlay(it);
  if (cls === 'fall') return it.pts && it.low != null ? fallMesh(it.pts, yOf(it.h), yOf(it.low), TP_TIME) : null;   // water pouring into lower water (kit-fall.ts)
  if (cls === 'cliff') return it.pts && it.low != null ? cliffFace(it.pts, it.h, it.low) : null;   // a sea cliff laid from the cliff kit
  if (cls === 'pipe') return it.pts ? pipeMesh(it as Inst & PipeRun, yOf, pipeMats()) : null;   // a conduit pipe drawn along its route (kit-pipe.ts)
  if (cls === 'glyph') return it.pts ? glyphPick(it as Inst & GlyphRun, yOf) : null;   // a glyph path: its hidden copy for picking (all runs draw as one mesh, below)
  if (cls === 'edge' || cls === 'sweep') {
    const g = edgeFrame(it), L = it.len!, low = it.low!;
    const drop = it.h - low;
    // a made retaining wall: its top course with the coping, then plain courses stacked down past the lower floor
    // (every other one mirrored, so the joints don't line up), never stretched
    let madeRetain = false;
    const niche = it.v === 'niche' && ART.niche;
    // (with an ashlar texture the wall is a plain shape wearing it, so its courses never repeat at a seam; a niche stays made)
    const shaped = it.v === 'blind' || it.v === 'blind-side' || it.v === 'bridge';   // shaped by code: a blind arch in the wall, or a bridge face (the arch draws below)
    if ((kind === 'retain' || kind === 'parapet') && drop >= 0.3 && !shaped && (!TEX.ashlar || niche) && art(g, niche ? 'niche' : 'retain-top', 0, yOf(it.h), L / 2)) {
      madeRetain = true;
      if (TEX.ashlar) box(g, TEX.ashlar, 0, L, yOf(low) - 0.4, yOf(it.h) - 2.0, -0.45, 0);   // under a niche: the textured wall, as beside it
      else for (let y = yOf(it.h) - (niche ? 2.0 : 1.1), k = 0; y > yOf(low) - 0.4; y -= 0.78, k++) {
        if (k % 2) art(g, 'retain-course', L, y, -L / 2); else art(g, 'retain-course', 0, y, L / 2);
      }
    }
    if (kind === 'retain') { if (!madeRetain) wallBody(g, L, it.h, low, it.v, BAYS.get(segKey(it))); }
    else if (kind === 'parapet') {
      if (!madeRetain) wallBody(g, L, it.h, low, it.v, BAYS.get(segKey(it)));
      // pier face to pier face: on a straight run 0.275 at each end; on a bend, where the turned pier's face is
      const dx = (it.x2! - it.x) / L, dy = (it.y2! - it.y) / L, nx = -dy, ny = dx;
      const i0 = railInset(it.x, it.y, dx, dy, nx, ny), i1 = railInset(it.x2!, it.y2!, -dx, -dy, nx, ny);
      if (!railModules(g, i0, L - i0 - i1, yOf(it.h + 0.05))) balustrade(g, L, it.h, i0, i1);
    }
    else if (kind === 'kerb') {
      // laid as blocks, all a scene's kerbs at once (buildKit, kit-road.ts, mortar bed and all): the piece itself is
      // only what a click on its blocks finds, hidden inside their bed
      if (kerbMat()) box(g, JOINT, 0, L, yOf(low) - 0.1, yOf(it.h) - 0.02, -KIT_OPTS.kerbW + 0.04, 0.01);
      else if (TEX.kerb || !art(g, 'kerb', 0, yOf(it.h), L / 2)) box(g, TEX.kerb ?? MAT.kerb, 0, L, yOf(low) - 0.1, yOf(it.h), -KERB_W, 0);
    }
    else if (kind === 'wall') wall(g, L, it.h, low, it.v, shape === 'door');
    else if (kind === 'steps') steps(g, L, it.h, low);   // edge.steps.straight / .chamfer and sweep.steps
    return g;
  }
  if (cls === 'joint') {
    const g = new THREE.Group(); g.position.set(it.x + (it.ox ?? 0), 0, it.y + (it.oy ?? 0)); g.rotation.y = -it.rot;
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
      // the last tread's top is the lower floor's own height: sunk a hair so it never fights the floor it meets (pin p36)
      const top = yOf(it.h - (k + 1) * rise) - (k === n - 1 ? 0.012 : 0);
      box(g, treadMat, 0, W, yOf(it.low!) - 0.4, madeTreads ? top - 0.3 : top, k * go, (k + 1) * go);
      if (madeTreads && k < n - 1) { for (let m = 0; m + 1.99 < W; m += 2) art(g, 'tread', m, top, 1, 1); g.children.slice(-Math.round(W / 2)).forEach((o) => { o.position.z = (k + 1) * go - 0.06; }); }
      else if (!TEX.tread && k < n - 1) box(g, MAT.coping, 0, W, top - 0.05, top + 0.008, k * go - 0.05, k * go + 0.08);   // proud of the tread it lies on, not coplanar   // a nosing (a textured tread shows its own edge)
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
    if (it.p === 'setpiece.grass-long' && GROUND_U.grOn.value) return g;   // long grass is painted into the ground (kit-ground.ts), not grown as cards
    if (k.grow) return growInto(g, k.grow, seedOf(it), y);
    // vines grown round its structure (lab/overgrowth.ts), their level settable by its scene id (setOvergrowth)
    const slot = k.overgrowth && it.src ? overgrowthSlot(it.src, k.overgrowth.level ?? 1) : undefined;
    if (slot !== undefined) { const v = cageOvergrowth(k.overgrowth!, seedOf(it), slot); v.scale.setScalar(M); v.position.y = y; g.add(v); }
    if (art(g, kind, 0, y)) { if (k.shade) { const sh = groundShade((k.shade / 2) * M); sh.position.y += y; g.add(sh); } return g; }
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
  if (cls === 'arch') return archThrough(it);
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
    if (onArchFace(ax, ay, bx, by) || onSegs(BLIND_SEGS, ax, ay, bx, by)) continue;   // an arch's face (open underneath) or a blind arch's recess
    if (ax === bx && ay === by) continue;
    pos.push(ax, top, ay, bx, top, by, bx, bottom, by, ax, top, ay, bx, bottom, by, ax, bottom, ay);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  const m = new THREE.Mesh(g, SIDE_TEX() ?? SIDE); m.castShadow = m.receiveShadow = true;
  return m;
}

// ---- sea cliffs: the cliff kit's run (Meshy, fitted 26 u long, 6 m tall, base centre at its pivot) laid along an
// open edge over water (cliff.face), stretched to fill each straight stretch and scaled to the drop ----
const CLIFF = { len: 26, tall: 6, deep: 9.3, depth: 3.2, sink: 0.8, lip: 0.15 };   // the model's u/m, and how it is laid: depth u out, m under the water, m under the top
/**
 * Copies of the cliff run along each straight stretch of the line (the water on its right): as many as fit at their
 * scaled length, stretched to fill the stretch exactly, every other one mirrored. The face stands mostly in front of
 * the edge (its back a little behind, inside the level's rock side) with its depth held to CLIFF.depth u, so a tall
 * drop gets a tall face, not one pushed metres out to sea. Each stretch runs on past its ends by that depth, so an
 * outside corner closes. Its top sits just under the level's floor.
 */
function cliffFace(pts: number[][], h: number, low: number): THREE.Group | null {
  if (!ART['cliff-run']) return null;
  const g = new THREE.Group(), drop = h - low;
  const sh = (drop - CLIFF.lip + CLIFF.sink) / CLIFF.tall, sd = CLIFF.depth / CLIFF.deep, y0 = yOf(low - CLIFF.sink);
  // straight stretches (the grid cuts the line per cell)
  const runs: [number[], number[]][] = [];
  let a = pts[0];
  for (let i = 1; i < pts.length; i++) {
    const b = pts[i], c = pts[i + 1];
    const turn = c ? Math.abs((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])) > 0.05 * Math.hypot(b[0] - a[0], b[1] - a[1]) * Math.hypot(c[0] - b[0], c[1] - b[1]) : true;
    if (turn) { runs.push([a, b]); a = b; }
  }
  let n0 = 0;
  for (const [p, q] of runs) {
    const L = Math.hypot(q[0] - p[0], q[1] - p[1]); if (L < 0.5) continue;
    const dx = (q[0] - p[0]) / L, dy = (q[1] - p[1]) / L, ext = CLIFF.depth * 0.8, full = L + ext * 2;
    const n = Math.max(1, Math.round(full / (CLIFF.len * sh))), each = full / n;
    for (let k = 0; k < n; k++, n0++) {
      const o = ART['cliff-run'].clone(), t = -ext + each * (k + 0.5), flip = n0 % 2 ? -1 : 1;
      const f = new THREE.Group(); f.matrixAutoUpdate = false;
      f.matrix.makeBasis(new THREE.Vector3(dx, 0, dy), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-dy, 0, dx))
        .setPosition(p[0] + dx * t, y0, p[1] + dy * t);
      o.position.set(0, 0, CLIFF.depth * 0.5 - 0.4); o.scale.set(flip * each / CLIFF.len, sh, sd);
      f.add(o); g.add(f);
    }
  }
  g.traverse((m) => { if ((m as THREE.Mesh).isMesh) m.castShadow = m.receiveShadow = true; });
  return g;
}

// ---- a timber quay: a deck floor's edges over water get a fascia beam and piles, drawn to size in the deck's paint ----
const inRing = (x: number, y: number, ring: number[][]) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const inFloor = (x: number, y: number, f: Floor) => f.polys.some(([o, ...hs]) => inRing(x, y, o) && !hs.some((h) => inRing(x, y, h)));
let pileMat: THREE.Material | null = null;
/** The deck's paint, darker and wetter, for piles and the fascia. */
const PILE = (): THREE.Material => {
  if (pileMat) return pileMat;
  const d = TEX.deck;
  if (!d) return (pileMat = mat(0x5a4632));
  const m = d.clone(); m.onBeforeCompile = d.onBeforeCompile; m.customProgramCacheKey = d.customProgramCacheKey; m.color.setHex(0x8f7a66); m.side = THREE.DoubleSide;
  return (pileMat = m);
};
const QUAY = { fascia: 0.35, pile: 0.17, every: 2.4, post: 0.8 };   // m
/**
 * A deck floor's quay: along every edge that has water outside it, a fascia beam under the deck and piles from the
 * deck down past the water every QUAY.every m; at each corner of such a run a pile stands QUAY.post m proud as a
 * mooring post with an iron cap. Edges against higher ground (the flight's foot) get nothing.
 */
function quay(f: Floor, waters: Floor[], bottom: number): THREE.Group | null {
  if (!waters.length) return null;
  const g = new THREE.Group(), top = yOf(f.h), r = yOf(QUAY.pile), step = yOf(QUAY.every);
  const beam: number[] = [], posts: [number, number][] = [], corners = new Map<string, [number, number]>();
  // straight runs as one edge (the grid cuts them per cell), so piles space evenly and only true corners get posts
  const straight = (ring: number[][]) => ring.filter((p, i) => {
    const a = ring[(i + ring.length - 1) % ring.length], b = ring[(i + 1) % ring.length];
    const ux = p[0] - a[0], uy = p[1] - a[1], vx = b[0] - p[0], vy = b[1] - p[1];
    return Math.abs(ux * vy - uy * vx) > 0.05 * Math.hypot(ux, uy) * Math.hypot(vx, vy);
  });
  for (const [ring] of f.polys) for (let i = 0, outer = straight(ring); i < outer.length; i++) {
    const [ax, ay] = outer[i], [bx, by] = outer[(i + 1) % outer.length], L = Math.hypot(bx - ax, by - ay);
    if (L < 1e-4) continue;
    const mx = (ax + bx) / 2, my = (ay + by) / 2, nx = (by - ay) / L, ny = -(bx - ax) / L, e = 0.3;
    const out = waters.find((w) => inFloor(mx + nx * e, my + ny * e, w)) ? 1 : waters.find((w) => inFloor(mx - nx * e, my - ny * e, w)) ? -1 : 0;
    if (!out || inFloor(mx + nx * e * out, my + ny * e * out, f)) continue;
    const ox = nx * out * r * 0.2, oy = ny * out * r * 0.2, lo = top - yOf(QUAY.fascia);
    beam.push(ax + ox, top, ay + oy, bx + ox, top, by + oy, bx + ox, lo, by + oy, ax + ox, top, ay + oy, bx + ox, lo, by + oy, ax + ox, lo, ay + oy);
    const n = Math.max(1, Math.round(L / step));
    for (let k = 1; k < n; k++) posts.push([ax + ((bx - ax) * k) / n + nx * out * r * 0.5, ay + ((by - ay) * k) / n + ny * out * r * 0.5])   // half out past the edge, so a side seen from the south still shows them;
    for (const [cx, cy] of [[ax, ay], [bx, by]]) corners.set(`${cx.toFixed(3)},${cy.toFixed(3)}`, [cx - nx * out * r, cy - ny * out * r]);
  }
  if (!beam.length) return null;
  const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(beam, 3)); bg.computeVertexNormals();
  const bm = new THREE.Mesh(bg, PILE()); bm.castShadow = bm.receiveShadow = true; g.add(bm);
  const pile = (x: number, y: number, y1: number) => {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.08, y1 - bottom, 10), PILE());
    c.position.set(x, (y1 + bottom) / 2, y); c.castShadow = c.receiveShadow = true; g.add(c);
  };
  for (const [x, y] of posts) pile(x, y, top - 0.01);
  for (const [x, y] of corners.values()) {
    const y1 = top + yOf(QUAY.post); pile(x, y, y1);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.15, r * 1.15, yOf(0.08), 10), MAT.metal); cap.position.set(x, y1 + yOf(0.04), y); g.add(cap);
  }
  return g;
}

// ---- dressing (kit.json class "dress": small pieces placed by a style's rules): urns, lanterns, planters, lamps ----
/** An element's colour, for a banner's stand-in until its cloth and emblem texture are made. */
const EMBLEM: Record<string, number> = { fire: 0xd8553a, cold: 0xdcecf4, water: 0x3f7fc8, life: 0x5aa851, shield: 0xd8b24a, arcane: 0x8a5ac8, earth: 0x8a6a44 };
const bannerUrls = import.meta.glob<string>('../../../../content/generated/textures/banner-*.png', { eager: true, query: '?url', import: 'default' });
const bannerTex: Record<string, THREE.Texture> = {};
const BANNER_ASPECT = 2.32;   // the cut banners' height over width (256 x ~594 px)
function bannerMap(emblem: string): THREE.Texture | null {
  const url = urlOf(`textures/banner-${emblem}.png`, bannerUrls);
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
const SLOT: Record<string, [number, number, string]> = { pot: [0.8, 0.35, 'box'], plant: [0.55, 0.65, 'round'], post: [0.15, 0.82, 'round'], lantern: [0.45, 0.18, 'box'] };
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
    box(g, MAT.dark, -0.05, 0.05, 0, H, -0.05, 0.05);                                         // its pole
    if (map) {
      // the painted banner (Codex, textures/banner-<emblem>.png, cut by tools/kit/banners.py) as a cut-out hung
      // from a crossbar in front of the pole, at the painting's own aspect (its rod and fringe are painted)
      const tall = w * BANNER_ASPECT, top = H * 0.97;
      box(g, MAT.dark, -w * 0.55, w * 0.55, top - 0.04, top + 0.04, -0.04, 0.04);
      const cloth = new THREE.MeshStandardMaterial({ map, roughness: 0.9, side: THREE.DoubleSide, alphaTest: 0.5 });
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(w, tall), cloth);
      pl.position.set(0, top - tall / 2, 0.09); pl.castShadow = true; pl.receiveShadow = true;
      pl.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest: 0.5 });
      g.add(pl);
      return g;
    }
    box(g, mat(EMBLEM[String(parts.emblem)] ?? 0xb0a090), -w / 2, w / 2, H * 0.35, H * 0.95, 0.05, 0.1);
    return g;
  }
  if (stack.length) {
    let sink = 0;   // a pot's next part starts this far under its rim
    for (const slot of stack) {
      const part = String(parts[slot] ?? ''), y0 = topOf(g) - sink, before = g.children.length;
      sink = 0;
      if (!art(g, part, 0, y0)) {
        if (PLANT_PARTS[part]) { growInto(g, PLANT_PARTS[part], seedOf(it), y0); continue; }   // a plant grown in code (foliage)
        // a stand-in in the slot's proportions (share of the width, share of the height, shape) until the part is made
        const [sw, sh, shape] = SLOT[slot] ?? [1, 1 / stack.length, 'box'];
        standIn(g, shape, w * sw, d * sw, y0, H * sh, slot === 'post' ? MAT.dark : PROP.stone);
      }
      if (slot === 'pot') {
        // a pot is open: soil fills it just under the rim (0.8 of its measured width; square for a square pot), and
        // the plant grows from 0.15 m under the rim, so a short plant never shows the pot's dark inside
        const b = new THREE.Box3();
        g.updateMatrixWorld(true);
        const inv = g.matrixWorld.clone().invert();
        for (const c of g.children.slice(before)) b.union(new THREE.Box3().setFromObject(c).applyMatrix4(inv));
        const sx = (b.max.x - b.min.x) * 0.8, sz = (b.max.z - b.min.z) * 0.8, rim = b.max.y, cxp = (b.min.x + b.max.x) / 2, czp = (b.min.z + b.max.z) / 2;
        const soilY = rim - yOf(0.06), soil = TEX.dirt ?? FLOOR.dirt;
        if (part.includes('square')) box(g, soil, cxp - sx / 2, cxp + sx / 2, soilY - 0.05, soilY, czp - sz / 2, czp + sz / 2);
        else { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.05, 28), soil); c.scale.set(sx, 1, sz); c.position.set(cxp, soilY - 0.025, czp); c.receiveShadow = true; g.add(c); }
        sink = yOf(0.15);
      }
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
function growInto(g: THREE.Group, recipe: Recipe & { box?: [number, number, number]; soil?: [number, number] }, seed: number, y0: number): THREE.Group {
  let y = y0;
  if (recipe.soil) { const [sw, sd] = recipe.soil.map(yOf); box(g, TEX.dirt ?? MAT.wood, -sw / 2, sw / 2, y0 - yOf(0.05), y0 + yOf(0.03), -sd / 2, sd / 2); }
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
    const url = urlOf(path, vineUrls);
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
  JOINTS.clear(); SPINNERS.length = 0; clearInlays(); clearOvergrowth(); ARCH_FACES.length = 0; BLIND_SEGS.length = 0; FALL_LIPS.length = 0;
  for (const it of data.instances) if ((it.v === 'blind' || it.v === 'blind-side') && it.x2 != null) BLIND_SEGS.push([it.x, it.y, it.x2, it.y2!]);
  findBays(data.instances);
  for (const it of data.instances) if (it.p.startsWith('arch.')) {   // an arch's two faces, before the floors and water are built
    const a = it as Inst & { nx?: number; ny?: number; depth?: number }, ex = (a.nx ?? 0) * (a.depth ?? 0), ey = (a.ny ?? 0) * (a.depth ?? 0);
    ARCH_FACES.push([a.x, a.y, a.x2!, a.y2!], [a.x + ex, a.y + ey, a.x2! + ex, a.y2! + ey]);
  }
  for (const it of data.instances) if (it.p.startsWith('fall.') && it.pts) for (let i = 0; i + 1 < it.pts.length; i++) FALL_LIPS.push([...it.pts[i], ...it.pts[i + 1], it.h]);
  setDecal(data.instances.find((i) => isDecal(i.p)));
  buildGround(data.floors, data.instances, kitPiece);   // the lawn's ground map: worn paths, long grass, contact shade (kit-ground.ts)
  for (const it of data.instances) if (it.p.startsWith('joint.')) JOINTS.set(jkey(it.x, it.y), it);
  const bottom = yOf(Math.min(0, ...data.floors.map((f) => f.h)) - 0.4);
  const waters = data.floors.filter((f) => f.mat === 'water');
  for (const f of data.floors) if (f.mat === 'deck') { const q = quay(f, waters.filter((w) => w.h < f.h), bottom); if (q) root.add(q); }
  for (const f of data.floors) for (const [outer, ...holes] of f.polys) {
    const sd = f.mat === 'deck' && waters.length ? null : sides([outer, ...holes], yOf(f.h), bottom); if (sd) root.add(sd);
    const s = new THREE.Shape(outer.map(([x, y]) => new THREE.Vector2(x, -y)));
    for (const h of holes) s.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, -y))));
    const m = new THREE.Mesh(new THREE.ShapeGeometry(s), floorMat(f.mat));
    m.rotation.x = -Math.PI / 2; m.position.y = yOf(f.h); m.receiveShadow = true;
    m.userData.floor = f;
    root.add(m);
    // water: stylised and moving, all in code (kit-water.ts); the flat floor stays, hidden, for picking and painting
    if (f.mat === 'water') {
      // water with a fall's lip on its outline runs on over it (no foam along the lip) and flows toward it
      const lips = FALL_LIPS.filter((l) => l[4] === f.h), flow = [0, 0];
      for (let i = 0; i < outer.length; i++) {
        const [ax, ay] = outer[i], [bx, by] = outer[(i + 1) % outer.length];
        for (const l of lips) if (onSegs([l], ax, ay, bx, by)) { flow[0] -= l[3] - l[1]; flow[1] += l[2] - l[0]; }
      }
      const open = (ax: number, ay: number, bx: number, by: number) => onArchFace(ax, ay, bx, by) || onSegs(lips, ax, ay, bx, by);
      m.visible = false; root.add(waterMesh([outer, ...holes], yOf(f.h), data.size, TP_TIME, 8, open, flow[0] || flow[1] ? [flow[0], flow[1]] : undefined));
    }
  }
  // the kerbs' stones, laid along each whole kerb so they run on across its pieces and are cut to its turns
  if (kerbMat()) {
    const kerbs = data.instances.filter((it) => /^(edge|sweep)\.kerb/.test(it.p) && it.x2 != null && it.low != null) as KerbSeg[];
    const m = new THREE.Mesh(kerbRows(kerbs, yOf, KIT_OPTS.kerbW, KIT_OPTS.kerbRound), kerbMat()!);
    m.castShadow = m.receiveShadow = true; m.raycast = () => undefined;
    root.add(m);
  }
  // the water running on under each arch (open at its mouths: no foam across the stream there)
  for (const it of data.instances) if (it.p.startsWith('arch.') && (it as Inst & { mat?: string }).mat === 'water') {
    const a = it as Inst & { nx?: number; ny?: number; depth?: number }, ex = (a.nx ?? 0) * (a.depth ?? 0), ey = (a.ny ?? 0) * (a.depth ?? 0);
    root.add(waterMesh([[[a.x, a.y], [a.x2!, a.y2!], [a.x2! + ex, a.y2! + ey], [a.x + ex, a.y + ey]]], yOf(a.low!) - 0.02, data.size, TP_TIME, 8, onArchFace));   // a hair under the stream, so it wins where they overlap
  }
  // the glyph paths, every run in one mesh (kit-glyph.ts), in the Codex-painted runes and medallion
  const glyphs = glyphScene(data.instances.filter((it) => it.p.startsWith('glyph.') && it.pts) as (Inst & GlyphRun)[], yOf, glyphMaterial(RAW['glyph-runes'], RAW['glyph-medallion']));
  if (glyphs) root.add(glyphs);
  data.instances.forEach((it, i) => {
    const g = piece(it);
    if (!g) return;
    if (it.scale && it.scale !== 1) g.scale.multiplyScalar(it.scale);
    if (it.tint && !it.p.startsWith('vine.')) tintGroup(g, it.tint);   // (a vine takes its tint in its own material)
    g.userData.inst = i;
    root.add(g);
  });
  // what set pieces bring beyond their own group: vines along the glyph paths near an overgrown one, smoke from a flue
  for (const it of data.instances) {
    const k = KIT_PIECES[it.p];
    if (!it.p.startsWith('setpiece.') || !k) continue;
    if (k.overgrowth?.paths) root.add(...glyphVines(it, k.overgrowth, data.instances));
    if (k.smoke) {
      const th = Math.atan2(Math.cos(it.rot), Math.sin(it.rot)), [lx, lz] = (k.smoke.at ?? [0, 0]).map((v) => v * M);
      const s = smokeMesh(k.smoke, M, seedOf(it));
      s.position.set(it.x + lx * Math.cos(th) + lz * Math.sin(th), yOf(it.h + (it.up ?? 0) + k.smoke.z), it.y - lx * Math.sin(th) + lz * Math.cos(th));
      root.add(s);
    }
  }
  cloudify(root);   // cloud shadows drifting over everything lit
  return root;
}

/**
 * Vines lying across the glyph paths that start (or end) within `reach` u of an overgrown set piece, `paths` u along
 * each from that end (lab/overgrowth.ts), each path's vines in a group of its own (its scene id), so a line's vines are
 * cut as it relights.
 */
function glyphVines(sp: Inst, o: OvergrowthSpec, insts: Inst[]): THREE.Group[] {
  const out: THREE.Group[] = [], reach = o.reach ?? 7;
  for (const it of insts) {
    if (!it.p.startsWith('glyph.') || !it.pts || it.pts.length < 2 || !it.src) continue;
    const near = (p: number[]) => Math.hypot(p[0] - sp.x, p[1] - sp.y);
    const pts = near(it.pts[0]) <= reach ? it.pts : near(it.pts[it.pts.length - 1]) <= reach ? [...it.pts].reverse() : null;
    if (!pts) continue;
    const slot = overgrowthSlot(it.src, o.level ?? 1);
    if (slot === undefined) continue;
    const [x0, y0, z0] = pts[0];
    const g = pathOvergrowth(pts.map(([x, y, z]) => [(x - x0) / M, z - z0, (y - y0) / M] as [number, number, number]), ((it as Inst & GlyphRun).w ?? 0.9) / M, o.paths! / M,
      seedOf(it) + 7, slot, o.density ?? 1);
    g.scale.setScalar(M); g.position.set(x0, yOf(z0), y0);
    g.userData.noFade = true;
    out.push(g);
  }
  return out;
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
