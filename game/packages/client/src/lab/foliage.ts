/**
 * Procedural foliage (2026-11-24, docs/explorations/2026-11-24-procedural-foliage.md): plants grown in code as
 * volumes of small camera-facing cards. A plant is a few overlapping lobes (ellipsoids, cones, hanging strands); cards
 * sit on the lobes' outer surface and take the lobe's normal, so a bush lights like one soft mass, not like flat
 * leaves. A card's sprite is a grey value map (leaf clusters, blossoms, spikes: SPRITES below, drawn once to a canvas)
 * and its colour comes from a palette ramp looked up by light + sprite value + depth in the plant, so shadows turn
 * blue-green and lit tops yellow-green, as painted, and one sprite sheet serves every species and colour.
 * Everything is seeded: the same recipe and seed give the same plant.
 *
 * Units: recipes are in metres, y up, the plant's foot at the origin. Scale the returned group to the scene (kit: M).
 */
import * as THREE from 'three';

/** Seconds, advanced by the page each frame: the wind. */
export const FOLIAGE_TIME = { value: 0 };

/** 1 draws the raw light on each card as grey, 2 its depth in the plant: for tuning the ramp. */
export const FOLIAGE_DEBUG = { value: 0 };

/** Overgrowth groups a scene can hold (lab/overgrowth.ts), and each group's level now (0 cut back, 1 fully grown): what the shaders read. */
export const OVER_MAX = 32;
export const OVERGROWTH = { value: new Float32Array(OVER_MAX).fill(1) };

export type Rnd = () => number;
export function rng(seed: number): Rnd {
  let a = (seed * 2654435761) >>> 0 || 0x9e3779b9;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const pick = <T>(r: Rnd, xs: readonly T[]): T => xs[Math.min(xs.length - 1, Math.floor(r() * xs.length))];

// ---------------------------------------------------------------------------------------------------------------
// palettes: eight stops from deepest shadow to brightest light (sRGB). Row order is the palette's index.
// ---------------------------------------------------------------------------------------------------------------
export const PALETTES = {
  gold:     ['#16402c', '#27602c', '#47802a', '#74a02a', '#a3be30', '#cbd646', '#e6e868', '#f6f29a'],   // the sunlit yellow-green shrub
  green:    ['#123a2c', '#1b5430', '#2a7034', '#438c3a', '#63a642', '#86be50', '#abd464', '#d0e88a'],
  deep:     ['#0c2a24', '#123a2a', '#184a2e', '#205c32', '#2c7038', '#3f8842', '#5aa052', '#82ba6c'],   // cypress, topiary
  pink:     ['#7a2a64', '#a23e84', '#c4589e', '#dc74b4', '#ec90c6', '#f6acd6', '#fcc8e6', '#ffe4f4'],
  lilac:    ['#42307e', '#5c449c', '#785cb8', '#9478ce', '#ae94de', '#c8b0ec', '#decaf6', '#f2e6ff'],
  white:    ['#8c84aa', '#aaa2c4', '#c4bed8', '#dad6e8', '#eae8f2', '#f4f2f8', '#fbfafc', '#ffffff'],
  blue:     ['#28307c', '#38449c', '#4c5cb8', '#6478d0', '#8096e2', '#9eb2ee', '#bccaf6', '#dce4fc'],
  yellow:   ['#946a14', '#b8881a', '#d6a622', '#eac02e', '#f6d444', '#fbe264', '#fdec8c', '#fff6ba'],
  rose:     ['#7c1c3c', '#a42c4c', '#c8405e', '#e05c76', '#ee7c90', '#f69eac', '#fbc0c8', '#fee2e4'],
  bark:     ['#2a1c18', '#3c2a20', '#503828', '#664832', '#7c5a3e', '#94704e', '#ac8862', '#c4a27c'],
  // (2026-11-27, the infirmary's greenery) lavender deeper than lilac, so it reads purple in full sun; ripe wheat; and
  // a sage green matched to the meadow lawn, so long grass on it is texture, not spots
  lavender: ['#24164e', '#34206a', '#462c88', '#5a3ca2', '#7052ba', '#8868cc', '#a084da', '#baa2e6'],
  straw:    ['#5a4218', '#74581e', '#8e6e26', '#a88630', '#bea03e', '#d0b44e', '#e0c868', '#eedc8e'],
  sage:     ['#1c3020', '#2a4428', '#3a5830', '#4c6c38', '#608040', '#76944c', '#8ea85c', '#a8bc72'],
  // (2026-11-27, grass round 4) the meadow lawn's own olive and gold, for flower patches that grow out of it, not on it
  lawn:     ['#1e2a12', '#2c3c16', '#3e521c', '#546a22', '#6c822a', '#869834', '#a2ae44', '#bec45e'],
} as const;
export type Pal = keyof typeof PALETTES;
const PAL_NAMES = Object.keys(PALETTES) as Pal[];
const palRow = (p: Pal) => (PAL_NAMES.indexOf(p) + 0.5) / PAL_NAMES.length;

let palTex: THREE.DataTexture | null = null;
function paletteTexture(): THREE.DataTexture {
  if (palTex) return palTex;
  const w = 8, h = PAL_NAMES.length, data = new Uint8Array(w * h * 4);
  PAL_NAMES.forEach((n, y) => PALETTES[n].forEach((hex, x) => {
    const c = parseInt(hex.slice(1), 16), i = (y * w + x) * 4;
    data[i] = c >> 16; data[i + 1] = (c >> 8) & 255; data[i + 2] = c & 255; data[i + 3] = 255;
  }));
  palTex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  palTex.colorSpace = THREE.SRGBColorSpace; palTex.magFilter = THREE.LinearFilter; palTex.minFilter = THREE.LinearFilter;
  palTex.wrapS = palTex.wrapT = THREE.ClampToEdgeWrapping; palTex.needsUpdate = true;
  return palTex;
}

// ---------------------------------------------------------------------------------------------------------------
// sprites: a 4 x 4 sheet of grey value maps with alpha. Grey = how light that part of the dab is; pure
// orange-yellow marks a blossom's eye (drawn in the accent colour whatever the palette).
// ---------------------------------------------------------------------------------------------------------------
export const SPRITES = {
  broadA: 0, broadB: 1, roundA: 2, roundB: 3,
  tuftA: 4, tuftB: 5, droopA: 6, droopB: 7,
  blossom: 8, trio: 9, dab: 10, daisy: 11,
  spike: 12, raceme: 13, buds: 14, grass: 15,
} as const;
export type Sprite = keyof typeof SPRITES | `pb${number}` | `pl${number}` | `ps${number}`;
const ATLAS_N = 8, CELL = 128;
/** A sprite's cell [column, row]: the code-drawn sixteen top left, painted blossoms pb0..15 top right, painted leaves pl0..15 bottom left. */
function cellOf(sp: Sprite): [number, number] {
  if (sp.startsWith('pb')) { const i = Number(sp.slice(2)); return [4 + (i % 4), Math.floor(i / 4)]; }
  if (sp.startsWith('ps')) { const i = Number(sp.slice(2)); return [4 + (i % 4), 4 + Math.floor(i / 4)]; }
  if (sp.startsWith('pl')) { const i = Number(sp.slice(2)); return [i % 4, 4 + Math.floor(i / 4)]; }
  const i = SPRITES[sp as keyof typeof SPRITES]; return [i % 4, Math.floor(i / 4)];
}
// painted sheets (Codex, made grey by tools/kit/foliage_sheets.py), used where they exist
const sheetUrls = import.meta.glob<string>('../../../../content/generated/textures/foliage-*.png', { eager: true, query: '?url', import: 'default' });
const sheetUrl = (name: string) => Object.entries(sheetUrls).find(([p]) => p.endsWith(`/foliage-${name}.png`))?.[1];
/** Which painted sheets exist: recipes choose painted sprites over the code-drawn ones when they do. */
export const PAINTED = { blossoms: !!sheetUrl('blossoms'), leaves: !!sheetUrl('leaves'), spikes: !!sheetUrl('spikes') };
const seq = (p: 'pb' | 'pl' | 'ps', a: number, b: number) => Array.from({ length: b - a }, (_, i) => `${p}${a + i}` as Sprite);
/** Blossom sprites: faces seen from the front (tilted in the shader), painted three-quarter and side views, and clusters. */
const BLOOM_FRONT: Sprite[] = PAINTED.blossoms ? seq('pb', 0, 4) : ['blossom', 'daisy'];
const BLOOM_TURNED: Sprite[] = PAINTED.blossoms ? seq('pb', 4, 12) : ['blossom'];
const BLOOM_BUNCH: Sprite[] = PAINTED.blossoms ? seq('pb', 12, 16) : ['trio', 'dab'];
/** Upright flower spikes (slim, full, bells), and hanging bunches. */
const SPIKE_SLIM: Sprite[] = PAINTED.spikes ? seq('ps', 0, 4) : ['spike'];
const SPIKE_FULL: Sprite[] = PAINTED.spikes ? seq('ps', 4, 12) : ['spike'];
const SPIKE_HANG: Sprite[] = PAINTED.spikes ? seq('ps', 12, 16) : ['raceme'];
/** Leaf sprites by habit. */
const LEAF_BROAD: Sprite[] = PAINTED.leaves ? [...seq('pl', 0, 4), 'broadA'] : ['broadA', 'broadB'];
const LEAF_ROUND: Sprite[] = PAINTED.leaves ? seq('pl', 4, 8) : ['roundA', 'roundB'];
const LEAF_TUFT: Sprite[] = PAINTED.leaves ? [...seq('pl', 8, 12), 'tuftA'] : ['tuftA', 'tuftB'];
const LEAF_DROOP: Sprite[] = PAINTED.leaves ? seq('pl', 12, 16) : ['droopA', 'droopB'];
/** The leaf sprites by habit, for recipes grown outside this file (lab/overgrowth.ts). */
export const LEAVES = { broad: LEAF_BROAD, round: LEAF_ROUND, tuft: LEAF_TUFT, droop: LEAF_DROOP };
let loaded: Promise<unknown> = Promise.resolve();
/** Resolves when the painted sheets are in the atlas (a page waits on it before a screenshot). */
export const foliageReady = () => loaded;

let atlasTex: THREE.CanvasTexture | null = null;
/** The sprite sheet's canvas (also shown by the lab page). */
export function spriteCanvas(): HTMLCanvasElement {
  const cv = document.createElement('canvas'); cv.width = cv.height = ATLAS_N * CELL;
  const ctx = cv.getContext('2d')!, r = rng(11);
  const g = (v: number, a = 1) => { const c = Math.round(Math.max(0, Math.min(1, v)) * 255); return `rgba(${c},${c},${c},${a})`; };
  const EYE = 'rgb(255,190,0)';
  const cell = (i: number, draw: () => void) => {
    ctx.save(); ctx.beginPath(); ctx.rect((i % 4) * CELL + 1, Math.floor(i / 4) * CELL + 1, CELL - 2, CELL - 2); ctx.clip();
    ctx.translate((i % 4) * CELL + CELL / 2, Math.floor(i / 4) * CELL + CELL / 2); draw(); ctx.restore();
  };
  // one leaf from its stalk end, along +x after the turn: dark at the stalk, light at the tip, one half in shade, a pale rib
  const leaf = (x: number, y: number, ang: number, len: number, wid: number, v0: number, v1: number) => {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    const gr = ctx.createLinearGradient(0, 0, len, 0); gr.addColorStop(0, g(v0)); gr.addColorStop(1, g(v1));
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(len * 0.25, -wid, len * 0.7, -wid * 0.8, len, 0); ctx.bezierCurveTo(len * 0.7, wid * 0.8, len * 0.25, wid, 0, 0);
    ctx.fillStyle = gr; ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(len * 0.25, wid, len * 0.7, wid * 0.8, len, 0); ctx.closePath(); ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fill();
    ctx.strokeStyle = g(v1 + 0.12, 0.55); ctx.lineWidth = Math.max(1, wid * 0.09); ctx.beginPath(); ctx.moveTo(len * 0.1, 0); ctx.lineTo(len * 0.9, 0); ctx.stroke();
    ctx.restore();
  };
  const disc = (x: number, y: number, rx: number, ry: number, v: number, a = 1) => { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, 7); ctx.fillStyle = g(v, a); ctx.fill(); };
  // a rosette of broad pointed leaves: three rings, the inner ones lighter (they catch the light)
  const broad = () => {
    disc(0, 0, 34, 34, 0.2);
    const ring = (n: number, len: number, wid: number, v0: number, v1: number, from: number) => { const o = r() * 7; for (let i = 0; i < n; i++) { const a = o + (i / n) * Math.PI * 2 + (r() - 0.5) * 0.5; leaf(Math.cos(a) * from, Math.sin(a) * from, a, len * (0.85 + r() * 0.3), wid * (0.85 + r() * 0.3), v0 + (r() - 0.5) * 0.1, v1 + (r() - 0.5) * 0.14); } };
    ring(9, 52, 15, 0.22, 0.55, 6); ring(7, 38, 13, 0.36, 0.78, 3); ring(4, 24, 10, 0.55, 1.0, 0);
  };
  // a clump of small round leaves (box, privet): many little ovals, the upper ones lighter
  const round = () => {
    disc(0, 2, 44, 42, 0.2);
    const dots = Array.from({ length: 46 }, () => { const a = r() * 7, d = Math.sqrt(r()) * 50; return [Math.cos(a) * d, Math.sin(a) * d, r()]; }).sort((p, q) => q[1] - p[1] + (p[2] - q[2]) * 30);
    for (const [x, y, k] of dots) { const v = 0.3 + (1 - (y + 50) / 100) * 0.5 + (k - 0.5) * 0.3; ctx.save(); ctx.translate(x, y); ctx.rotate(r() * 7); disc(0, 0, 10 + k * 3, 7 + k * 2, v); disc(2, 2, 6, 4, v - 0.14, 0.6); ctx.restore(); }
  };
  // a tuft of fine upright leaves (cypress, yew): a fan of slim leaves from the foot
  const tuft = () => {
    disc(0, 14, 30, 36, 0.2);
    for (let i = 0; i < 30; i++) { const a = -Math.PI / 2 + (r() - 0.5) * 2.3, k = r(); leaf((r() - 0.5) * 34, 46 - r() * 26, a, 44 + k * 34, 5.5 + r() * 3, 0.24 + k * 0.1, 0.5 + k * 0.5); }
  };
  // leaves hanging off a stem (ivy, a trailing vine): pointed, wide, tips down
  const droop = () => {
    for (let i = 0; i < 9; i++) { const t = i / 8, a = Math.PI / 2 + (i % 2 ? 1 : -1) * (0.35 + r() * 0.6); leaf((r() - 0.5) * 22, -50 + t * 62, a, 34 + r() * 14, 13 + r() * 5, 0.26 + r() * 0.12, 0.6 + r() * 0.4); }
  };
  const flower = (x: number, y: number, s: number, petals: number, pw: number, eye: number) => {
    ctx.save(); ctx.translate(x, y); ctx.rotate(r() * 7); ctx.scale(s, s);
    for (let i = 0; i < petals; i++) {
      ctx.save(); ctx.rotate((i / petals) * Math.PI * 2);
      const gr = ctx.createRadialGradient(8, 0, 2, 30, 0, 30); gr.addColorStop(0, g(0.42)); gr.addColorStop(0.55, g(0.82)); gr.addColorStop(1, g(1));
      ctx.beginPath(); ctx.ellipse(29, 0, 25, pw, 0, 0, 7); ctx.fillStyle = gr; ctx.fill(); ctx.restore();
    }
    ctx.beginPath(); ctx.arc(0, 0, eye, 0, 7); ctx.fillStyle = EYE; ctx.fill(); ctx.restore();
  };
  cell(SPRITES.broadA, broad); cell(SPRITES.broadB, broad); cell(SPRITES.roundA, round); cell(SPRITES.roundB, round);
  cell(SPRITES.tuftA, tuft); cell(SPRITES.tuftB, tuft); cell(SPRITES.droopA, droop); cell(SPRITES.droopB, droop);
  cell(SPRITES.blossom, () => flower(0, 0, 1.05, 5, 19, 10));
  cell(SPRITES.trio, () => { flower(-22, 18, 0.58, 5, 19, 10); flower(24, 12, 0.56, 5, 19, 10); flower(0, -24, 0.62, 5, 19, 10); });
  cell(SPRITES.dab, () => { disc(0, 0, 40, 38, 0.36); for (let i = 0; i < 20; i++) { const a = r() * 7, d = Math.sqrt(r()) * 42; flower(Math.cos(a) * d, Math.sin(a) * d, 0.26 + r() * 0.08, 4, 20, 7); } });
  cell(SPRITES.daisy, () => flower(0, 0, 1.05, 11, 8, 15));
  cell(SPRITES.spike, () => {   // an upright spike of florets (lavender, delphinium): light at the tip
    for (let i = 0; i < 130; i++) { const t = r(), w = 4 + 15 * Math.pow(1 - t, 0.7); disc((r() - 0.5) * 2 * w, 56 - t * 112, 6.5 - t * 2, 5 - t * 1.5, 0.4 + t * 0.5 + (r() - 0.5) * 0.25); }
  });
  cell(SPRITES.raceme, () => {  // a hanging bunch (wisteria): full at the top, a tip below
    for (let i = 0; i < 150; i++) { const t = Math.pow(r(), 0.8), w = 5 + 24 * Math.pow(1 - t, 0.8); disc((r() - 0.5) * 2 * w, -54 + t * 110, 8.5 - t * 3.5, 7 - t * 3, 0.5 + (1 - t) * 0.3 + (r() - 0.5) * 0.4); }
  });
  cell(SPRITES.buds, () => { for (let i = 0; i < 9; i++) { const a = r() * 7, d = Math.sqrt(r()) * 44; flower(Math.cos(a) * d, Math.sin(a) * d, 0.2 + r() * 0.1, 5, 19, 9); } });
  cell(SPRITES.grass, () => { for (let i = 0; i < 16; i++) { const a = -Math.PI / 2 + (r() - 0.5) * 1.5, k = r(); leaf((r() - 0.5) * 20, 58, a, 60 + k * 50, 4 + r() * 2, 0.25, 0.55 + k * 0.45); } });
  return cv;
}
function atlasTexture(): THREE.CanvasTexture {
  if (atlasTex) return atlasTex;
  const cv = spriteCanvas(), ctx = cv.getContext('2d')!;
  atlasTex = new THREE.CanvasTexture(cv);
  const tex = atlasTex, put = (name: string, x: number, y: number) => {
    const url = sheetUrl(name); if (!url) return Promise.resolve();
    return new Promise<void>((done) => { const im = new Image(); im.onload = () => { ctx.clearRect(x, y, 4 * CELL, 4 * CELL); ctx.drawImage(im, x, y, 4 * CELL, 4 * CELL); tex.needsUpdate = true; done(); }; im.onerror = () => done(); im.src = url; });
  };
  loaded = Promise.all([put('blossoms', 4 * CELL, 0), put('leaves', 0, 4 * CELL), put('spikes', 4 * CELL, 4 * CELL)]);
  atlasTex.colorSpace = THREE.NoColorSpace; atlasTex.anisotropy = 4; atlasTex.generateMipmaps = true;
  atlasTex.minFilter = THREE.LinearMipmapLinearFilter;
  return atlasTex;
}

// ---------------------------------------------------------------------------------------------------------------
// the material: cards turned to the camera in the vertex stage; colour from the palette ramp in the fragment stage
// ---------------------------------------------------------------------------------------------------------------
const cardMats: (THREE.MeshLambertMaterial | null)[] = [null, null];
/**
 * The cards' material; `over` the overgrowth variant (lab/overgrowth.ts): each card also carries aGrow (its distance
 * along its vine m, the vine's length m, its lag, its group) and aRest (the height m it falls to), and as its group's
 * level falls the front draws back along the vine: cards near it brown, past it they drop to their rest and shrink away.
 */
function cardMaterial(over = false): THREE.MeshLambertMaterial {
  const have = cardMats[over ? 1 : 0];
  if (have) return have;
  const m = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide, alphaToCoverage: true });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.fTime = FOLIAGE_TIME; sh.uniforms.fDebug = FOLIAGE_DEBUG; sh.uniforms.fMap = { value: atlasTexture() }; sh.uniforms.fPal = { value: paletteTexture() };
    if (over) sh.uniforms.uOver = OVERGROWTH;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec2 aCorner; attribute vec2 aUv; attribute vec4 aA; attribute vec4 aB; attribute vec2 aC;
        uniform float fTime; varying vec2 vFuv; varying vec3 vFa; varying vec3 vFb; varying float vFw;
        const vec2 FWIND = vec2(0.93, 0.37);   // the wind's heading over the ground (x, z)
        ${over ? `attribute vec4 aGrow; attribute float aRest; uniform float uOver[${OVER_MAX}];` : ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        // wind: the card's centre leans with slow gusts, more the further out on the plant it sits (aB.x), each on its own beat (aB.y)
        vFuv = aUv; vFa = vec3(aA.z, aA.w, aB.z);
        float oK = 1.0; vFw = 0.0;
        ${over ? `{
          // the vine's front (m along it) at its group's level: past it the card has been cut. Each vine draws back on its
          // own beat (its lag: higher goes sooner); at level 1 the front stands half a metre past the tip, so none browns.
          float oL = uOver[int(aGrow.w + 0.5)];
          float oD = aGrow.x - (aGrow.y + 0.5) * smoothstep(aGrow.z, 1.0, oL);
          float oQ = clamp(oD / 0.6, 0.0, 1.0);                     // how far through its fall
          vFw = max(smoothstep(-0.5, 0.0, oD), oQ);                 // browning as the front nears, dead once past
          transformed.y = max(aRest, transformed.y - oQ * oQ * 2.4);
          transformed.xz += FWIND * oQ * 0.5;
          oK = 1.0 - smoothstep(0.5, 1.0, oQ);
        }` : ''}`)
      .replace('#include <project_vertex>', `
        vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
        // The wind. One direction for the whole scene; its strength is a field of gusts drifting downwind across the
        // world (three waves that never line up, so it has no beat), so plants side by side lean together and a gust
        // can be seen crossing a bed. A plant leans downwind and comes back; it does not swing both ways. On top, each
        // card flutters on its own, more in a gust. aB.x: how much this card gives (0 at a plant's foot).
        vec3 fWp = (modelMatrix * vec4(transformed, 1.0)).xyz;
        float fAl = dot(fWp.xz, FWIND), fAc = dot(fWp.xz, vec2(-FWIND.y, FWIND.x));
        float fEnv = 0.42 + 0.3 * sin(fAl * 0.21 - fTime * 0.83 + 1.4 * sin(fAc * 0.13 + fTime * 0.11))
                          + 0.26 * sin(fAl * 0.078 - fTime * 0.31 + fAc * 0.05 + 1.7)
                          + 0.14 * sin(fAl * 0.47 - fTime * 1.57 + fAc * 0.29);
        fEnv = clamp(fEnv, 0.0, 1.0); fEnv *= fEnv;
        float fFlut = (sin(fTime * 4.3 + aB.y) * 0.6 + sin(fTime * 6.9 + aB.y * 2.3) * 0.4) * (0.25 + fEnv);
        float fPush = aB.x * (fEnv * 0.06 + fFlut * 0.007) * length(modelMatrix[0].xyz);
        mvPosition.xy += (viewMatrix * vec4(FWIND.x, -0.25 * fEnv, FWIND.y, 0.0)).xy * fPush;
        float fGust = fEnv * 0.7 + fFlut * 0.35;
        float fSc = length(modelMatrix[0].xyz) * aA.x * oK;
        float fRoll = aA.y + fGust * aB.x * 0.09;
        vec2 fC = vec2(aCorner.x * cos(fRoll) - aCorner.y * sin(fRoll), aCorner.x * sin(fRoll) + aCorner.y * cos(fRoll));
        vFb = vec3(fC, aC.y);
        // a tilted card: squashed along the way its normal leans on screen, as a disc turned from the eye would be
        vec3 fVn = normalize(normalMatrix * normal);
        float fLean = length(fVn.xy);
        if (aC.x > 0.0 && fLean > 0.001) { vec2 fAx = fVn.xy / fLean; fC += fAx * dot(fC, fAx) * (mix(1.0, max(0.34, abs(fVn.z)), aC.x) - 1.0); }
        mvPosition.xy += fC * fSc;
        mvPosition.z += fSc * aB.w;          // toward the eye, so a card stands clear of what it grows on
        gl_Position = projectionMatrix * mvPosition;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D fMap; uniform sampler2D fPal; uniform float fDebug; varying vec2 vFuv; varying vec3 vFa; varying vec3 vFb; varying float vFw;`)
      .replace('#include <map_fragment>', `vec4 fTex = texture2D(fMap, vFuv);
        diffuseColor.a = clamp((fTex.a - 0.42) / max(fwidth(fTex.a), 0.0001) + 0.5, 0.0, 1.0);
        if (diffuseColor.a < 0.02) discard;`)
      .replace('#include <opaque_fragment>', `{
        // how much light reaches this card (the material is white, so the lit colour is the light itself)
        // A card has one shadow sample for its whole face, so a cast shadow switches it on or off as a piece. Its light
        // therefore comes mostly from which way its lobe faces the sun (smooth, and still under a moving camera); the
        // shadow map takes away only part of that, so a card at a shadow's edge shifts a little instead of flashing.
        float fNdl = 1.0, fSh = 1.0;
        #if NUM_DIR_LIGHTS > 0
          fNdl = clamp(dot(normal, directionalLights[0].direction), 0.0, 1.0);
          float fSun = dot(reflectedLight.directDiffuse, vec3(0.3, 0.6, 0.1)) / max(dot(directionalLights[0].color, vec3(0.3, 0.6, 0.1)) * 0.3183, 0.0001);
          fSh = clamp(fSun / max(fNdl, 0.05), 0.0, 1.0);
        #endif
        float fLit = smoothstep(0.05, 0.8, fNdl * mix(1.0, fSh, 0.55));
        float fEye = clamp((fTex.r - fTex.b) * 1.6, 0.0, 1.0);
        // the ramp: light, the sprite's own value, and how deep in the plant the card sits (vFa.y: 0 buried, 1 crown)
        float fV = 0.48 + (fLit - 0.6) * 0.4 + (fTex.r - 0.55) * 0.75 + (vFa.y - 0.6) * 0.5;
        fV += dot(vFb.xy, vec2(-0.6, 0.8)) * 0.07;                          // each dab is lighter on its sunward side
        // blossoms hold their colour in shade, but still turn with the light: bright where the sun lands, deep under a neighbour
        float fBl = 0.02 + fTex.r * 0.54 + fLit * 0.26 + (vFa.y - 0.6) * 0.3 + dot(vFb.xy, vec2(-0.6, 0.8)) * 0.1;
        fV = mix(fV, fBl, vFa.z);
        vec3 fCol = texture2D(fPal, vec2(clamp(fV, 0.0, 1.0) * 0.875 + 0.0625, vFa.x)).rgb;
        fCol *= mix(vec3(0.86, 0.93, 1.1), vec3(1.1, 1.02, 0.88), fLit);   // cool shade, warm sun
        fCol = mix(fCol, vec3(1.0, 0.72, 0.12) * (0.55 + 0.6 * fLit), fEye);
        fCol = mix(fCol, vec3(0.56, 0.42, 0.22) * (0.5 + 0.5 * fTex.r + 0.3 * fLit), vFw * 0.85);   // an overgrowth's cut leaves wither
        outgoingLight = fCol;
        if (fDebug > 0.5) outgoingLight = vec3(fDebug > 1.5 ? vFa.y : fLit);
      }
      #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => (over ? 'foliage-cards-over' : 'foliage-cards-3');
  return (cardMats[over ? 1 : 0] = m);
}
const barkMat = new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 1 });
// a birch's bark (t-birch, 2026-11-27: "plain pale sticks"): chalk white, dark horizontal marks scattered up it and
// thickening into a dark rough foot; painted once into a canvas wrapped round the stem (u round it, v up it)
let birchTex: THREE.CanvasTexture | null = null;
function birchBark(): THREE.CanvasTexture {
  if (birchTex) return birchTex;
  const W = 64, H = 256, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d')!, r = rng(9157);
  ctx.fillStyle = '#ece6da'; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 40; i++) { ctx.fillStyle = `rgba(190,180,160,${0.12 + r() * 0.15})`; ctx.fillRect(r() * W, r() * H, 6 + r() * 20, 2 + r() * 5); }   // soft grey bands
  for (let i = 0; i < 70; i++) {   // the marks: short dark dashes across the stem, more toward the foot
    const y = H * Math.pow(r(), 0.7), w = 4 + r() * 16, h = 1.5 + r() * 2.5 + (y / H) * 3;
    ctx.fillStyle = `rgba(${40 + r() * 20},${34 + r() * 16},${30 + r() * 12},${0.7 + r() * 0.3})`; ctx.fillRect(r() * W, y, w, h);
  }
  const g = ctx.createLinearGradient(0, H * 0.82, 0, H); g.addColorStop(0, 'rgba(60,50,42,0)'); g.addColorStop(1, 'rgba(60,50,42,0.85)');
  ctx.fillStyle = g; ctx.fillRect(0, H * 0.82, W, H * 0.18);   // the dark, rough foot (canvas y down: the stem's foot is at the bottom)
  birchTex = new THREE.CanvasTexture(cv); birchTex.colorSpace = THREE.SRGBColorSpace; birchTex.wrapS = THREE.RepeatWrapping;
  return birchTex;
}
const birchMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
const twigMat = new THREE.MeshStandardMaterial({ color: 0x6a5c52, roughness: 1 });
const proxyMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
let contactTex: THREE.CanvasTexture | null = null;
function contactMaterial(): THREE.Material {
  if (!contactTex) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const ctx = cv.getContext('2d')!, gr = ctx.createRadialGradient(32, 32, 4, 32, 32, 32);
    gr.addColorStop(0, 'rgba(20,24,40,0.62)'); gr.addColorStop(0.6, 'rgba(20,24,40,0.3)'); gr.addColorStop(1, 'rgba(20,24,40,0)');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, 64, 64);
    contactTex = new THREE.CanvasTexture(cv); contactTex.colorSpace = THREE.SRGBColorSpace;
  }
  return new THREE.MeshBasicMaterial({ map: contactTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
}
let contactMat: THREE.Material | null = null;

// ---------------------------------------------------------------------------------------------------------------
// the builder: recipes add cards, shadow lobes and contact shadows; build() makes the group
// ---------------------------------------------------------------------------------------------------------------
type V3 = [number, number, number];
export type CardOpt = { roll?: number; sway?: number; glow?: number; lift?: number; flip?: boolean;
  /** 0 to 1: how far the card turns to face along its normal instead of the camera (a blossom seen at an angle is an oval) */
  tilt?: number };
export class Foliage {
  private pos: number[] = []; private nrm: number[] = []; private corner: number[] = []; private uv: number[] = [];
  private a: number[] = []; private b: number[] = []; private c: number[] = []; private idx: number[] = [];
  private stems: { x: number; y: number; z: number; h: number; r: number; pale: boolean }[] = [];
  private limbs: { p: V3; d: V3; len: number; r: number }[] = [];
  private lobes: { c: V3; r: V3 }[] = []; private contacts: { x: number; z: number; y: number; rx: number; rz: number }[] = [];
  private og: number[] = []; private orest: number[] = [];
  cards = 0;
  /** Set while an overgrowth adds its cards (lab/overgrowth.ts): [m along its vine, the vine's length m, lag, group]. */
  over: [number, number, number, number] | null = null;
  /** With `over`: the height (m) a cut card falls to. */
  rest = 0;
  constructor(readonly r: Rnd) {}

  /** One card: centre p (m), the normal it lights by, half-size s (m), its sprite and palette, ao 0 (buried) to 1 (crown). */
  card(p: V3, n: V3, s: number, sprite: Sprite, pal: Pal, ao: number, o: CardOpt = {}) {
    const base = this.pos.length / 3, [cc, cr] = cellOf(sprite), u0 = cc / ATLAS_N, v0 = 1 - (cr + 1) / ATLAS_N, d = 1 / ATLAS_N;
    const nl = Math.hypot(n[0], n[1], n[2]) || 1, [ua, ub] = o.flip ? [u0 + d, u0] : [u0, u0 + d];
    const cs = [[-1, -1, ua, v0], [1, -1, ub, v0], [1, 1, ub, v0 + d], [-1, 1, ua, v0 + d]];
    const phase = this.r() * 6.283;
    for (const [cx, cy, u, v] of cs) {
      this.pos.push(p[0], p[1], p[2]); this.nrm.push(n[0] / nl, n[1] / nl, n[2] / nl); this.corner.push(cx, cy); this.uv.push(u, v);
      this.a.push(s, o.roll ?? 0, palRow(pal), Math.max(0, Math.min(1, ao))); this.b.push(o.sway ?? 1, phase, o.glow ?? 0, o.lift ?? 0.35); this.c.push(o.tilt ?? 0, 0);
      if (this.over) { this.og.push(...this.over); this.orest.push(this.rest); }
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3); this.cards++;
  }
  /** A lobe that casts the plant's shadow (and shades the cards on its far side). */
  lobe(c: V3, r: V3) { this.lobes.push({ c, r }); }
  /** A bare woody stem (a tree's trunk), r at the foot; pale for a birch. */
  stem(x: number, y: number, z: number, h: number, r: number, pale = false) { this.stems.push({ x, y, z, h, r, pale }); }
  /** A branch: from p along d (a direction), len m, r at its foot, tapering (a birch's limbs into its crown). */
  limb(p: V3, d: V3, len: number, r: number) { this.limbs.push({ p, d, len, r }); }
  /** A soft dark patch on the ground under the plant. */
  contact(x: number, z: number, rx: number, rz = rx, y = 0.012) { this.contacts.push({ x, z, y, rx, rz }); }

  build(): THREE.Group {
    const g = new THREE.Group();
    if (this.cards) {
      const geo = new THREE.BufferGeometry(), f = (xs: number[], n: number) => new THREE.Float32BufferAttribute(xs, n);
      geo.setAttribute('position', f(this.pos, 3)); geo.setAttribute('normal', f(this.nrm, 3)); geo.setAttribute('aCorner', f(this.corner, 2));
      geo.setAttribute('aUv', f(this.uv, 2)); geo.setAttribute('aA', f(this.a, 4)); geo.setAttribute('aB', f(this.b, 4)); geo.setAttribute('aC', f(this.c, 2)); geo.setIndex(this.idx);
      const over = this.og.length === this.cards * 16;
      if (over) { geo.setAttribute('aGrow', f(this.og, 4)); geo.setAttribute('aRest', f(this.orest, 1)); }
      geo.computeBoundingSphere(); geo.boundingSphere!.radius += 0.8;
      const m = new THREE.Mesh(geo, cardMaterial(over)); m.receiveShadow = true; m.userData.foliage = true; g.add(m);
      // an overgrowth's cards move with its level: kept out of the kit's batches (kit-batch.ts leaves meshes with a hook)
      if (over) m.onBeforeRender = () => {};
    }
    if (this.lobes.length) {
      const unit = new THREE.IcosahedronGeometry(1, 1), P: number[] = [], I: number[] = [], up = unit.getAttribute('position'), ui = unit.getIndex();
      for (const { c, r } of this.lobes) {
        const b = P.length / 3;
        for (let i = 0; i < up.count; i++) P.push(c[0] + up.getX(i) * r[0], c[1] + up.getY(i) * r[1], c[2] + up.getZ(i) * r[2]);
        if (ui) for (let i = 0; i < ui.count; i++) I.push(b + ui.getX(i)); else for (let i = 0; i < up.count; i++) I.push(b + i);
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); geo.setIndex(I);
      const m = new THREE.Mesh(geo, proxyMat); m.castShadow = true; m.userData.foliageProxy = true; g.add(m);
    }
    for (const t of this.stems) {
      if (t.pale && !birchMat.map) { birchMat.map = birchBark(); birchMat.needsUpdate = true; }
      const c = new THREE.Mesh(new THREE.CylinderGeometry(t.r * 0.6, t.r, t.h, 7), t.pale ? birchMat : barkMat); c.position.set(t.x, t.y + t.h / 2, t.z); c.castShadow = c.receiveShadow = true; g.add(c);
    }
    const up = new THREE.Vector3(0, 1, 0);
    for (const l of this.limbs) {
      const d = new THREE.Vector3(...l.d).normalize(), c = new THREE.Mesh(new THREE.CylinderGeometry(l.r * 0.35, l.r, l.len, 5), twigMat);
      c.quaternion.setFromUnitVectors(up, d); c.position.set(l.p[0] + d.x * l.len / 2, l.p[1] + d.y * l.len / 2, l.p[2] + d.z * l.len / 2); c.castShadow = true; g.add(c);
    }
    for (const c of this.contacts) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(c.rx * 2, c.rz * 2), (contactMat ??= contactMaterial()));
      m.rotation.x = -Math.PI / 2; m.position.set(c.x, c.y, c.z); m.renderOrder = 2; g.add(m);
    }
    return g;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// the shared lobe filler: cards over the outside of a clump of ellipsoids
// ---------------------------------------------------------------------------------------------------------------
type Lobe = { c: V3; r: V3 };
export type Bloom = { pal: Pal | Pal[]; sprites?: Sprite[]; amount?: number; size?: number; drifts?: number };
type Fill = { pal: Pal | Pal[]; sprites: Sprite[]; size: number; density?: number; floor?: number; bloom?: Bloom; sway?: number; aoLo?: number; upright?: boolean; lift?: number;
  /** lobes that hide cards inside them but get none of their own here (a bed fills its colour runs one at a time) */
  hide?: Lobe[];
  /** how many dark core cards per surface card (default 1/3): fewer for low airy growth such as long grass */
  core?: number };

/**
 * Cover a clump of lobes with cards: points spread evenly over each ellipsoid, dropped where they fall inside a
 * neighbour (so the clump is one skin, not balls), below the floor, or mostly under the plant. Blossoms gather in
 * drifts: a few spots on the clump where they are thick, thinning away from them.
 */
function fill(F: Foliage, lobes: Lobe[], o: Fill) {
  const r = F.r, pals = Array.isArray(o.pal) ? o.pal : [o.pal], floor = o.floor ?? 0.02;
  let y0 = Infinity, y1 = -Infinity;
  for (const l of lobes) { y0 = Math.min(y0, Math.max(floor, l.c[1] - l.r[1])); y1 = Math.max(y1, l.c[1] + l.r[1]); }
  const bl = o.bloom, bpals = bl ? (Array.isArray(bl.pal) ? bl.pal : [bl.pal]) : [];
  const drifts: { p: V3; pal: Pal }[] = [];
  if (bl) for (let i = 0; i < (bl.drifts ?? Math.max(2, Math.round(lobes.length * 0.8))); i++) {
    const l = pick(r, lobes), a = r() * 6.283, e = 0.2 + r() * 0.9;
    drifts.push({ p: [l.c[0] + Math.cos(a) * Math.cos(e) * l.r[0], l.c[1] + Math.sin(e) * l.r[1], l.c[2] + Math.sin(a) * Math.cos(e) * l.r[2]], pal: bpals[i % bpals.length] });
  }
  lobes.forEach((l, li) => {
    const area = 4 * Math.PI * Math.pow((Math.pow(l.r[0] * l.r[1], 1.6) + Math.pow(l.r[0] * l.r[2], 1.6) + Math.pow(l.r[1] * l.r[2], 1.6)) / 3, 1 / 1.6);
    const n = Math.max(6, Math.round((o.density ?? 1) * area / (o.size * o.size * 1.15))), off = r() * 6.283, pal = pick(r, pals);
    // a dark core: what shows through the gaps between leaves is deep shade, never the stone behind
    for (let i = 0; i < n * (o.core ?? 1 / 3); i++) { const a = r() * 6.283, e = (r() - 0.25) * 1.6, k = 0.62; const p: V3 = [l.c[0] + Math.cos(a) * Math.cos(e) * l.r[0] * k, l.c[1] + Math.sin(e) * l.r[1] * k, l.c[2] + Math.sin(a) * Math.cos(e) * l.r[2] * k]; if (p[1] > floor) F.card(p, [0, 1, 0], o.size * 1.5, 'roundA', pal, 0.2, { roll: r() * 6.283, sway: 0.2, lift: 0 }); }
    for (let i = 0; i < n; i++) {
      const yy = 1 - ((i + 0.5) / n) * 2, rad = Math.sqrt(1 - yy * yy), th = i * 2.39996 + off;
      const d: V3 = [Math.cos(th) * rad + (r() - 0.5) * 0.25, yy + (r() - 0.5) * 0.25, Math.sin(th) * rad + (r() - 0.5) * 0.25];
      if (d[1] < -0.55) continue;                                           // nobody sees a bush's underside
      const k = 0.9 + r() * 0.16, p: V3 = [l.c[0] + d[0] * l.r[0] * k, l.c[1] + d[1] * l.r[1] * k, l.c[2] + d[2] * l.r[2] * k];
      if (p[1] < floor) continue;
            let crev = 9; for (const m of o.hide ? [...lobes, ...o.hide] : lobes) if (m !== l) crev = Math.min(crev, Math.hypot((p[0] - m.c[0]) / m.r[0], (p[1] - m.c[1]) / m.r[1], (p[2] - m.c[2]) / m.r[2]));
      if (crev < 0.82) continue;
      const fold = 0.5 + 0.5 * Math.min(1, Math.max(0, (crev - 0.82) / 0.4));   // darker in the fold where two masses meet
      const nq = Math.hypot(d[0] / l.r[0], d[1] / l.r[1], d[2] / l.r[2]) || 1, nrm: V3 = [d[0] / l.r[0] / nq, d[1] / l.r[1] / nq + 0.3, d[2] / l.r[2] / nq];
      const t = (p[1] - y0) / Math.max(0.05, y1 - y0), ao = lerp(o.aoLo ?? 0.12, 1, Math.pow(Math.max(0, t), 0.75)) * (0.8 + 0.2 * Math.max(0, d[1])) * fold + (r() - 0.5) * 0.14;
      const s = o.size * (0.75 + r() * 0.5);
      F.card(p, nrm, s, pick(r, o.sprites), r() < 0.25 ? pick(r, pals) : pal, ao, { roll: o.upright ? (r() - 0.5) * 0.7 : PAINTED.leaves ? (r() - 0.5) * 1.5 : r() * 6.283, sway: (o.sway ?? 1) * (0.3 + t), flip: r() < 0.5, lift: o.lift });
      if (bl && d[1] > -0.2) {
        let near = Infinity, np: Pal = bpals[0];
        for (const dr of drifts) { const dd = Math.hypot(p[0] - dr.p[0], p[1] - dr.p[1], p[2] - dr.p[2]); if (dd < near) { near = dd; np = dr.pal; } }
        const reach = Math.max(0.25, Math.max(...l.r) * 0.9);
        if (r() < (bl.amount ?? 0.5) * Math.exp(-(near * near) / (reach * reach)) * 1.6) {
          const bs = (bl.size ?? o.size * 0.6) * (0.8 + r() * 0.4), nn = Math.hypot(nrm[0], nrm[1], nrm[2]), out = bs * 0.5;
          blossom(F, [p[0] + (nrm[0] / nn) * out + (r() - 0.5) * o.size, p[1] + (nrm[1] / nn) * out + (r() - 0.5) * o.size * 0.6, p[2] + (nrm[2] / nn) * out + (r() - 0.5) * o.size],
            nrm, bs, np, ao + 0.2, (o.sway ?? 1) * (0.4 + t), (o.lift ?? 0.35) + 0.5, bl.sprites);
        }
      }
    }
    F.lobe(l.c, [l.r[0] * 0.8, l.r[1] * 0.8, l.r[2] * 0.8]);
  });
}

/**
 * One blossom at p on a surface facing n: a face turned its own way (n, knocked about), drawn as the oval a tilted
 * flower shows, or a painted three-quarter or side view, or a bunch.
 */
export function blossom(F: Foliage, p: V3, n: V3, s: number, pal: Pal, ao: number, sway: number, lift: number, only?: Sprite[]) {
  const r = F.r, nl = Math.hypot(n[0], n[1], n[2]) || 1, face: V3 = [n[0] / nl + (r() - 0.5) * 1.1, n[1] / nl + (r() - 0.5) * 0.9, n[2] / nl + (r() - 0.5) * 1.1];
  const k = r(), kind = only ? 3 : k < 0.42 ? 0 : k < 0.72 ? 1 : 2;
  const sprite = kind === 3 ? pick(r, only!) : kind === 0 ? pick(r, BLOOM_FRONT) : kind === 1 ? pick(r, BLOOM_TURNED) : pick(r, BLOOM_BUNCH);
  const size = s * (kind === 2 ? 1.25 : 1), roll = r() * 6.283, flip = r() < 0.5, tilt = kind === 1 ? 0.3 : kind === 2 ? 0.55 : 1;
  F.card(p, face, size, sprite, pal, ao, { roll, sway, flip, tilt, glow: 0.85, lift });
}

// ---------------------------------------------------------------------------------------------------------------
// recipes
// ---------------------------------------------------------------------------------------------------------------
export type BushOpt = { r?: number; h?: number; pal?: Pal | Pal[]; sprites?: Sprite[]; leaf?: number; bloom?: Bloom; lobes?: number; at?: [number, number]; y?: number; density?: number;
  /** 0 to 1: loose sprigs standing out past the skin, and lobes less even, so the outline breaks up instead of
   *  reading as round lobes (t-shrubs 2026-11-27: "the bushes read as clusters of round lobes") */
  sprigs?: number };
/** A shrub: a main mass with smaller ones crowding its foot. r: half its width, h: its height (m). */
export function bush(F: Foliage, o: BushOpt = {}) {
  const r = F.r, R = o.r ?? 0.6, H = o.h ?? R * 1.5, [x, z] = o.at ?? [0, 0], y = o.y ?? 0, leafS = o.leaf ?? 0.17, sg = o.sprigs ?? 0;
  const lobes: Lobe[] = [{ c: [x, y + H * 0.52, z], r: [R * 0.78, H * 0.5, R * 0.78] }], n = o.lobes ?? 4 + Math.floor(r() * 3) + Math.round(sg * 3), a0 = r() * 6.283;
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * 6.283 + (r() - 0.5) * 0.7, d = R * (0.42 + r() * 0.3), rr = R * (0.36 + r() * 0.26) * (1 - sg * 0.25 * r()), hh = H * (0.22 + r() * 0.26);
    const lift = sg ? (r() - 0.3) * H * 0.35 * sg : 0;   // a ragged bush's masses sit at uneven heights, some higher up its flank
    lobes.push({ c: [x + Math.cos(a) * d, y + hh * (0.75 + r() * 0.5) + Math.max(0, lift), z + Math.sin(a) * d], r: [rr * (1 + (r() - 0.5) * sg * 0.5), hh, rr] });
  }
  fill(F, lobes, { pal: o.pal ?? 'gold', sprites: o.sprites ?? [...LEAF_BROAD, ...LEAF_BROAD, ...LEAF_ROUND], size: leafS, bloom: o.bloom, floor: y + 0.03, density: o.density });
  if (sg) {   // sprigs: short shoots of two or three leaves reaching out past the skin, most on the upper half
    const pals = Array.isArray(o.pal) ? o.pal : [o.pal ?? 'gold'];
    for (const l of lobes) for (let i = 0; i < Math.round(sg * 9 * Math.max(...l.r) / 0.3); i++) {
      const a = r() * 6.283, e = -0.1 + r() * 1.3, dir: V3 = [Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e)];
      const base: V3 = [l.c[0] + dir[0] * l.r[0] * 0.95, l.c[1] + dir[1] * l.r[1] * 0.95, l.c[2] + dir[2] * l.r[2] * 0.95];
      if (base[1] < y + 0.08) continue;
      const reach = leafS * (1.2 + r() * 1.8), pal = pick(r, pals);
      for (let k = 1; k <= 2 + Math.floor(r() * 2); k++) {
        const t = (k / 3) * reach;
        F.card([base[0] + dir[0] * t, base[1] + dir[1] * t + 0.02 * k, base[2] + dir[2] * t], [dir[0], dir[1] + 0.4, dir[2]], leafS * (0.75 - k * 0.1) * (0.85 + r() * 0.3),
          pick(r, [...LEAF_BROAD, ...LEAF_DROOP]), pal, 0.65 + r() * 0.35, { roll: (r() - 0.5) * 1.6, sway: 1.3, flip: r() < 0.5 });
      }
    }
  }
  F.contact(x, z, R * 1.25, R * 1.25, y + 0.012);
}

export type BedOpt = { w: number; d?: number; h?: number; y?: number; pal?: Pal[]; blooms?: Pal[]; spikes?: Pal[]; back?: number; seedFlip?: boolean; spill?: number };
/**
 * A planted bed, w along x and d deep (m), soil at y: low mounds of leaf packed across it, taller at the back
 * (-z, the wall side), blossoms in drifts of one colour at a time, and upright spikes standing through in groups.
 */
export function bed(F: Foliage, o: BedOpt) {
  const r = F.r, w = o.w, d = o.d ?? 0.7, y = o.y ?? 0, H = o.h ?? 0.4, pals = o.pal ?? ['green', 'gold', 'gold'], blooms = o.blooms ?? ['pink', 'lilac', 'white'];
  const lobes: Lobe[] = [], tag: number[] = [];
  // which colour blooms where: runs of 0.5 to 1.3 m along the bed, a few runs left green
  const runs: { x1: number; c: number }[] = []; for (let x = -w / 2; x < w / 2;) { x += 0.5 + r() * 0.8; runs.push({ x1: x, c: r() < 0.15 ? -1 : Math.floor(r() * blooms.length) }); }
  // plants of mixed size, packed: big ones first at random, small ones fill what is left; taller at the back
  const spots: [number, number, number][] = [];
  for (const size of [0.3, 0.3, 0.22, 0.22, 0.16, 0.16, 0.16]) for (let i = 0; i < (w * d) / (size * size) ; i++) {
    const px = (r() - 0.5) * (w - size), pz = (r() - 0.5) * Math.max(0.02, d - size * 0.6);
    if (spots.every(([sx, sz, sr]) => Math.hypot(px - sx, pz - sz) > (sr + size) * 0.72)) spots.push([px, pz, size]);
  }
  for (const [px, pz0, rr] of spots) {
    const back = 1 - (pz0 + d / 2) / d, hh = H * (0.5 + 0.9 * r() * (rr / 0.3) + (o.back ?? 0.6) * back) * (0.6 + rr * 1.6);
    const pz = pz0 + (pz0 > d / 2 - 0.25 ? (o.spill ?? 0.1) : 0);
    lobes.push({ c: [px, y + hh * 0.42, pz], r: [rr * 1.05, hh * 0.6, rr * 1.05] }); tag.push(runs.find((q) => px < q.x1)?.c ?? -1);
  }
  // each run is filled on its own so its blossoms keep one colour; lobes still hide inside their neighbours
  const groups = new Map<number, Lobe[]>(); lobes.forEach((l, i) => { const k = tag[i]; if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(l); });
  for (const [k, ls] of groups) {
    fill(F, ls, { hide: lobes.filter((l) => !ls.includes(l)), pal: pals, sprites: [...LEAF_BROAD, ...LEAF_ROUND], size: 0.11, floor: y + 0.01, aoLo: 0.0,
      bloom: k < 0 ? undefined : { pal: blooms[k], amount: 1.5, size: 0.1, drifts: Math.max(2, Math.round(ls.length / 2.5)) } });
  }
  // spikes: groups of three to six, each leaning a little, standing 0.25 to 0.5 m above the leaf
  const sp = o.spikes ?? ['blue', 'lilac'];
  if (sp.length) for (let x = -w / 2 + 0.3; x < w / 2 - 0.2; x += 0.7 + r() * 0.9) {
    const pal = pick(r, sp), z0 = -d / 2 + d * (0.15 + r() * 0.45), n = 3 + Math.floor(r() * 4), kind = r() < 0.5 ? SPIKE_SLIM : SPIKE_FULL;
    for (let i = 0; i < n; i++) {
      const px = x + (r() - 0.5) * 0.45, pz = z0 + (r() - 0.5) * 0.3, hs = (kind === SPIKE_SLIM ? 0.2 : 0.24) + r() * 0.08;
      F.card([px, y + H * 0.8 + hs * (0.75 + r() * 0.4), pz], [(r() - 0.5) * 0.8, 0.7, 0.6], hs, pick(r, kind), pal, 0.8, { roll: (r() - 0.5) * 0.4, sway: 1.8, glow: 0.85, lift: 0.7, flip: r() < 0.5 });
    }
  }
  F.contact(0, d * 0.15, w * 0.56, d * 0.95, y + 0.012);
}
export type ConeOpt = { r?: number; h?: number; pal?: Pal; at?: [number, number]; y?: number; tiers?: number };
/** A clipped cone (cypress, a topiary spire): r at the foot, h tall (m), fine upright tufts, dark with a lit flank. */
export function cone(F: Foliage, o: ConeOpt = {}) {
  const r = F.r, R = o.r ?? 0.32, H = o.h ?? 1.5, [x, z] = o.at ?? [0, 0], y = o.y ?? 0, s = 0.085;
  for (let h = 0.04; h < H; h += s * 0.95) {
    const t = h / H, rad = R * (0.3 + 0.7 * Math.sin(Math.min(1, t * 2.2 + 0.25) * Math.PI / 2)) * Math.pow(1 - t, 0.75) + 0.015;
    const n = Math.max(3, Math.round((2 * Math.PI * rad) / (s * 1.1))), off = r() * 6.283;
    for (let i = 0; i < n; i++) {
      const a = off + (i / n) * 6.283 + (r() - 0.5) * 0.3, k = 0.92 + r() * 0.14;
      F.card([x + Math.cos(a) * rad * k, y + h + (r() - 0.5) * s, z + Math.sin(a) * rad * k], [Math.cos(a), 0.45, Math.sin(a)], s * (0.85 + r() * 0.4), pick(r, LEAF_TUFT),
        o.pal ?? 'deep', 0.25 + 0.6 * t + (r() - 0.5) * 0.2, { roll: (r() - 0.5) * 0.8, sway: 0.25 + t * 0.9, flip: r() < 0.5, lift: 0.3 });
    }
  }
  for (let i = 0; i < 4; i++) { const t = (i + 0.5) / 4, rad = R * Math.pow(1 - t, 0.75) * 0.85 + 0.02; F.lobe([x, y + t * H, z], [rad, H / 6, rad]); }
  F.contact(x, z, R * 1.5, R * 1.5, y + 0.012);
}

export type CascadeOpt = { w: number; drop: number; pal?: Pal | Pal[]; bloom?: Bloom; crown?: number; thick?: number; clumps?: number };
/**
 * A vine spilling over a wall's top. Its frame: x along the wall, y up with 0 at the wall's top, +z out of its face.
 * A crown of leaf heaps on the top, and from it strands hang down the face: long where a clump is (one to three along
 * the run), short between, each strand a chain of cards that narrows to its tip and wanders a little.
 */
export function cascade(F: Foliage, o: CascadeOpt) {
  const r = F.r, w = o.w, pals = Array.isArray(o.pal) ? o.pal : [o.pal ?? 'gold'], crown = o.crown ?? 0.26, leafS = 0.13;
  const lobes: Lobe[] = [];
  for (let x = -w / 2 + crown * 0.6; x < w / 2 - crown * 0.3; x += crown * (0.7 + r() * 1.1)) {
    const rr = crown * (0.45 + r() * 0.75); lobes.push({ c: [x, rr * 0.35, 0.05 + r() * 0.08], r: [rr, rr * 0.75, rr * 0.8] });
  }
  fill(F, lobes, { pal: pals, sprites: [...LEAF_BROAD, ...LEAF_DROOP], size: leafS, floor: -0.12, bloom: o.bloom ? { ...o.bloom, amount: (o.bloom.amount ?? 0.5) * 0.7 } : undefined, aoLo: 0.45 });
  // where the strands hang long
  const clumps = Array.from({ length: o.clumps ?? Math.max(2, Math.round(w / 0.9)) }, (_, i) => ({ x: (r() - 0.5) * w * 0.8, w: 0.3 + r() * 0.55, len: i ? 0.3 + r() * 0.55 : 0.85 + r() * 0.15 }));
  const bpals = o.bloom ? (Array.isArray(o.bloom.pal) ? o.bloom.pal : [o.bloom.pal]) : [];
  const drifts = o.bloom ? clumps.map((c, i) => ({ x: c.x + (r() - 0.5) * 0.3, y: -o.drop * c.len * (0.25 + r() * 0.4), pal: bpals[i % bpals.length], rad: 0.3 + r() * 0.3 })) : [];
  for (let x = -w / 2 + 0.05; x < w / 2; x += 0.055 + r() * 0.05) {
    let reach = 0.14 + r() * 0.2;
    for (const c of clumps) reach = Math.max(reach, c.len * Math.exp(-Math.pow((x - c.x) / c.w, 2)) * (0.75 + r() * 0.35));
    const L = o.drop * Math.min(1, reach), z0 = 0.1 + r() * (o.thick ?? 0.14), pal = pick(r, pals);
    let px = x, drift = (r() - 0.5) * 0.06;
    for (let t = 0.02; t < L; t += leafS * (0.62 + r() * 0.3)) {
      const k = t / L, s = leafS * lerp(1.05, 0.55, Math.pow(k, 1.4)) * (0.85 + r() * 0.3);
      px += drift + (r() - 0.5) * 0.05; drift *= 0.93;
      F.card([px, -t, z0 * (1 - k * 0.5)], [(r() - 0.5) * 0.6, 0.55, 1], s, r() < 0.7 ? pick(r, LEAF_DROOP) : pick(r, LEAF_BROAD), pal, lerp(0.85, 0.4, k) + (r() - 0.5) * 0.2,
        { roll: (r() - 0.5) * 0.9, sway: 0.4 + k * 2.2, flip: r() < 0.5, lift: 0.5 });
      for (const d of drifts) if (r() < (o.bloom!.amount ?? 0.5) * Math.exp(-(Math.pow(px - d.x, 2) + Math.pow(-t - d.y, 2)) / (d.rad * d.rad))) {
        const bs = (o.bloom!.size ?? 0.09) * (0.8 + r() * 0.45);
        const bp: V3 = [px + (r() - 0.5) * 0.12, -t + (r() - 0.5) * 0.1, z0 + 0.06];
        if (!o.bloom!.sprites && r() < 0.28) F.card(bp, [(r() - 0.5) * 0.6, 0.5, 1], bs * 1.7, pick(r, SPIKE_HANG), d.pal, 0.9, { roll: (r() - 0.5) * 0.35, sway: 0.6 + k * 2.4, glow: 0.85, lift: 1.1, flip: r() < 0.5 });
        else blossom(F, bp, [(r() - 0.5) * 0.8, 0.5, 1], bs, d.pal, 0.95, 0.4 + k * 2.2, 1.1, o.bloom!.sprites);
      }
    }
    if (L > 0.3) F.lobe([x, -L * 0.45, z0 * 0.6], [0.06, L * 0.5, 0.05]);
  }
}

export type TreeOpt = { h?: number; r?: number; pal?: Pal | Pal[]; bloom?: Bloom; at?: [number, number]; y?: number;
  /** a birch: a tall pale stem with its bark marked, the crown high, narrow and loose, limbs showing into it */
  birch?: boolean;
  /** how far the crown's masses spread out (1: as round as it is tall) and how flat they are (1: round); a wisteria's
   *  crown is wide and low */
  spread?: number; squash?: number;
  /** long flower bunches hanging from the crown's underside (a wisteria, t-wisteria 2026-11-27: "it should hang in
   *  long drooping clusters"): n of them, len [min, max] m long */
  hang?: { pal: Pal | Pal[]; n?: number; len?: [number, number]; size?: number } };
/** A small round-headed tree (a flowering cherry, a clipped standard): a bare stem and a crown of several masses. */
export function tree(F: Foliage, o: TreeOpt = {}) {
  const r = F.r, H = o.h ?? 3.2, R = o.r ?? 1.2, [x, z] = o.at ?? [0, 0], y = o.y ?? 0, b = !!o.birch, sp = o.spread ?? 1, sq = o.squash ?? 1;
  const cy = y + H - R * (b ? 1.15 : 0.85) * sq;
  const lobes: Lobe[] = [{ c: [x, cy, z], r: b ? [R * 0.7, R * 1.15, R * 0.7] : [R * 0.8 * sp, R * 0.72 * sq, R * 0.8 * sp] }];
  for (let i = 0; i < (b ? 9 : 6); i++) {
    const a = (i / (b ? 9 : 6)) * 6.283 + r(), d = R * (0.5 + r() * 0.25) * sp, rr = R * (b ? 0.34 + r() * 0.2 : 0.42 + r() * 0.2);
    lobes.push({ c: [x + Math.cos(a) * d, cy + (r() - 0.45) * R * (b ? 1.5 : 0.6) * sq, z + Math.sin(a) * d], r: [rr, rr * (b ? 1.1 : 0.85) * sq, rr] });
  }
  fill(F, lobes, { pal: o.pal ?? 'green', sprites: b ? [...LEAF_ROUND, ...LEAF_DROOP] : [...LEAF_BROAD, ...LEAF_ROUND], size: b ? 0.17 : 0.2, bloom: o.bloom, floor: y + 0.4, aoLo: 0.2, density: b ? 0.62 : 1 });
  F.contact(x, z, R * 1.1 * sp, R * 1.1 * sp, y + 0.012);
  const stemR = b ? 0.07 + R * 0.03 : 0.09 + R * 0.05;
  F.stem(x, y, z, cy - y + (b ? R * 0.6 : 0), stemR, b);
  if (b) {   // limbs: a few dark branches leaving the upper stem and climbing out into the loose crown, where they show
    const n = 4 + Math.floor(r() * 3), a0 = r() * 6.283;
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * 6.283 + (r() - 0.5) * 0.6, h0 = cy - R * (0.95 - 0.8 * (i / n)) + (r() - 0.5) * 0.2, out = 0.55 + r() * 0.35;
      F.limb([x, h0, z], [Math.cos(a) * out, 1, Math.sin(a) * out], R * (0.7 + r() * 0.45), stemR * (0.38 + r() * 0.15));
    }
  }
  if (o.hang) {   // bunches hanging from the crown's lower skin: chains of flower cards, full at the top, thinning to a tip
    const pals = Array.isArray(o.hang.pal) ? o.hang.pal : [o.hang.pal], [l0, l1] = o.hang.len ?? [0.45, 1.1], s0 = o.hang.size ?? 0.13;
    const leafPals = Array.isArray(o.pal) ? o.pal : [o.pal ?? 'green'];
    for (let i = 0; i < (o.hang.n ?? 60); i++) {
      const l = pick(r, lobes), a = r() * 6.283, e = -0.15 - r() * 0.65;   // the underside and lower flank of a mass
      const top: V3 = [l.c[0] + Math.cos(a) * Math.cos(e) * l.r[0] * 0.95, l.c[1] + Math.sin(e) * l.r[1] * 0.95, l.c[2] + Math.sin(a) * Math.cos(e) * l.r[2] * 0.95];
      if (top[1] < y + 1.2) continue;   // never down to the ground: a person walks under a wisteria
      const L = Math.min(l0 + r() * (l1 - l0), top[1] - y - 1.0), pal = pick(r, pals), nrm: V3 = [Math.cos(a) * 0.6, 0.35, Math.sin(a) * 0.6];
      let px = top[0], pz = top[2];
      for (let t = 0; t < L; t += s0 * 1.05) {
        const k = t / Math.max(0.01, L), sz = s0 * lerp(1.1, 0.55, Math.pow(k, 1.2)) * (0.85 + r() * 0.3);
        px += (r() - 0.5) * 0.03; pz += (r() - 0.5) * 0.03;
        F.card([px, top[1] - t - sz * 0.6, pz], nrm, sz, pick(r, SPIKE_HANG), pal, lerp(0.95, 0.7, k) + (r() - 0.5) * 0.15,
          { roll: (r() - 0.5) * 0.25, sway: 0.5 + k * 1.6, glow: 0.8, lift: 0.9, flip: r() < 0.5 });
      }
      if (r() < 0.5) F.card([top[0], top[1] - s0 * 0.3, top[2]], nrm, s0 * 1.2, pick(r, LEAF_DROOP), pick(r, leafPals), 0.5,
        { roll: (r() - 0.5) * 0.8, sway: 0.6, flip: r() < 0.5, lift: 0.4 });   // a leaf at the bunch's head
    }
  }
}

export type PatchOpt = { r?: number; h?: number; pal?: Pal[]; n?: number; spikes?: Pal[]; blooms?: Pal[]; bloom?: number;
  /** 0 to 1: how much of the dark core shows through (default 0.35; long grass less, so it lightens the lawn, not spots it) */
  core?: number };
/**
 * Ground cover where a lawn grows long (2026-11-27, the infirmary's lawns): a loose drift of grass tufts and low leaf
 * over a disc r across (m), a few tufts taller than the rest, with flowers through it if `blooms` (small faces) or
 * `spikes` (lavender, lupins) are given. Low (h, about 0.3 m), so nobody is stopped by it.
 */
export function patch(F: Foliage, o: PatchOpt = {}) {
  const r = F.r, R = o.r ?? 1.2, H = o.h ?? 0.3, pals = o.pal ?? ['green', 'gold'], n = o.n ?? Math.round(5 + R * R * 4);
  const lobes: Lobe[] = [];
  for (let i = 0; i < n; i++) {
    const a = r() * 6.283, d = Math.sqrt(r()) * R * 0.8, rr = 0.18 + r() * 0.2, hh = H * (0.45 + r() * 0.9) * (1 - 0.35 * d / R);   // packed, so a drift is one mass
    lobes.push({ c: [Math.cos(a) * d, hh * 0.45, Math.sin(a) * d * 0.8], r: [rr, hh * 0.6, rr] });
  }
  fill(F, lobes, { pal: pals, sprites: [...LEAF_TUFT, ...LEAF_TUFT, ...LEAF_ROUND], size: 0.12, floor: 0.0, aoLo: o.core !== undefined ? 0.5 - o.core : 0.05, upright: true, sway: 1.4, core: o.core ?? 1 / 3,
    bloom: o.blooms ? { pal: o.blooms, amount: o.bloom ?? 0.9, size: 0.075, drifts: Math.max(2, Math.round(n / 3)) } : undefined });
  if (o.spikes) for (let i = 0; i < Math.round(n * 1.7); i++) {
    const a = r() * 6.283, d = Math.sqrt(r()) * R * 0.85, hs = 0.2 + r() * 0.09, kind = r() < 0.5 ? SPIKE_SLIM : SPIKE_FULL;
    F.card([Math.cos(a) * d, H * 0.7 + hs * (0.8 + r() * 0.5), Math.sin(a) * d * 0.8], [(r() - 0.5) * 0.8, 0.7, 0.6], hs, pick(r, kind), pick(r, o.spikes), 0.8,
      { roll: (r() - 0.5) * 0.4, sway: 1.8, glow: 0.85, lift: 0.7, flip: r() < 0.5 });
  }
  F.contact(0, 0, R * 0.9, R * 0.75, 0.012);
}

export type FieldOpt = { w: number; d: number; crop?: 'wheat' | 'greens' | 'beans'; row?: number };
/**
 * A worked field (the infirmary's farmland, 2026-11-27), w along x and d along z (m): straight rows of one crop with
 * bare earth between. Wheat stands knee high in gold; greens are low round heads; beans a taller leafy row with white
 * flowers. Each row is a chain of overlapping masses, so it reads as a row, not a hedge.
 */
export function field(F: Foliage, o: FieldOpt) {
  const r = F.r, crop = o.crop ?? 'wheat', gap = o.row ?? (crop === 'greens' ? 0.8 : 1.0), greens = crop === 'greens';
  // (t-fields 2026-11-27, "bright with hard edges") the wheat ripening unevenly into the lawn's olive, the rows'
  // ends ragged so a field frays at its edges instead of stopping on a line
  const H = crop === 'wheat' ? 0.7 : crop === 'beans' ? 0.85 : 0.3, pal: Pal[] = crop === 'wheat' ? ['straw', 'lawn', 'straw', 'gold'] : crop === 'beans' ? ['green', 'deep', 'sage'] : ['green', 'sage', 'sage'];
  for (let z = -o.d / 2 + gap / 2; z <= o.d / 2 - gap / 3; z += gap) {
    const lobes: Lobe[] = [], step = greens ? 0.5 : 1.1, x0 = -o.w / 2 + step / 2 + r() * 0.9, x1 = o.w / 2 - r() * 0.9;
    for (let x = x0; x < x1; x += step * (0.85 + r() * 0.3)) {
      const rr = greens ? 0.17 + r() * 0.05 : 0.2 + r() * 0.05, hh = H * (0.85 + r() * 0.3);
      lobes.push({ c: [x, hh * (greens ? 0.45 : 0.5), z + (r() - 0.5) * 0.05], r: [greens ? rr : step * 0.7, hh * 0.55, rr] });
    }
    fill(F, lobes, { pal, sprites: crop === 'greens' ? [...LEAF_BROAD, ...LEAF_ROUND] : [...LEAF_TUFT, ...LEAF_TUFT], size: crop === 'greens' ? 0.11 : 0.13,
      floor: 0.0, aoLo: 0.1, upright: crop !== 'greens', sway: crop === 'wheat' ? 1.6 : 0.8, density: crop === 'wheat' ? 0.8 : 1,
      bloom: crop === 'beans' ? { pal: 'white', amount: 0.3, size: 0.07 } : undefined });
    F.contact(0, z, o.w * 0.52, gap * 0.4, 0.012);
  }
}

/** A plant as data (kit.json's "grow"): which recipe, and its options. */
export type Recipe = ({ kind: 'bush' } & BushOpt) | ({ kind: 'bed' } & BedOpt) | ({ kind: 'cone' } & ConeOpt) | ({ kind: 'cascade' } & CascadeOpt) | ({ kind: 'tree' } & TreeOpt)
  | ({ kind: 'patch' } & PatchOpt) | ({ kind: 'field' } & FieldOpt);
/** Grow a recipe with a seed: a group in metres, its foot at the origin (a cascade: the wall's top, +z out of its face). */
export function grow(recipe: Recipe, seed: number): THREE.Group {
  const F = new Foliage(rng(seed));
  if (recipe.kind === 'bush') bush(F, recipe); else if (recipe.kind === 'bed') bed(F, recipe); else if (recipe.kind === 'cone') cone(F, recipe);
  else if (recipe.kind === 'cascade') cascade(F, recipe); else if (recipe.kind === 'tree') tree(F, recipe);
  else if (recipe.kind === 'patch') patch(F, recipe); else if (recipe.kind === 'field') field(F, recipe);
  return F.build();
}

/** A soft dark patch on the ground, rx by rz (m), centred on the origin: the shade under a made (modelled) tree. */
export function groundShade(rx: number, rz = rx): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(rx * 2, rz * 2), (contactMat ??= contactMaterial()));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.012; m.renderOrder = 2;
  return m;
}
