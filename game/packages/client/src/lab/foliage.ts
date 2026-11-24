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
export type Sprite = keyof typeof SPRITES;
const ATLAS_N = 4, CELL = 128;

let atlasTex: THREE.CanvasTexture | null = null;
/** The sprite sheet's canvas (also shown by the lab page). */
export function spriteCanvas(): HTMLCanvasElement {
  const cv = document.createElement('canvas'); cv.width = cv.height = ATLAS_N * CELL;
  const ctx = cv.getContext('2d')!, r = rng(11);
  const g = (v: number, a = 1) => { const c = Math.round(Math.max(0, Math.min(1, v)) * 255); return `rgba(${c},${c},${c},${a})`; };
  const EYE = 'rgb(255,190,0)';
  const cell = (i: number, draw: () => void) => {
    ctx.save(); ctx.beginPath(); ctx.rect((i % ATLAS_N) * CELL + 1, Math.floor(i / ATLAS_N) * CELL + 1, CELL - 2, CELL - 2); ctx.clip();
    ctx.translate((i % ATLAS_N) * CELL + CELL / 2, Math.floor(i / ATLAS_N) * CELL + CELL / 2); draw(); ctx.restore();
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
  atlasTex = new THREE.CanvasTexture(spriteCanvas());
  atlasTex.colorSpace = THREE.NoColorSpace; atlasTex.anisotropy = 4; atlasTex.generateMipmaps = true;
  atlasTex.minFilter = THREE.LinearMipmapLinearFilter;
  return atlasTex;
}

// ---------------------------------------------------------------------------------------------------------------
// the material: cards turned to the camera in the vertex stage; colour from the palette ramp in the fragment stage
// ---------------------------------------------------------------------------------------------------------------
let cardMat: THREE.MeshLambertMaterial | null = null;
function cardMaterial(): THREE.MeshLambertMaterial {
  if (cardMat) return cardMat;
  const m = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.fTime = FOLIAGE_TIME; sh.uniforms.fDebug = FOLIAGE_DEBUG; sh.uniforms.fMap = { value: atlasTexture() }; sh.uniforms.fPal = { value: paletteTexture() };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec2 aCorner; attribute vec2 aUv; attribute vec4 aA; attribute vec4 aB;
        uniform float fTime; varying vec2 vFuv; varying vec3 vFa;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        // wind: the card's centre leans with slow gusts, more the further out on the plant it sits (aB.x), each on its own beat (aB.y)
        float fGust = sin(fTime * 1.3 + position.x * 0.9 + position.z * 0.7) * 0.6 + sin(fTime * 2.7 + aB.y) * 0.4;
        transformed.x += fGust * aB.x * 0.035; transformed.z += fGust * aB.x * 0.02;
        vFuv = aUv; vFa = vec3(aA.z, aA.w, aB.z);`)
      .replace('#include <project_vertex>', `
        vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
        float fSc = length(modelMatrix[0].xyz) * aA.x;
        float fRoll = aA.y + fGust * aB.x * 0.12;
        vec2 fC = vec2(aCorner.x * cos(fRoll) - aCorner.y * sin(fRoll), aCorner.x * sin(fRoll) + aCorner.y * cos(fRoll));
        mvPosition.xy += fC * fSc;
        mvPosition.z += fSc * aB.w;          // toward the eye, so a card stands clear of what it grows on
        gl_Position = projectionMatrix * mvPosition;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D fMap; uniform sampler2D fPal; uniform float fDebug; varying vec2 vFuv; varying vec3 vFa;`)
      .replace('#include <map_fragment>', `vec4 fTex = texture2D(fMap, vFuv); if (fTex.a < 0.42) discard;`)
      .replace('#include <opaque_fragment>', `{
        // how much light reaches this card (the material is white, so the lit colour is the light itself)
        float fLit = smoothstep(0.04, 0.62, dot(reflectedLight.directDiffuse, vec3(0.3, 0.6, 0.1)));
        float fEye = clamp((fTex.r - fTex.b) * 1.6, 0.0, 1.0);
        // the ramp: light, the sprite's own value, and how deep in the plant the card sits (vFa.y: 0 buried, 1 crown)
        float fV = 0.44 + (fLit - 0.6) * 0.4 + (fTex.r - 0.55) * 0.75 + (vFa.y - 0.6) * 0.5;
        fV = mix(fV, fTex.r * 0.46 + fLit * 0.16 + 0.02, vFa.z);            // blossoms hold their colour in shade
        vec3 fCol = texture2D(fPal, vec2(clamp(fV, 0.0, 1.0) * 0.875 + 0.0625, vFa.x)).rgb;
        fCol *= mix(vec3(0.86, 0.93, 1.1), vec3(1.1, 1.02, 0.88), fLit);   // cool shade, warm sun
        fCol = mix(fCol, vec3(1.0, 0.72, 0.12) * (0.55 + 0.6 * fLit), fEye);
        outgoingLight = fCol;
        if (fDebug > 0.5) outgoingLight = vec3(fDebug > 1.5 ? vFa.y : fLit);
      }
      #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'foliage-cards-1';
  return (cardMat = m);
}
const barkMat = new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 1 });
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
export type CardOpt = { roll?: number; sway?: number; glow?: number; lift?: number; flip?: boolean };
export class Foliage {
  private pos: number[] = []; private nrm: number[] = []; private corner: number[] = []; private uv: number[] = [];
  private a: number[] = []; private b: number[] = []; private idx: number[] = [];
  private stems: { x: number; y: number; z: number; h: number; r: number }[] = [];
  private lobes: { c: V3; r: V3 }[] = []; private contacts: { x: number; z: number; y: number; rx: number; rz: number }[] = [];
  cards = 0;
  constructor(readonly r: Rnd) {}

  /** One card: centre p (m), the normal it lights by, half-size s (m), its sprite and palette, ao 0 (buried) to 1 (crown). */
  card(p: V3, n: V3, s: number, sprite: Sprite, pal: Pal, ao: number, o: CardOpt = {}) {
    const base = this.pos.length / 3, i = SPRITES[sprite], u0 = (i % ATLAS_N) / ATLAS_N, v0 = 1 - (Math.floor(i / ATLAS_N) + 1) / ATLAS_N, d = 1 / ATLAS_N;
    const nl = Math.hypot(n[0], n[1], n[2]) || 1, [ua, ub] = o.flip ? [u0 + d, u0] : [u0, u0 + d];
    const cs = [[-1, -1, ua, v0], [1, -1, ub, v0], [1, 1, ub, v0 + d], [-1, 1, ua, v0 + d]];
    const phase = this.r() * 6.283;
    for (const [cx, cy, u, v] of cs) {
      this.pos.push(p[0], p[1], p[2]); this.nrm.push(n[0] / nl, n[1] / nl, n[2] / nl); this.corner.push(cx, cy); this.uv.push(u, v);
      this.a.push(s, o.roll ?? 0, palRow(pal), Math.max(0, Math.min(1, ao))); this.b.push(o.sway ?? 1, phase, o.glow ?? 0, o.lift ?? 0.35);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3); this.cards++;
  }
  /** A lobe that casts the plant's shadow (and shades the cards on its far side). */
  lobe(c: V3, r: V3) { this.lobes.push({ c, r }); }
  /** A bare woody stem (a tree's trunk), r at the foot. */
  stem(x: number, y: number, z: number, h: number, r: number) { this.stems.push({ x, y, z, h, r }); }
  /** A soft dark patch on the ground under the plant. */
  contact(x: number, z: number, rx: number, rz = rx, y = 0.012) { this.contacts.push({ x, z, y, rx, rz }); }

  build(): THREE.Group {
    const g = new THREE.Group();
    if (this.cards) {
      const geo = new THREE.BufferGeometry(), f = (xs: number[], n: number) => new THREE.Float32BufferAttribute(xs, n);
      geo.setAttribute('position', f(this.pos, 3)); geo.setAttribute('normal', f(this.nrm, 3)); geo.setAttribute('aCorner', f(this.corner, 2));
      geo.setAttribute('aUv', f(this.uv, 2)); geo.setAttribute('aA', f(this.a, 4)); geo.setAttribute('aB', f(this.b, 4)); geo.setIndex(this.idx);
      geo.computeBoundingSphere(); geo.boundingSphere!.radius += 0.8;
      const m = new THREE.Mesh(geo, cardMaterial()); m.receiveShadow = true; m.userData.foliage = true; g.add(m);
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
      const c = new THREE.Mesh(new THREE.CylinderGeometry(t.r * 0.6, t.r, t.h, 7), barkMat); c.position.set(t.x, t.y + t.h / 2, t.z); c.castShadow = c.receiveShadow = true; g.add(c);
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
  hide?: Lobe[] };

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
    for (let i = 0; i < n / 3; i++) { const a = r() * 6.283, e = (r() - 0.25) * 1.6, k = 0.62; const p: V3 = [l.c[0] + Math.cos(a) * Math.cos(e) * l.r[0] * k, l.c[1] + Math.sin(e) * l.r[1] * k, l.c[2] + Math.sin(a) * Math.cos(e) * l.r[2] * k]; if (p[1] > floor) F.card(p, [0, 1, 0], o.size * 1.5, 'roundA', pal, 0.12, { roll: r() * 6.283, sway: 0.2, lift: 0 }); }
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
      F.card(p, nrm, s, pick(r, o.sprites), r() < 0.25 ? pick(r, pals) : pal, ao, { roll: o.upright ? (r() - 0.5) * 0.7 : r() * 6.283, sway: (o.sway ?? 1) * (0.3 + t), flip: r() < 0.5, lift: o.lift });
      if (bl && d[1] > -0.2) {
        let near = Infinity, np: Pal = bpals[0];
        for (const dr of drifts) { const dd = Math.hypot(p[0] - dr.p[0], p[1] - dr.p[1], p[2] - dr.p[2]); if (dd < near) { near = dd; np = dr.pal; } }
        const reach = Math.max(0.25, Math.max(...l.r) * 0.9);
        if (r() < (bl.amount ?? 0.5) * Math.exp(-(near * near) / (reach * reach)) * 1.6) {
          const bs = (bl.size ?? o.size * 0.6) * (0.8 + r() * 0.4), nn = Math.hypot(nrm[0], nrm[1], nrm[2]), out = bs * 0.5;
          F.card([p[0] + (nrm[0] / nn) * out + (r() - 0.5) * o.size, p[1] + (nrm[1] / nn) * out + (r() - 0.5) * o.size * 0.6, p[2] + (nrm[2] / nn) * out + (r() - 0.5) * o.size],
            nrm, bs, pick(r, bl.sprites ?? ['blossom', 'trio', 'dab']), np, ao + 0.2, { roll: r() * 6.283, sway: (o.sway ?? 1) * (0.4 + t), glow: 0.75, flip: r() < 0.5, lift: (o.lift ?? 0.35) + 0.5 });
        }
      }
    }
    F.lobe(l.c, [l.r[0] * 0.8, l.r[1] * 0.8, l.r[2] * 0.8]);
  });
}

// ---------------------------------------------------------------------------------------------------------------
// recipes
// ---------------------------------------------------------------------------------------------------------------
export type BushOpt = { r?: number; h?: number; pal?: Pal | Pal[]; sprites?: Sprite[]; leaf?: number; bloom?: Bloom; lobes?: number; at?: [number, number]; y?: number; density?: number };
/** A shrub: a main mass with smaller ones crowding its foot. r: half its width, h: its height (m). */
export function bush(F: Foliage, o: BushOpt = {}) {
  const r = F.r, R = o.r ?? 0.6, H = o.h ?? R * 1.5, [x, z] = o.at ?? [0, 0], y = o.y ?? 0, leafS = o.leaf ?? 0.17;
  const lobes: Lobe[] = [{ c: [x, y + H * 0.52, z], r: [R * 0.78, H * 0.5, R * 0.78] }], n = o.lobes ?? 4 + Math.floor(r() * 3), a0 = r() * 6.283;
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * 6.283 + (r() - 0.5) * 0.7, d = R * (0.42 + r() * 0.3), rr = R * (0.36 + r() * 0.26), hh = H * (0.22 + r() * 0.26);
    lobes.push({ c: [x + Math.cos(a) * d, y + hh * (0.75 + r() * 0.5), z + Math.sin(a) * d], r: [rr, hh, rr] });
  }
  fill(F, lobes, { pal: o.pal ?? 'gold', sprites: o.sprites ?? ['broadA', 'broadB', 'roundA'], size: leafS, bloom: o.bloom, floor: y + 0.03, density: o.density });
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
    fill(F, ls, { hide: lobes.filter((l) => !ls.includes(l)), pal: pals, sprites: ['broadA', 'broadB', 'roundA', 'roundB'], size: 0.11, floor: y + 0.01, aoLo: 0.0,
      bloom: k < 0 ? undefined : { pal: blooms[k], sprites: ['blossom', 'trio', 'dab', 'daisy', 'trio'], amount: 1.5, size: 0.1, drifts: Math.max(2, Math.round(ls.length / 2.5)) } });
  }
  // spikes: groups of three to six, each leaning a little, standing 0.25 to 0.5 m above the leaf
  const sp = o.spikes ?? ['blue', 'lilac'];
  if (sp.length) for (let x = -w / 2 + 0.3; x < w / 2 - 0.2; x += 0.7 + r() * 0.9) {
    const pal = pick(r, sp), z0 = -d / 2 + d * (0.15 + r() * 0.4), n = 3 + Math.floor(r() * 4);
    for (let i = 0; i < n; i++) {
      const px = x + (r() - 0.5) * 0.4, pz = z0 + (r() - 0.5) * 0.25, hs = 0.15 + r() * 0.07;
      F.card([px, y + H * 0.75 + hs * (0.7 + r() * 0.5), pz], [0, 1, 0.4], hs, 'spike', pal, 0.9, { roll: (r() - 0.5) * 0.45, sway: 1.6, glow: 0.7, lift: 0.6 });
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
      F.card([x + Math.cos(a) * rad * k, y + h + (r() - 0.5) * s, z + Math.sin(a) * rad * k], [Math.cos(a), 0.45, Math.sin(a)], s * (0.85 + r() * 0.4), r() < 0.5 ? 'tuftA' : 'tuftB',
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
  fill(F, lobes, { pal: pals, sprites: ['broadA', 'broadB', 'droopA'], size: leafS, floor: -0.12, bloom: o.bloom ? { ...o.bloom, amount: (o.bloom.amount ?? 0.5) * 0.7 } : undefined, aoLo: 0.45 });
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
      F.card([px, -t, z0 * (1 - k * 0.5)], [(r() - 0.5) * 0.6, 0.55, 1], s, r() < 0.7 ? (r() < 0.5 ? 'droopA' : 'droopB') : 'broadA', pal, lerp(0.85, 0.4, k) + (r() - 0.5) * 0.2,
        { roll: (r() - 0.5) * 0.9, sway: 0.4 + k * 2.2, flip: r() < 0.5, lift: 0.5 });
      for (const d of drifts) if (r() < (o.bloom!.amount ?? 0.5) * Math.exp(-(Math.pow(px - d.x, 2) + Math.pow(-t - d.y, 2)) / (d.rad * d.rad))) {
        const bs = (o.bloom!.size ?? 0.09) * (0.8 + r() * 0.45);
        F.card([px + (r() - 0.5) * 0.12, -t + (r() - 0.5) * 0.1, z0 + 0.06], [0, 0.6, 1], bs, pick(r, o.bloom!.sprites ?? ['trio', 'dab', 'blossom']), d.pal, 0.95, { roll: (r() - 0.5) * 0.8, sway: 0.4 + k * 2.2, glow: 0.75, lift: 1.1 });
      }
    }
    if (L > 0.3) F.lobe([x, -L * 0.45, z0 * 0.6], [0.06, L * 0.5, 0.05]);
  }
}

export type TreeOpt = { h?: number; r?: number; pal?: Pal | Pal[]; bloom?: Bloom; at?: [number, number]; y?: number };
/** A small round-headed tree (a flowering cherry, a clipped standard): a bare stem and a crown of several masses. */
export function tree(F: Foliage, o: TreeOpt = {}) {
  const r = F.r, H = o.h ?? 3.2, R = o.r ?? 1.2, [x, z] = o.at ?? [0, 0], y = o.y ?? 0, cy = y + H - R * 0.85;
  const lobes: Lobe[] = [{ c: [x, cy, z], r: [R * 0.8, R * 0.72, R * 0.8] }];
  for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.283 + r(), d = R * (0.5 + r() * 0.25), rr = R * (0.42 + r() * 0.2); lobes.push({ c: [x + Math.cos(a) * d, cy + (r() - 0.45) * R * 0.6, z + Math.sin(a) * d], r: [rr, rr * 0.85, rr] }); }
  fill(F, lobes, { pal: o.pal ?? 'green', sprites: ['broadA', 'broadB', 'roundA', 'roundB'], size: 0.2, bloom: o.bloom, floor: y + 0.4, aoLo: 0.2 });
  F.contact(x, z, R * 1.1, R * 1.1, y + 0.012);
  F.stem(x, y, z, cy - y, 0.09 + R * 0.05);
}

/** A plant as data (kit.json's "grow"): which recipe, and its options. */
export type Recipe = ({ kind: 'bush' } & BushOpt) | ({ kind: 'bed' } & BedOpt) | ({ kind: 'cone' } & ConeOpt) | ({ kind: 'cascade' } & CascadeOpt) | ({ kind: 'tree' } & TreeOpt);
/** Grow a recipe with a seed: a group in metres, its foot at the origin (a cascade: the wall's top, +z out of its face). */
export function grow(recipe: Recipe, seed: number): THREE.Group {
  const F = new Foliage(rng(seed));
  if (recipe.kind === 'bush') bush(F, recipe); else if (recipe.kind === 'bed') bed(F, recipe); else if (recipe.kind === 'cone') cone(F, recipe);
  else if (recipe.kind === 'cascade') cascade(F, recipe); else if (recipe.kind === 'tree') tree(F, recipe);
  return F.build();
}
