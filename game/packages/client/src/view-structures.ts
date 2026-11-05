/**
 * Shield and Sigil structures in the Pixel Battlefield / Spell VFX gallery look, plus the things
 * those spells put on wizards, the placement preview, scorched ground, enemy telegraphs and portals.
 *
 * - Rock walls: rows of slabs painted by a raycaster (art/walls.ts), cached per damage state
 *   (whole, cracked, a chunk out of the top, half height, rubble) and depth-sorted with the actors.
 * - Barriers: shimmering energy sheets that thin as the owner's Shield pool runs down; curtains in
 *   their element (a Life curtain is a healing zone). Both are per-frame pieces, depth-sorted.
 * - Waves: Shove, Tidal, Fault line and elemental fronts, with what they leave on the floor.
 * - Sigil: the turret (sigilDevice on a rune ring), glyphs and line glyphs that visibly arm,
 *   orbiting element orbs, the lens, rune motes, the wand, conjured weapons and shields.
 * - On wizards: the ward as a shimmering skin round the silhouette, the mirror ward's sheen,
 *   stone armour as four flush plates, the Mending ward, auras for every element, the Double.
 * - Placement feedback for seat 0 while the Area button is held with a queue that will Place.
 * - Scorch marks where fire burnt out, damp patches where water dried, melt where ice went.
 *
 * Everything here is cosmetic and reads the sim without writing it. Randomness is hashed from
 * integers (art/util rand), so frames are reproducible.
 */
import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import {
  AI, ARCHETYPES, ARMS, ATTACK, BTN, CELL, DEVICE, EL as ELID, GUARD, GUARD_NAME, KIND, MAX_BODIES, MAX_DEVICES, MAX_PORTALS, MAX_SEATS, MAX_WALLS, MAX_WAVES, MAX_ZONES, ZONE,
  N_ALTARS, N_EL, PHASE, PHASE_ENC, RHYTHM, RUNES, SHAPES, STRUCT, SURF, SURVIVE_TIMES, T, TERRAIN, WALL, WARD, WAVE_TIMES, compile, elementName, guardCoatLook, guardSize, queueOf, selfTarget,
  type SimEvent, type World,
} from '@wizard-sim/sim';
import { FY as CFY, PPU } from './camera';
import { FIELD, gx, gy } from './art/field';
import * as K from './art/kit';
import * as X from './art/px';
import type { Ctx, Pt, Ramp } from './art/px';
import { CELL_H, CELL_W, FEET_X, FEET_Y } from './art/rigs';
import * as S from './art/sigil';
import { CU, FY, TAU, clamp, easeOut, emit, lerp, mod, rand, seg, smooth } from './art/util';
import type { BodyView, LightFn } from './art/vfx';
import { glyph, perkOf } from './art/perks';
import { RISE_STEPS, SLAB_OX, SLAB_OY, SlabCache, facePoint, paintSlab, wallGeom, type WallGeom, type WallSpec } from './art/walls';

const EL = X.EL, SV = EL.sigil;
const AMBIENT = 0xe4e8ff;
/** ?structoff=walls,waves,... hides parts of this view (for isolating a slow or broken part). */
const OFF = (typeof location !== 'undefined' ? new URLSearchParams(location.search).get('structoff') ?? '' : '').split(',');
const elName = (id: number): string => (id >= 1 && id <= N_EL ? elementName(id) : 'arcane');
const ramp = (id: number): Ramp => EL[elName(id)] ?? EL.arcane;
const LIFE = X.LIFE;
/** Sheet colours (rgb for the translucent fill) per element. */
const RGB: Record<string, string> = {
  shield: '255,214,110', fire: '255,140,60', cold: '170,236,255', water: '90,160,255', lightning: '196,164,255', arcane: '255,106,176', life: '142,240,126', earth: '184,148,106', sigil: '236,140,255',
};

/** The strongest element in a 9-count block, skipping `skip` ids. */
function lead(els: Uint8Array, at: number, ...skip: number[]): number {
  let best = 0, n = 0;
  for (let id = 1; id <= N_EL; id++) if (!skip.includes(id) && els[at * N_EL + id - 1] > n) { n = els[at * N_EL + id - 1]; best = id; }
  return best;
}
const has = (els: Uint8Array, at: number, id: number) => els[at * N_EL + id - 1] > 0;

// =====================================================================================================
// Depth-sorted pieces: sprites in the actors container, either cached textures or per-frame canvases.
interface Dyn { c: HTMLCanvasElement; x: Ctx; tex: Texture; spr: Sprite; w: number; h: number; used: boolean }
class Pieces {
  private stat: Sprite[] = [];
  private nS = 0;
  private dyn: Dyn[] = [];
  private fx0 = 0; private fy0 = 0;
  constructor(private parent: Container) {}
  begin(fx0: number, fy0: number): void { this.fx0 = fx0; this.fy0 = fy0; this.nS = 0; for (const d of this.dyn) d.used = false; }
  /** A cached texture at field (rx, ry), sorted at ground y z. */
  tex(tex: Texture, rx: number, ry: number, z: number, tint = AMBIENT): void {
    let s = this.stat[this.nS];
    if (!s) { s = new Sprite(); this.parent.addChild(s); this.stat.push(s); }
    this.nS++;
    s.texture = tex; s.position.set(this.fx0 + rx, this.fy0 + ry); s.zIndex = Math.round(z) * 128 + 100; s.tint = tint; s.visible = true;
  }
  /** A fresh canvas covering field rect (rx, ry, w, h), translated so the caller draws in field px. */
  canvas(rx: number, ry: number, w: number, h: number, z: number, tint = 0xffffff): Ctx {
    rx = Math.floor(rx); ry = Math.floor(ry);
    const W = Math.ceil(w / 16) * 16, H = Math.ceil(h / 16) * 16;
    let d = this.dyn.find((q) => !q.used && q.w === W && q.h === H);
    if (!d) {
      const { c, x } = X.canvas(W, H);
      const tex = Texture.from(c); tex.source.scaleMode = 'nearest';
      const spr = new Sprite(tex); this.parent.addChild(spr);
      d = { c, x, tex, spr, w: W, h: H, used: false };
      this.dyn.push(d);
    }
    d.used = true;
    const x = d.x;
    x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, W, H); x.setTransform(1, 0, 0, 1, -rx, -ry); x._fs = null;
    d.spr.position.set(this.fx0 + rx, this.fy0 + ry); d.spr.zIndex = Math.round(z) * 128 + 100; d.spr.tint = tint; d.spr.visible = true;
    return x;
  }
  end(): void {
    for (let i = this.nS; i < this.stat.length; i++) this.stat[i].visible = false;
    for (const d of this.dyn) { if (d.used) d.tex.source.update(); else d.spr.visible = false; }
  }
}

// =====================================================================================================
// Silhouette effects: a halo or sheen built from a body's cached frame (the ward skin, the Double).
class Sil {
  private A = X.canvas(CELL_W + 8, CELL_H + 8);
  private B = X.canvas(CELL_W + 8, CELL_H + 8);
  private cell(v: BodyView, c: Ctx, dx = 4, dy = 4): boolean {
    const f = v.f; if (!f) return false;
    c.drawImage(f.c, f.sx, f.sy, CELL_W, CELL_H, dx, dy, CELL_W, CELL_H);
    return true;
  }
  /** A skin round the silhouette: `ring` px wide, in col, with a bright band climbing it, dithered to level (0..16). */
  halo(o: Ctx, v: BodyView, t: number, col: string, opt: { hi?: string; col2?: string; level?: number; ring?: number; band?: boolean; lag?: [number, number] } = {}): void {
    const A = this.A.x, B = this.B.x, W = CELL_W + 8, H = CELL_H + 8;
    A.globalCompositeOperation = 'source-over'; A.clearRect(0, 0, W, H);
    if (!this.cell(v, A)) return;
    A.globalCompositeOperation = 'source-in'; A.fillStyle = col; A.fillRect(0, 0, W, H);
    if (opt.band !== false && opt.hi) {
      A.globalCompositeOperation = 'source-atop';
      const band = H - ((t * 46) % (H + 12));
      A.fillStyle = opt.hi; A.fillRect(0, Math.round(band), W, 3);
      A.fillStyle = opt.col2 ?? col; A.fillRect(0, Math.round(band) + 3, W, 2);
    }
    const lvl = Math.round(opt.level ?? 16);
    if (lvl < 16) {
      A.globalCompositeOperation = 'destination-in';
      const ox = Math.floor(t * 9) % 4, oy = Math.floor(t * 7) % 4;
      A.drawImage(X.mask(lvl), ox, oy, W, H, 0, 0, W, H);
    }
    A.globalCompositeOperation = 'source-over'; A._fs = null;
    B.globalCompositeOperation = 'source-over'; B.clearRect(0, 0, W, H);
    const r = opt.ring ?? 2, lag = opt.lag;
    if (lag) B.drawImage(this.A.c, lag[0], lag[1]);
    else {
      const offs = r >= 2 ? [[-2, 0], [2, 0], [0, -2], [0, 2], [-1, -1], [1, -1], [-1, 1], [1, 1], [-2, -1], [2, -1]] : [[-1, 0], [1, 0], [0, -1], [0, 1]];
      for (const [dx, dy] of offs) B.drawImage(this.A.c, dx, dy);
    }
    B.globalCompositeOperation = 'destination-out'; this.cell(v, B); B.globalCompositeOperation = 'source-over';
    o.drawImage(this.B.c, Math.round(v.x - FEET_X - 4), Math.round(v.y - FEET_Y - 4));
  }
  /** A sheen over the body itself: diagonal bands sweeping across it, dithered. */
  sheen(o: Ctx, v: BodyView, t: number, cols: [string, string], level = 9): void {
    const A = this.A.x, W = CELL_W + 8, H = CELL_H + 8;
    A.globalCompositeOperation = 'source-over'; A.clearRect(0, 0, W, H); A._fs = null;
    const sweep = mod(t * 40, W + 40) - 20;
    for (let y = 0; y < H; y++) { const x0 = Math.round(sweep - y * 0.6); X.rect(A, x0, y, 3, 1, cols[0]); X.rect(A, x0 + 3, y, 2, 1, cols[1]); X.rect(A, x0 - 14, y, 1, 1, cols[1]); }
    A.globalCompositeOperation = 'destination-in'; A.drawImage(X.mask(level), 0, 0, W, H, 0, 0, W, H);
    this.cell(v, A); // destination-in with the body: only on the body
    A.globalCompositeOperation = 'source-over';
    o.drawImage(this.A.c, Math.round(v.x - FEET_X - 4), Math.round(v.y - FEET_Y - 4));
  }
}

// =====================================================================================================
// Scorch marks, damp patches and melt, painted into their own floor-level canvas.
interface Mark { x: number; y: number; t0: number; life: number; kind: number; seed: number }
class Scorch {
  readonly sprite: Sprite;
  private cv = X.canvas(FIELD.W, FIELD.H);
  private tex: Texture;
  private prev = new Uint8Array(0);
  private marks: Mark[] = [];
  private key = '';
  constructor() {
    this.tex = Texture.from(this.cv.c); this.tex.source.scaleMode = 'nearest';
    this.sprite = new Sprite(this.tex);
  }
  /** FIELD changed size: a new canvas to match (the marks belong to the old floor). */
  resize(): void {
    const old = this.tex;
    this.cv = X.canvas(FIELD.W, FIELD.H);
    this.tex = Texture.from(this.cv.c); this.tex.source.scaleMode = 'nearest';
    this.sprite.texture = this.tex; old.destroy(true);
    this.marks = []; this.key = ''; this.prev = new Uint8Array(0);
  }
  afterStep(w: World, t: number): void {
    const s = w.surf.kind;
    if (this.prev.length !== s.length) this.prev = new Uint8Array(s.length);
    for (let c = 0; c < s.length; c++) {
      const was = this.prev[c], now = s[c];
      if (was && was !== now) {
        const x = gx(-w.dims.w / 2 + ((c % w.dims.gw) + 0.5) * CELL), y = gy(-w.dims.h / 2 + (Math.floor(c / w.dims.gw) + 0.5) * CELL);
        // fire leaves a scorch that fades slowly; dried water a damp patch; melted ice a wet sheen
        if (was === SURF.fire) this.marks.push({ x, y, t0: t, life: 40 + rand(c, 3) * 15, kind: 0, seed: c });
        else if (was === SURF.water && !now) this.marks.push({ x, y, t0: t, life: 6, kind: 1, seed: c });
        else if (was === SURF.ice && !now) this.marks.push({ x, y, t0: t, life: 5, kind: 2, seed: c });
      }
    }
    this.prev.set(s);
    if (this.marks.length > 1500) this.marks.splice(0, this.marks.length - 1500);
  }
  draw(w: World, t: number): void {
    this.marks = this.marks.filter((m) => t - m.t0 < m.life);
    // repaint only when a mark's dither level changed (or marks came or went)
    let key = '';
    const lv = (m: Mark) => Math.ceil(16 * (1 - (t - m.t0) / m.life) * (m.kind ? 0.7 : 0.85));
    for (const m of this.marks) key += lv(m).toString(36);
    key += this.marks.length;
    if (key === this.key) return;
    this.key = key;
    const c = this.cv.x;
    c.clearRect(0, 0, FIELD.W, FIELD.H); c._fs = null;
    for (const m of this.marks) {
      const a = lv(m) / 16, j = (rand(m.seed, 1) - 0.5) * 1.5;
      if (m.kind === 0) {
        // one soft dark blot per cell (overlapping cells merge), darker at the heart
        X.ellipse(c, m.x + j, m.y + 0.5, 6.6, 3.8, `rgba(20,14,14,${(0.42 * a).toFixed(2)})`);
        X.ellipse(c, m.x + j * 0.5, m.y, 4.0, 2.2, `rgba(10,8,8,${(0.35 * a).toFixed(2)})`);
        if (rand(m.seed, 2) < 0.35) X.px(c, m.x + (rand(m.seed, 3) - 0.5) * 8, m.y + (rand(m.seed, 4) - 0.5) * 4, a > 0.5 ? '#4a4040' : '#2a2424');
        // a few embers still glowing for the first seconds
        if (a > 0.8 && rand(m.seed, 5) < 0.25) X.px(c, m.x + (rand(m.seed, 6) - 0.5) * 6, m.y + (rand(m.seed, 7) - 0.5) * 3, '#c8502a');
      } else if (m.kind === 1) X.ellipse(c, m.x + j, m.y, 6, 3.4, `rgba(16,24,34,${(0.4 * a).toFixed(2)})`);
      else { X.ellipse(c, m.x + j, m.y, 6, 3.4, `rgba(60,110,150,${(0.35 * a).toFixed(2)})`); if (rand(m.seed, 2) < 0.2) X.px(c, m.x, m.y - 1, '#8ad0ff'); }
    }
    this.tex.source.update();
  }
}

/** How long each weapon or guard move's effect plays (s). */
const MOVE_LIFE: Record<string, number> = {
  dash: 0.45, flamestep: 0.5, iceslide: 0.7, backstep: 0.5, phase: 0.6, seedstep: 0.8, shovestep: 0.7, surge: 0.6, tidewave: 0.6,
  parry: 0.4, block: 0.25, glance: 0.3, chill: 0.5, coat: 0.45, guardbreak: 0.8, flameburst: 0.45, chargedbolt: 0.4, lance: 0.4, javelin: 0.45, siphon: 0.5, mend: 0.6, link: 0.5, linkbreak: 0.5,
};
/** Each guard's colour. */
const GUARD_RAMP: Record<string, Ramp> = {
  mirror: EL.shield, bulwark: X.EARTH, ember: EL.fire, rime: EL.cold, spark: EL.lightning, tide: EL.water, prism: EL.arcane, leaf: X.LIFE,
};

/** One of the guards (not the Bulwark, drawn with its facing) centred at (x, y), after the round-2 review page's drawings. */
function guardShape(c: Ctx, id: string, x: number, y: number, sz: number, t: number, sn: number, hpk: number): void {
  const fl = Math.floor(t * 14), wx = 0.55 + 0.45 * sn; // seen edge-on the guard is narrower
  const ell = (rx: number, ry: number, col: string, a = 1) => X.ellipse(c, x, y, rx * sz * wx, ry * sz, col, a);
  const P = (a: number, b: number): Pt => [x + a * sz * wx, y + b * sz];
  switch (id) {
    case 'ember': {
      ell(4.6, 4.8, '#3a1a14'); ell(3.6, 3.8, '#6a3424'); ell(1.4, 1.5, '#c8c0d0');
      for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + 0.2; X.px(c, x + Math.cos(a) * 5.4 * sz * wx, y + Math.sin(a) * 5.6 * sz, '#c8c0d0'); }
      for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU, px2 = x + Math.cos(a) * 4.2 * sz * wx, py2 = y + Math.sin(a) * 4.4 * sz; X.px(c, px2, py2, EL.fire[((i + fl) % 3) + 1]); if (a > Math.PI * 1.1 && a < Math.PI * 1.9 && (i + fl) % 3 === 0) X.px(c, px2, py2 - 1 - (fl % 2), EL.fire[1]); }
      break;
    }
    case 'rime': {
      X.poly(c, [P(-4.5, -4), P(4.5, -4), P(3.5, 1), P(0, 7), P(-3.5, 1)], '#163e7a');
      X.poly(c, [P(-3.6, -3.2), P(3.6, -3.2), P(2.8, 0.8), P(0, 5.8), P(-2.8, 0.8)], EL.cold[3]);
      X.poly(c, [P(-3.6, -3.2), P(0, -3.2), P(0, 5.8), P(-2.8, 0.8)], EL.cold[2]);
      X.line(c, ...P(-3, -3.2), ...P(3, -3.2), '#ffffff'); X.px(c, ...P(-1, -1), '#ffffff');
      if (fl % 3 === 0) X.px(c, ...P(-5, 2 + (fl % 4)), EL.cold[1]);
      break;
    }
    case 'spark': {
      X.ring(c, x, y, 4.2 * sz * wx, 4.5 * sz, EL.lightning[3]); X.ring(c, x, y, 3.4 * sz * wx, 3.7 * sz, EL.lightning[2]);
      for (let i = 0; i < 5; i++) { const a = rand(i, fl, 3) * TAU; X.px(c, x + Math.cos(a) * 4.8 * sz * wx, y + Math.sin(a) * 5 * sz, i % 2 ? '#ffffff' : EL.lightning[1]); }
      break;
    }
    case 'tide': {
      ell(4.8, 5.2, EL.water[3], 0.9); ell(3.8, 4.2, EL.water[2], 0.9);
      const rr = 1.5 + ((t * 3) % 1) * 3; X.ring(c, x, y, rr * sz * wx, rr * 1.1 * sz, EL.water[0], 0.9);
      X.px(c, x - 2, y - 3, '#ffffff');
      break;
    }
    case 'prism': {
      const pts: Pt[] = []; for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + Math.PI / 6; pts.push([x + Math.cos(a) * 5 * sz * wx, y - 3 + Math.sin(a) * 5.6 * sz]); }
      X.poly(c, pts, EL.arcane[3], 0.55); X.lines(c, pts.concat([pts[0]]), EL.arcane[1]);
      X.line(c, pts[3][0] + 1, pts[3][1], pts[0][0] - 1, pts[0][1], '#ffffff');
      X.px(c, x + 2, y - 5, ['#ff6a6a', '#ffe070', '#6aff9a', '#6ab0ff'][fl % 4]);
      break;
    }
    case 'leaf': {
      X.glow(c, x - 1, y, 7, X.LIFE[3], 0.4);
      X.poly(c, [P(0, -7), P(4, -3), P(4.5, 2), P(0, 7.5), P(-4.5, 2), P(-4, -3)], '#0e3a1e');
      X.poly(c, [P(0, -6), P(3.2, -2.6), P(3.6, 1.8), P(0, 6.4), P(-3.6, 1.8), P(-3.2, -2.6)], X.LIFE[3]);
      X.poly(c, [P(0, -6), P(0, 6.4), P(-3.6, 1.8), P(-3.2, -2.6)], X.LIFE[4]);
      X.line(c, ...P(0, -5), ...P(0, 6), '#9af07a');
      X.px(c, ...P(-2, -2), X.LIFE[0]);
      break;
    }
    default: { // the Mirror buckler: a small polished disc with a bright glint
      ell(3.6, 4, '#6a4a10'); ell(3, 3.4, '#c8901a'); ell(2.2, 2.6, '#ffe68a');
      X.px(c, x - 1, y - 1, '#ffffff'); X.px(c, x, y - 2, '#ffffff');
      if (fl % 6 === 0) { X.px(c, x - 1, y - 3, '#ffffff'); X.px(c, x - 2, y - 1, '#ffffff'); X.px(c, x + 1, y - 1, '#fffbe0'); }
    }
  }
  if (hpk < 0.4) X.lines(c, [P(-2, -3), P(0, 0), P(-1, 3)], '#1a120c'); // cracked
}

// =====================================================================================================
interface SFx { kind: string; t0: number; life: number; seed: number; x: number; y: number; x2: number; y2: number; who: number; look: number; n: number; els?: Uint8Array }

export class StructureView {
  readonly scorch = new Scorch();
  private pieces: Pieces;
  private sil = new Sil();
  private slabs = new SlabCache();
  private geoms = new Map<string, { spec: WallSpec; g: WallGeom }>();
  private lastTex = new Map<string, Texture>();
  private fx: SFx[] = [];
  // per wall slot
  private wType = new Uint8Array(MAX_WALLS); private wHp = new Float64Array(MAX_WALLS); private wHitT = new Float64Array(MAX_WALLS).fill(-9);
  private wX1 = new Float64Array(MAX_WALLS); private wY1 = new Float64Array(MAX_WALLS); private wX2 = new Float64Array(MAX_WALLS); private wY2 = new Float64Array(MAX_WALLS);
  private wEls = new Uint8Array(MAX_WALLS * N_EL);
  // per device slot
  private dType = new Uint8Array(MAX_DEVICES); private dT0 = new Float64Array(MAX_DEVICES); private dShot = new Float64Array(MAX_DEVICES).fill(-9); private dDry = new Float64Array(MAX_DEVICES).fill(-9);
  private dX = new Float64Array(MAX_DEVICES); private dY = new Float64Array(MAX_DEVICES); private dX2 = new Float64Array(MAX_DEVICES); private dY2 = new Float64Array(MAX_DEVICES); private dLook = new Uint8Array(MAX_DEVICES); private dOwner = new Int16Array(MAX_DEVICES);
  private dCharges = new Uint8Array(MAX_DEVICES); private dPhase = new Float64Array(MAX_DEVICES);
  // per wave slot
  private vAlive = new Uint8Array(MAX_WAVES); private vSX = new Float64Array(MAX_WAVES); private vSY = new Float64Array(MAX_WAVES); private vT0 = new Float64Array(MAX_WAVES);
  private vX = new Float64Array(MAX_WAVES); private vY = new Float64Array(MAX_WAVES); private vEls = new Uint8Array(MAX_WAVES * N_EL);
  // per seat
  private sMotes = new Uint8Array(MAX_SEATS); private sWard = new Uint8Array(MAX_SEATS); private sWardT0 = new Float64Array(MAX_SEATS); private sWardEls = new Uint8Array(MAX_SEATS * N_EL);
  private sAuraT0 = new Float64Array(MAX_SEATS); private sAura = new Int32Array(MAX_SEATS); private sConjT0 = new Float64Array(MAX_SEATS); private sConj = new Uint8Array(MAX_SEATS * 3);
  private prevKind = new Uint8Array(MAX_BODIES); private bornT = new Float64Array(MAX_BODIES).fill(-9); private echoT = new Float64Array(MAX_BODIES).fill(-9);

  constructor(actors: Container) { this.pieces = new Pieces(actors); }

  private add(kind: string, t0: number, life: number, o: Partial<SFx>): void {
    if (this.fx.length > 300) this.fx.shift();
    this.fx.push({ kind, t0, life, seed: 0, x: 0, y: 0, x2: 0, y2: 0, who: -1, look: 0, n: 0, ...o });
  }

  /** After each sim step, before Vfx.afterStep: diff the slots, turn structure events into effects, and claim them. */
  afterStep(w: World, t: number, skip: Set<SimEvent>): void {
    const wl = w.walls, dv = w.devices, v = w.waves, s = w.seats, b = w.bodies, tick = w.clock[0];
    this.scorch.afterStep(w, t);
    const near = (ax: number, ay: number, bx: number, by: number, r = 0.7) => Math.abs(ax - bx) < r && Math.abs(ay - by) < r;
    const dismissed = new Set<number>();
    for (const e of w.events) if (e.kind === 'burst' && e.text === 'dismissed') { dismissed.add(e.who); skip.add(e); this.add('dismiss', t, 0.6, { who: e.who, x: e.x, y: e.y, seed: tick }); }
    // weapon and guard moves (hands.ts, guards.ts): each its own short readable effect
    for (const e of w.events) {
      if (e.kind !== 'move' || !e.text) continue;
      const life = MOVE_LIFE[e.text] ?? 0.5;
      this.add('mv-' + e.text, t, life, { who: e.who, x: e.x, y: e.y, x2: e.x2 ?? e.x, y2: e.y2 ?? e.y, look: e.look ?? 0, seed: tick * 7 + e.who, n: e.who < MAX_SEATS ? s.guard[e.who] : 0 });
    }
    // walls: hits and breaks
    for (let k = 0; k < MAX_WALLS; k++) {
      const ty = wl.type[k];
      if (ty && this.wType[k] === ty && wl.hp[k] < this.wHp[k] - 0.01) { this.wHitT[k] = t; if (ty === WALL.rock) this.add('whit', t, 0.8, { x: (wl.x1[k] + wl.x2[k]) / 2, y: (wl.y1[k] + wl.y2[k]) / 2, seed: tick + k }); }
      if (!ty && this.wType[k]) {
        const mx = (this.wX1[k] + this.wX2[k]) / 2, my = (this.wY1[k] + this.wY2[k]) / 2;
        for (const e of w.events) if (e.kind === 'burst' && near(e.x, e.y, mx, my)) skip.add(e);
        const coat = lead(this.wEls, k, ELID.shield, ELID.earth);
        this.add(this.wType[k] === WALL.rock ? 'crumble' : 'shatter', t, this.wType[k] === WALL.rock ? 3.2 : 0.7, { x: this.wX1[k], y: this.wY1[k], x2: this.wX2[k], y2: this.wY2[k], seed: tick * 3 + k, look: this.wType[k] === WALL.barrier ? ELID.shield : coat || ELID.shield });
      }
      if (ty && !this.wType[k]) this.wHitT[k] = -9;
      this.wType[k] = ty; this.wHp[k] = wl.hp[k];
      if (ty) { this.wX1[k] = wl.x1[k]; this.wY1[k] = wl.y1[k]; this.wX2[k] = wl.x2[k]; this.wY2[k] = wl.y2[k]; this.wEls.set(wl.els.subarray(k * N_EL, k * N_EL + N_EL), k * N_EL); }
    }
    // devices: appear, shots, dry, vanish (triggered, spent, dismissed, moved)
    for (const e of w.events) {
      if (e.kind !== 'zap' && e.kind !== 'dry') continue;
      for (let k = 0; k < MAX_DEVICES; k++) {
        const ty = dv.type[k] || this.dType[k];
        if (!ty || dv.owner[k] !== e.who) continue;
        if (ty === DEVICE.turret && near(e.x, e.y + (e.kind === 'zap' ? 0.5 : 0), dv.x[k], dv.y[k], 0.05)) {
          if (e.kind === 'zap') { this.dShot[k] = t; skip.add(e); this.add('feed', t, 0.3, { who: e.who, x: dv.x[k], y: dv.y[k], look: dv.look[k] }); }
          else { this.dDry[k] = t; skip.add(e); }
        }
        if (ty === DEVICE.orbital && e.kind === 'zap') {
          const n = Math.max(1, this.dCharges[k]);
          for (let o = 0; o < n; o++) {
            const a = (dv.phase[k] + o / n) * TAU, ox = b.x[e.who] + Math.cos(a) * STRUCT.orbitRadius, oy = b.y[e.who] + Math.sin(a) * STRUCT.orbitRadius;
            if (near(ox, oy, e.x, e.y, 0.2)) { skip.add(e); this.add('orbstrike', t, 0.7, { x: e.x, y: e.y, x2: e.x2 ?? e.x, y2: e.y2 ?? e.y, look: dv.look[k], seed: tick + k }); break; }
          }
        }
      }
    }
    for (let k = 0; k < MAX_DEVICES; k++) {
      const ty = dv.type[k];
      if (ty && (this.dType[k] !== ty || Math.abs(this.dX[k] - dv.x[k]) > 0.01 && ty !== DEVICE.orbital)) { this.dT0[k] = t; this.dShot[k] = -9; this.dDry[k] = -9; }
      if (this.dType[k] && (!ty || ty !== this.dType[k])) {
        const was = this.dType[k], o = this.dOwner[k];
        const kind = dismissed.has(o) || (was !== DEVICE.glyph && was !== DEVICE.lineglyph) ? 'fade' : 'glyphfire';
        if (kind === 'glyphfire') for (const e of w.events) if (e.kind === 'burst' && near(e.x, e.y, this.dX[k], this.dY[k])) skip.add(e);
        if (!(was === DEVICE.orbital && kind === 'fade' && !dismissed.has(o)))
          this.add(kind, t, kind === 'fade' ? 0.7 : 0.8, { x: this.dX[k], y: this.dY[k], x2: this.dX2[k], y2: this.dY2[k], look: this.dLook[k], who: o, n: was, seed: tick + k });
      }
      this.dType[k] = ty;
      if (ty) { this.dX[k] = dv.x[k]; this.dY[k] = dv.y[k]; this.dX2[k] = dv.x2[k]; this.dY2[k] = dv.y2[k]; this.dLook[k] = dv.look[k]; this.dOwner[k] = dv.owner[k]; this.dCharges[k] = dv.charges[k]; this.dPhase[k] = dv.phase[k]; }
    }
    // waves: where each started, and the trail it leaves when it ends
    for (let k = 0; k < MAX_WAVES; k++) {
      if (v.alive[k] && !this.vAlive[k]) { this.vSX[k] = v.x[k]; this.vSY[k] = v.y[k]; this.vT0[k] = t; }
      if (!v.alive[k] && this.vAlive[k]) this.add('trail', t, 2.6, { x: this.vSX[k], y: this.vSY[k], x2: this.vX[k], y2: this.vY[k], els: this.vEls.slice(k * N_EL, k * N_EL + N_EL), seed: k });
      this.vAlive[k] = v.alive[k];
      if (v.alive[k]) { this.vX[k] = v.x[k]; this.vY[k] = v.y[k]; this.vEls.set(v.els.subarray(k * N_EL, k * N_EL + N_EL), k * N_EL); }
    }
    // seats: motes spent, wards and auras coming and going, conjures
    for (let i = 0; i < MAX_SEATS; i++) {
      if (s.motes[i] < this.sMotes[i] && !dismissed.has(i)) this.add('motein', t, 0.6, { who: i, n: s.motes[i], seed: tick });
      this.sMotes[i] = s.motes[i];
      if (s.ward[i] && !this.sWard[i]) this.sWardT0[i] = t;
      if (!s.ward[i] && this.sWard[i]) this.add('wardoff', t, 0.7, { who: i, n: this.sWard[i], look: lead(this.sWardEls, i, ELID.shield), seed: tick });
      this.sWard[i] = s.ward[i]; if (s.ward[i]) this.sWardEls.set(s.wardEls.subarray(i * N_EL, i * N_EL + N_EL), i * N_EL);
      if (s.aura[i] > this.sAura[i] + 1) this.sAuraT0[i] = t;
      this.sAura[i] = s.aura[i];
      const cj = [s.wand[i], s.weapon[i], s.guard[i]];
      if (cj.some((c, j) => c && c !== this.sConj[i * 3 + j])) this.sConjT0[i] = t;
      for (let j = 0; j < 3; j++) this.sConj[i * 3 + j] = cj[j];
    }
    // Doubles: born, and echoing a one-shot (events with the Double as the source)
    for (let i = MAX_SEATS; i < MAX_BODIES; i++) {
      if (b.kind[i] === KIND.double && this.prevKind[i] !== KIND.double) {
        this.bornT[i] = t;
        for (let o = 0; o < MAX_SEATS; o++) if (s.double[o] === i) this.add('dblborn', t, 0.8, { who: o, n: i, seed: tick });
      }
      if (this.prevKind[i] === KIND.double && b.kind[i] !== KIND.double) this.add('dblgone', t, 0.6, { x: b.x[i], y: b.y[i], seed: tick });
      this.prevKind[i] = b.kind[i];
    }
    for (const e of w.events) {
      const src = e.kind === 'hit' || e.kind === 'heal' ? e.src ?? -1 : e.who;
      if (src >= MAX_SEATS && b.kind[src] === KIND.double && (e.kind === 'burst' || e.kind === 'zap' || e.kind === 'cast') && t - this.echoT[src] > 0.3) { this.echoT[src] = t; this.add('echo', t, 0.5, { n: src, seed: tick }); }
    }
    const m = w.missiles;
    for (let j = 0; j < m.alive.length; j++) if (m.alive[j] && m.owner[j] >= MAX_SEATS && b.kind[m.owner[j]] === KIND.double && t - this.echoT[m.owner[j]] > 0.3) { this.echoT[m.owner[j]] = t; this.add('echo', t, 0.5, { n: m.owner[j], seed: tick }); }
    this.fx = this.fx.filter((f) => t - f.t0 < f.life);
  }

  /** The seat this machine plays (its placement preview is the one shown). */
  localSeat = 0;
  /** Sim time of this frame (with interpolation): ages of sim-driven things. The draw methods' t is the cosmetic clock. */
  private st = 0;
  /** How far the cosmetic clock ran ahead of a stalled sim (s, capped): extrapolates sim-driven loops like the orbitals. */
  private lead = 0;

  /**
   * Draws everything into the field canvases (g under the actors, o over) and the depth-sorted pieces.
   * st is sim time (ages of sim state); t is the cosmetic clock (real time), which drives every loop,
   * flicker, spin and particle drift so they keep moving while the sim waits on the network or is paused.
   */
  draw(w: World, st: number, t: number, lead: number, g: Ctx, o: Ctx, bodies: BodyView[], light: LightFn, fx0: number, fy0: number): void {
    this.st = st; this.lead = lead;
    this.pieces.begin(fx0, fy0);
    this.slabs.begin(12);
    this.scorch.draw(w, st);
    const off = OFF;
    if (!off.includes('walls')) this.walls(w, t, g, o, light);
    if (w.run) this.altars(w, t, g, o, light);
    if (!off.includes('waves')) { this.waves(w, t, g, o, light); this.sparks(w, t, g, o, light); }
    if (!off.includes('devices')) this.devices(w, t, g, o, bodies, light);
    if (!off.includes('wizards')) this.onWizards(w, t, g, o, bodies, light);
    if (!off.includes('preview')) { this.preview(w, t, g, o, bodies); this.allyCue(w, t, g, o); }
    if (!off.includes('fx')) for (const f of this.fx) this.drawFx(w, f, st - f.t0, t, g, o, bodies, light);
    this.pieces.end();
  }

  /**
   * With a ward (Shield) or an aura (Sigil + elements) queued, the ally under your cursor gets a
   * pulsing ring at their feet and a marker overhead: Self will go on them, not on you.
   */
  private allyCue(w: World, t: number, g: Ctx, o: Ctx): void {
    const i = this.localSeat, s = w.seats, b = w.bodies;
    if (!s.active[i] || s.phase[i] !== PHASE.idle || !s.queueLen[i]) return;
    const shape = compile(queueOf(w, i), 'self').shape;
    if (shape !== 'ward' && shape !== 'aura') return;
    const j = selfTarget(w, i);
    if (j === i) return;
    const R = X.EL[shape === 'ward' ? 'shield' : 'sigil'], x = gx(b.x[j]), y = gy(b.y[j]), p = 0.5 + 0.5 * Math.sin(t * 6);
    const r = b.r[j] * PPU + 4 + p * 1.5;
    X.ellipse(g, x, y, r, r * FY, R[2], 0.22 + 0.12 * p);
    X.ring(g, x, y, r, r * FY, R[0], 0.8 + 0.2 * p);
    X.ring(g, x, y, r + 1, (r + 1) * FY, R[1], 0.6);
    const hy = y - 30 - Math.round(p * 2); // a chevron over their head, pointing down at them
    for (let k = 0; k < 4; k++) { X.rect(o, x - 4 + k, hy + k, 2, 1, R[0]); X.rect(o, x + 3 - k, hy + k, 2, 1, R[0]); }
  }

  // ---- Survive's altars ------------------------------------------------------------------------------
  /** When each altar last rose (view time), and what it offered then. */
  private altarT0 = new Float64Array(N_ALTARS).fill(-9);
  private altarPU = new Uint8Array(N_ALTARS);

  /**
   * The pick's three altars: a stone plinth on a rune ring in the power-up's colour, its glyph
   * floating over it and its name above. Standing on one fills the ring in your robe's colour;
   * every wizard who took it leaves a pip of their colour on the plinth.
   */
  private altars(w: World, t: number, g: Ctx, o: Ctx, light: LightFn): void {
    const r = w.run!, st = w.enc.state[0];
    for (let a = 0; a < N_ALTARS; a++) {
      const pu = st === PHASE_ENC.pick ? r.offer[a] : 0;
      if (pu !== this.altarPU[a]) { this.altarPU[a] = pu; this.altarT0[a] = pu ? t : -9; }
      if (!pu) continue;
      const p = perkOf(pu, r.offerEl[a]), R = p.ramp, x = Math.round(gx(r.ax[a])), y = Math.round(gy(r.ay[a]));
      const rise = easeOut(clamp((t - this.altarT0[a]) / 0.5, 0, 1)), bob = Math.round(Math.sin(t * 2.4 + a * 2) * 1.5);
      // the rune ring you stand in (the sim's pick radius)
      const rr = 0.85 * PPU;
      X.ellipse(g, x, y, rr, rr * FY, R[3] ?? R[2], 0.25 * rise);
      X.ring(g, x, y, rr, rr * FY, R[2], 0.9 * rise);
      X.ring(g, x, y, rr - 3, (rr - 3) * FY, R[4] ?? R[3], 0.6 * rise);
      for (let k = 0; k < 8; k++) { const an = t * 0.6 + (k / 8) * TAU; X.px(g, x + Math.cos(an) * (rr - 1.5), y + Math.sin(an) * (rr - 1.5) * FY, R[1]); }
      // whoever stands here fills the ring in their colour
      for (let s = 0; s < MAX_SEATS; s++) {
        if (r.standOn[s] !== a || r.picked[s] >= 0 || !r.stand[s]) continue;
        const f = clamp(r.stand[s] / T(SURVIVE_TIMES.stand), 0, 1);
        X.ring(g, x, y, rr + 1, (rr + 1) * FY, X.TEAMS[s].light, 1, -Math.PI / 2, -Math.PI / 2 + f * TAU);
        X.ring(g, x, y, rr + 2, (rr + 2) * FY, X.TEAMS[s].main, 1, -Math.PI / 2, -Math.PI / 2 + f * TAU);
      }
      // the plinth, depth-sorted with the wizards (it rises out of the floor)
      const H = Math.round(16 * rise);
      const c = this.pieces.canvas(x - 12, y - 46, 25, 52, y);
      X.ellipse(c, x + 2, y + 1, 10, 4, 'rgba(8,6,16,0.45)');
      X.rect(c, x - 9, y - 3, 19, 5, '#2c2e38'); X.rect(c, x - 8, y - 3, 17, 1, '#868c9a'); X.rect(c, x - 9, y + 1, 19, 1, '#1c1d25');
      if (H > 3) {
        X.rect(c, x - 6, y - 3 - H, 13, H, '#555a68'); X.rect(c, x - 6, y - 3 - H, 3, H, '#6c7280'); X.rect(c, x + 5, y - 3 - H, 2, H, '#40434f');
        X.rect(c, x - 8, y - 6 - H, 17, 4, '#868c9a'); X.rect(c, x - 8, y - 6 - H, 17, 1, '#c8ccd4'); X.rect(c, x - 8, y - 3 - H, 17, 1, '#2c2e38');
        // a carved channel down the front, glowing in the power-up's colour
        X.rect(c, x, y - 1 - H, 1, H - 2, R[2]);
        // pips for the wizards who took it
        let n = 0;
        for (let s = 0; s < MAX_SEATS; s++) if (r.picked[s] === a) { X.rect(c, x - 6 + n * 4, y - 9 - H, 3, 3, '#0a0810'); X.rect(c, x - 5 + n * 4, y - 8 - H, 2, 2, X.TEAMS[s].light); n++; }
      }
      // the glyph floats over it
      if (rise >= 1) {
        const gy0 = y - 3 - H - 22 + bob;
        X.rect(c, x - 8, gy0 - 1, 17, 17, '#0a0810'); X.rect(c, x - 7, gy0, 15, 15, R[4] ?? R[3]);
        glyph(c, p.glyph, x - 6, gy0 + 1, R[1], 2);
        light(x, gy0 + 7, 34, R[2], 0.5);
      }
      // the name, over everything
      const name = p.name.toUpperCase(), tw = name.length * 4 - 1, ty = y - 3 - H - 32;
      if (rise >= 1) X.text(o, name, x - Math.floor(tw / 2), ty, R[0], '#0a0810');
    }
  }

  // ---- Shield walls ---------------------------------------------------------------------------------
  private walls(w: World, t: number, g: Ctx, o: Ctx, light: LightFn): void {
    const wl = w.walls, s = w.seats, tick = w.clock[0], live = new Set<string>();
    const joins = (k: number, x: number, y: number) => {
      for (let j = 0; j < MAX_WALLS; j++) if (j !== k && wl.type[j] === WALL.rock && ((Math.abs(wl.x1[j] - x) < 0.05 && Math.abs(wl.y1[j] - y) < 0.05) || (Math.abs(wl.x2[j] - x) < 0.05 && Math.abs(wl.y2[j] - y) < 0.05))) return true;
      return false;
    };
    for (let k = 0; k < MAX_WALLS; k++) {
      const ty = wl.type[k]; if (!ty) continue;
      const a: Pt = [gx(wl.x1[k]), gy(wl.y1[k])], bb: Pt = [gx(wl.x2[k]), gy(wl.y2[k])];
      const age = (tick - (w.walls.born[k] ?? 0)) / 60, hpf = clamp(wl.hp[k] / Math.max(1, wl.maxHp[k]), 0, 1), hitE = this.st - this.wHitT[k];
      if (ty === WALL.rock) {
        const cold = has(wl.els, k, ELID.cold), coat = lead(wl.els, k, ELID.shield, ELID.earth);
        const endA = !joins(k, wl.x1[k], wl.y1[k]), endB = !joins(k, wl.x2[k], wl.y2[k]);
        const pre = `${k}:${wl.born[k]}:${+endA}${+endB}:${+cold}`;
        live.add(pre);
        let gm = this.geoms.get(pre);
        if (!gm) {
          const lenPx = Math.hypot(bb[0] - a[0], (bb[1] - a[1]) / FY);
          const ruin = wl.owner[k] === TERRAIN; // the arena's own rock: taller, older stone
          const spec: WallSpec = { a: [a[0], a[1]], b: [bb[0], bb[1]], n: Math.max(1, Math.round(lenPx / 12)), H: ruin ? 19 : 14, T: ruin ? 8 : 7, mat: ruin ? 'ruin' : cold ? 'frost' : 'stone', seed: (k * 7 + wl.born[k]) & 1023, endA, endB };
          gm = { spec, g: wallGeom(spec) };
          this.geoms.set(pre, gm);
        }
        const st = hpf > 0.8 ? 0 : hpf > 0.6 ? 1 : hpf > 0.4 ? 2 : hpf > 0.2 ? 3 : 4;
        const rs = clamp(Math.ceil((age / 0.28) * RISE_STEPS), 1, RISE_STEPS);
        const jolt = hitE >= 0 && hitE < 0.12 ? (Math.floor(hitE * 60) % 2 ? 1 : -1) : 0;
        for (let i = 0; i < gm.spec.n; i++) {
          const key = `${pre}|${i}|${st}|${rs}`, sl = gm.g.slabs[i], spec = gm.spec, geo = gm.g;
          let tex = this.slabs.get(key, () => paintSlab(spec, geo, i, st, rs / RISE_STEPS), !this.lastTex.has(pre + i));
          if (tex === undefined) tex = this.lastTex.get(pre + i) ?? null;
          else if (tex) this.lastTex.set(pre + i, tex);
          if (!tex) continue;
          this.pieces.tex(tex, Math.round(sl.cx) - SLAB_OX + jolt, Math.round(sl.cy) - SLAB_OY, sl.cy);
        }
        // a fresh wall tears out of the ground in dust
        if (age < 0.6) for (let i = 0; i < 4; i++) K.dust(o, lerp(a[0], bb[0], (i + 0.5) / 4), lerp(a[1], bb[1], (i + 0.5) / 4), age, k * 5 + i, 3, 8, '#8a7a68', 0.7);
        if (age < 0.3) light((a[0] + bb[0]) / 2, (a[1] + bb[1]) / 2, 40, '#e0c8a0', 0.4 * (1 - age / 0.3));
        if (coat && st < 4) this.wallCoat(o, gm.g, gm.spec, coat, t, k, light);
        continue;
      }
      // energy: a barrier (Shield alone) or a curtain in its element
      const owner = wl.owner[k];
      const pool = owner >= 0 && owner < MAX_SEATS ? s.runes[owner * N_EL + ELID.shield - 1] : RUNES.max.shield;
      const kS = clamp((pool - STRUCT.reserve) / 2.2, 0.12, 1) * (0.75 + 0.25 * hpf);
      const rise = easeOut(clamp(age / 0.25, 0, 1));
      const x0 = Math.min(a[0], bb[0]), x1 = Math.max(a[0], bb[0]), y0 = Math.min(a[1], bb[1]), y1 = Math.max(a[1], bb[1]);
      const n = Math.max(2, Math.ceil(Math.max(x1 - x0, y1 - y0)) + 1), cols: Pt[] = [];
      for (let j = 0; j < n; j++) cols.push([lerp(a[0], bb[0], j / (n - 1)), lerp(a[1], bb[1], j / (n - 1))]);
      const mid: Pt = [(a[0] + bb[0]) / 2, (a[1] + bb[1]) / 2];
      if (ty === WALL.barrier) {
        const h = 16 * rise;
        const c = this.pieces.canvas(x0 - 3, y0 - h - 6, x1 - x0 + 7, y1 - y0 + h + 10, mid[1]);
        S.sheetCols(c, cols, h, t, kS, EL.shield, RGB.shield, k, hitE);
        if (k % 2 === 0) light(mid[0], mid[1], 30, '#ffc83a', 0.32 * kS * rise);
        continue;
      }
      this.curtain(w, k, t, g, a, bb, cols, mid, rise, kS, hitE, light);
    }
    this.slabs.prune(live);
    for (const key of this.geoms.keys()) if (!live.has(key)) { this.geoms.delete(key); }
    for (const key of this.lastTex.keys()) { const p = key.slice(0, key.lastIndexOf(':') + 2); if (!live.has(p)) this.lastTex.delete(key); }
  }

  /** What a coated rock wall shows: fire licks and glowing seams, sparks, drips, glints. */
  private wallCoat(o: Ctx, gm: WallGeom, spec: WallSpec, coat: number, t: number, k: number, light: LightFn): void {
    const el = elName(coat), R = ramp(coat);
    for (let i = 0; i < spec.n; i++) {
      const sl = gm.slabs[i], top = facePoint(gm, i, 0, sl.H);
      if (el === 'fire') {
        K.tongue(o, top[0] + (rand(i, k) - 0.5) * 4, top[1] + 1, 1.6, 3 + 2.5 * (0.5 + 0.5 * Math.sin(t * 12 + i * 2.3 + k)), Math.sin(t * 7 + i));
        const sm = facePoint(gm, i, (rand(i, 3, k) - 0.5) * 4, sl.H * 0.45);
        X.px(o, sm[0], sm[1], Math.sin(t * 9 + i) > 0 ? EL.fire[2] : EL.fire[3]); X.px(o, sm[0] + 1, sm[1] + 1, EL.fire[3]);
        if (i % 2 === 0) light(top[0], top[1] + sl.H, 26, '#ff7020', 0.35);
      } else if (el === 'lightning') {
        if (Math.floor(t * 18 + i) % 4 === 0) { const p = facePoint(gm, i, (rand(i, Math.floor(t * 18), k) - 0.5) * 6, rand(i, Math.floor(t * 18), 2) * sl.H); X.lines(o, K.bolt(p, [p[0] + 4, p[1] - 3], Math.floor(t * 18) + i, 0.6, 2), R[1]); }
      } else if (el === 'water') {
        for (const p of emit(t, 2, 0.6, (q, age) => { const f = facePoint(gm, i, (rand(q, 9, i) - 0.5) * 6, sl.H * (1 - age)); return { x: f[0], y: f[1], age }; })) X.px(o, p.x, p.y, '#8ad0ff');
      } else if (el === 'life') {
        if (rand(i, Math.floor(t * 3), k) < 0.4) { const p = facePoint(gm, i, (rand(i, 2, k) - 0.5) * 6, sl.H * rand(i, 4, k)); X.px(o, p[0], p[1], LIFE[2]); X.px(o, p[0], p[1] - 1, LIFE[3]); }
      } else if (el === 'arcane' || el === 'sigil' || el === 'shield') {
        const tw = Math.sin(t * 5 + i * 2.3 + k);
        if (tw > 0.8) { const p = facePoint(gm, i, (rand(i, 5, k) - 0.5) * 6, sl.H * (0.2 + rand(i, 6, k) * 0.6)); X.px(o, p[0], p[1], R[1]); if (tw > 0.95) { X.px(o, p[0] - 1, p[1], R[2]); X.px(o, p[0] + 1, p[1], R[2]); } }
      }
    }
  }

  /** A curtain: walk through it, but crossing it pulses its element. Life's is a healing zone. */
  private curtain(w: World, k: number, t: number, g: Ctx, a: Pt, bb: Pt, cols: Pt[], mid: Pt, rise: number, kS: number, hitE: number, light: LightFn): void {
    const wl = w.walls, coat = lead(wl.els, k, ELID.shield) || ELID.arcane, el = elName(coat), R = ramp(coat), sd = k * 13;
    const pulse = 1 - clamp(((w.clock[0] - wl.born[k]) % 30) / 8, 0, 1);
    const x0 = Math.min(a[0], bb[0]), x1 = Math.max(a[0], bb[0]), y0 = Math.min(a[1], bb[1]), y1 = Math.max(a[1], bb[1]);
    const h = (el === 'fire' ? 15 : 14) * rise, head = 18;
    const c = this.pieces.canvas(x0 - 6, y0 - h - head, x1 - x0 + 13, y1 - y0 + h + head + 6, mid[1]);
    const P = S.sample([a, bb], 4);
    if (el === 'fire') {
      for (const p of cols) if ((Math.round(p[0]) + Math.round(p[1])) % 3 === 0) X.ellipse(g, p[0], p[1], 2.5, 1.2, 'rgba(26,16,14,0.5)');
      // one continuous sheet of flame along the line (fire-place-v3's column fire): a low base and
      // tongues where travelling waves peak, gold roots, orange body, red-orange tips
      const FR = EL.fire, n = cols.length;
      // one column per pixel along the wall: a north-south wall would stack them into a 1 px strip,
      // so columns widen as the wall turns vertical (1 px across the screen, 4 px up it)
      const adx = Math.abs(bb[0] - a[0]), ady = Math.abs(bb[1] - a[1]);
      const cw = 1 + Math.round((3 * ady) / (adx + ady + 1e-6)), co = Math.floor(cw / 2);
      for (let j = 0; j < n; j++) {
        const xx = Math.round(cols[j][0]), yy = Math.round(cols[j][1]), edge = Math.min(1, (j + 1) / 4, (n - j) / 4);
        if (edge < 0.5 && rand(xx, yy, 3) > edge * 1.6) continue;
        const wv = 0.5 + 0.5 * Math.sin(j * 0.55 - t * 6 + Math.sin(j * 0.21) * 3), w2 = 0.5 + 0.5 * Math.sin(j * 0.23 + t * 3.1);
        const hh = Math.round(((3 + 2 * pulse) + (h - 3) * wv * wv * (0.55 + 0.45 * w2) * (0.85 + 0.15 * Math.sin(t * 13 + j))) * edge * rise);
        if (hh < 1) continue;
        const sw = Math.sin(t * 9 + j * 0.4), b1 = Math.round(hh * 0.35), b2 = Math.round(hh * 0.75);
        if (b1 > 0) X.rect(c, xx - co, yy - b1 + 1, cw, b1, FR[1]);
        if (b2 > b1) X.rect(c, xx - co + Math.round(sw * b2 * 0.06), yy - b2 + 1, cw, b2 - b1, FR[2]);
        if (hh > b2) X.rect(c, xx - co + Math.round(sw * hh * 0.12), yy - hh + 1, Math.max(1, cw - 1), hh - b2, hh > 7 ? FR[3] : FR[2]);
        if (hh > 9 && wv > 0.97) X.px(c, xx + Math.round(sw * hh * 0.14), yy - hh, FR[0]);
      }
      for (const p of emit(t, 4 * P.length, 1, (i, age) => { const q = P[mod(i, P.length)]; return { x: q[0] + Math.sin(age * 5 + i) * 2, y: q[1] - h * 0.6 - age * 14, age }; })) X.px(c, p.x, p.y, p.age < 0.5 ? EL.fire[1] : EL.fire[3]);
      light(mid[0], mid[1], 40, '#ff7020', 0.6 * rise);
      return;
    }
    if (el === 'life') {
      // a healing zone: a soft green glow on the ground along it, warm light rising, sparkles and pluses
      for (const p of P) { X.ellipse(g, p[0], p[1], 6, 3, '#1e7a34', 0.35 * rise); X.ellipse(g, p[0], p[1], 3.5, 1.8, '#46c450', 0.3 * rise); }
      S.sheetCols(c, cols, h * 0.55, t, Math.max(0.4, kS) * 0.7, [LIFE[2], LIFE[3], LIFE[4], LIFE[5], LIFE[5]], RGB.life, k, hitE);
      for (const p of emit(t, 3 * P.length, 1.1, (i, age) => { const q = P[mod(i, P.length)]; return { x: q[0] + (rand(i, 3, sd) - 0.5) * 6, y: q[1] - age * (h + 10), age, i }; })) {
        const col = p.age < 0.4 ? '#ffffff' : p.age < 0.7 ? X.WARM[2] : LIFE[3];
        if (p.i % 4 === 0 && p.age < 0.7) { X.px(c, p.x - 1, p.y, col); X.px(c, p.x + 1, p.y, col); X.px(c, p.x, p.y - 1, col); X.px(c, p.x, p.y + 1, col); }
        X.px(c, p.x, p.y, col);
      }
      light(mid[0], mid[1], 40, '#8ef07e', (0.45 + 0.3 * pulse) * rise);
      return;
    }
    const Rr: Ramp = el === 'cold' ? X.FROST : R;
    S.sheetCols(c, cols, h, t, Math.max(0.35, kS) * (0.8 + 0.2 * pulse), Rr, RGB[el] ?? RGB.arcane, k, hitE);
    if (el === 'cold') {
      for (const p of emit(t, 3 * P.length, 1.4, (i, age) => { const q = P[mod(i, P.length)]; return { x: q[0] + (rand(i, 3, sd) - 0.5) * 6 + Math.sin(age * 6 + i) * 1.5, y: q[1] - h + age * h, age, i }; })) X.px(c, p.x, p.y, p.i % 3 ? '#ffffff' : X.FROST[2]);
      for (const p of cols) if (rand(Math.round(p[0]), 7, sd) < 0.3) X.px(g, p[0], p[1] + 1, '#c4eefa');
      light(mid[0], mid[1], 34, '#9ff4ff', 0.4 * rise);
    } else if (el === 'water') {
      for (const p of emit(t, 6 * P.length, 0.5, (i, age) => { const q = P[mod(i, P.length)]; return { x: q[0] + (rand(i, 3, sd) - 0.5) * 6, y: q[1] - h + age * age * h, age }; })) X.px(c, p.x, p.y, p.age < 0.5 ? '#e0f6ff' : EL.water[1]);
      light(mid[0], mid[1], 34, '#3a98ff', 0.4 * rise);
    } else if (el === 'lightning') {
      if (Math.floor(t * 20) % 3 !== 2) for (let i = 0; i < P.length; i += 2) if (rand(i, Math.floor(t * 20), sd) < 0.5) { const p = P[i]; X.lines(c, K.bolt([p[0], p[1]], [p[0] + (rand(i, 3, Math.floor(t * 20)) - 0.5) * 4, p[1] - h], sd + i + Math.floor(t * 20), 0.4, 3), R[1]); }
      light(mid[0], mid[1], 40, '#b08aff', 0.5 * rise);
    } else {
      for (const p of emit(t, 3 * P.length, 1, (i, age) => { const q = P[mod(i, P.length)]; return { x: q[0] + Math.sin(age * 5 + i) * 2, y: q[1] - age * (h + 8), age }; })) X.px(c, p.x, p.y, p.age < 0.5 ? R[1] : R[2]);
      light(mid[0], mid[1], 34, R[2], 0.4 * rise);
    }
  }

  // ---- Waves -------------------------------------------------------------------------------------
  private waves(w: World, t: number, g: Ctx, o: Ctx, light: LightFn): void {
    const v = w.waves;
    for (let k = 0; k < MAX_WAVES; k++) {
      if (!v.alive[k]) continue;
      const els = v.els, earth = has(els, k, ELID.earth), water = has(els, k, ELID.water), coat = lead(els, k, ELID.shield);
      const range = v.range[k] || STRUCT.waveRange, fade = Math.min(seg(v.travelled[k], 0, 0.5), 1 - seg(v.travelled[k], range - 1.2, range));
      const fdx = v.dx[k], fdy = v.dy[k], px = -fdy, py = fdx, half = v.half[k], sd = k * 17 + 5;
      // the front, bowed forward in the middle; sorted back to front on screen
      const N = Math.max(8, Math.round(half * 2 * PPU / 3));
      const pts: { x: number; y: number; q: number; i: number }[] = [];
      for (let i = 0; i <= N; i++) {
        const s = (i / N) * 2 - 1, bow = (1 - s * s) * 0.35;
        pts.push({ x: gx(v.x[k] + px * s * half + fdx * bow), y: gy(v.y[k] + py * s * half + fdy * bow), q: Math.sqrt(Math.max(0, 1 - s * s)), i });
      }
      pts.sort((p, q) => p.y - q.y);
      const fl = Math.hypot(fdx, fdy * FY) || 1, ux = fdx / fl, uy = (fdy * FY) / fl;
      this.waveTrail(g, this.vSX[k], this.vSY[k], v.x[k], v.y[k], els, k, 1, half);
      if (water) {
        // the tidal wave: a curling wall of water, white foam on the crest, spray thrown forward
        for (const p of pts) {
          const h = 16 * p.q * fade; if (h < 1) continue;
          const bx = p.x - ux * 14, by = p.y - uy * 14;
          X.poly(o, [[bx, by], [p.x - ux * 2, p.y - uy * 2 - h], [p.x + ux * 2, p.y + uy * 2 - h + 2], [p.x + ux, p.y + uy]], EL.water[3]);
          X.poly(o, [[lerp(bx, p.x, 0.5), lerp(by, p.y, 0.5) - h * 0.5], [p.x - ux * 2, p.y - uy * 2 - h], [p.x + ux * 2, p.y + uy * 2 - h + 2], [p.x, p.y - h * 0.4]], EL.water[2]);
          X.line(o, p.x - ux * 3, p.y - uy * 3 - h, p.x + ux * 2, p.y + uy * 2 - h + 2, '#ffffff');
          if (p.i % 2 === 0) X.px(o, p.x + ux, p.y + uy - 1, EL.water[1]);
        }
        for (const p of emit(t, 70, 0.5, (i, age) => { const q = pts[mod(i, pts.length)]; const h = 16 * q.q * fade; if (h < 3) return null; return { x: q.x + ux * age * 10, y: q.y + uy * age * 10 - h - age * 6 + age * age * 14, age }; })) X.px(o, p.x, p.y, p.age < 0.4 ? '#ffffff' : EL.water[1]);
        light(gx(v.x[k]), gy(v.y[k]), 60, '#3a98ff', 0.5 * fade);
      } else if (earth) {
        // the fault line: a heave of broken ground, rock spikes bursting up along the front
        for (const p of pts) for (let j = 0; j < 2; j++) {
          const h = (11 - j * 4) * (0.7 + rand(p.i, j, sd) * 0.6) * p.q * fade; if (h < 1.5) continue;
          const x = p.x - ux * j * 5 + (rand(p.i, j, sd + 1) - 0.5) * 3, yy = p.y - uy * j * 5, wd = 2.5 + rand(p.i, j, sd + 2) * 1.5;
          X.poly(o, [[x - wd - 1, yy + 1], [x + wd + 1, yy + 1], [x + 1, yy - h - 1], [x - 1, yy - h - 1]], '#1a120c');
          X.poly(o, [[x - wd, yy], [x + wd, yy], [x + 0.5, yy - h]], X.EARTH[2]);
          X.poly(o, [[x - wd, yy], [x - wd * 0.1, yy], [x, yy - h + 1]], X.EARTH[0]);
        }
        for (const p of emit(t, 40, 0.6, (i, age) => { const q = pts[mod(i, pts.length)]; return { x: q.x - ux * age * 6, y: q.y - uy * age * 6 - 3 - age * 8, age, i }; })) K.puff(o, p.x, p.y, 1.5 + p.age * 3, p.i % 2 ? '#8a7a68' : '#6a5a4a', (1 - p.age) * 0.9 * fade);
        light(gx(v.x[k]), gy(v.y[k]), 50, '#d8b88a', 0.4 * fade);
      } else {
        // Shove (and the elemental fronts): a front of light sweeping forward, in its element
        const id = coat || ELID.shield, el = elName(id), R: Ramp = el === 'cold' ? X.FROST : id === ELID.life ? LIFE : ramp(id);
        const band = (p: { x: number; y: number; q: number; i: number }, f: number) => [p.x - ux * f, p.y - uy * f] as const;
        // a translucent sheet of force bowed forward, a bright crest and base
        const ord = pts.slice().sort((p, q) => p.i - q.i);
        const tops: Pt[] = ord.map((p) => [p.x, p.y - 11 * p.q * fade]), bases: Pt[] = ord.map((p) => [p.x, p.y]);
        X.poly(o, tops.concat(bases.slice().reverse()), `rgba(${RGB[el] ?? RGB.shield},${(0.22 * fade).toFixed(2)})`); o._fs = null;
        X.lines(o, tops, R[1], 1); X.lines(o, bases, R[2], 1);
        for (const p of pts) {
          const h = 11 * p.q * fade; if (h < 1) continue;
          for (let j = 0; j < 4; j++) { const [x, y] = band(p, j * 3); if (rand(p.i, j, Math.floor(t * 12)) < 0.75 - j * 0.15) X.px(o, x, y - 1, R[j < 2 ? 1 : 2]); }
          for (let z = 1; z < h; z++) if ((z + p.i + Math.floor(t * 20)) % 3 === 0) X.px(o, p.x, p.y - z, z > h * 0.6 ? R[1] : R[2]);
          X.px(o, p.x, p.y - h, R[0]); X.px(o, p.x + ux, p.y + uy, R[1]);
        }
        // speed streaks behind the front
        for (let i = 0; i < 8; i++) { const p = pts[Math.floor(rand(i, Math.floor(t * 15), sd) * pts.length)]; const L = 6 + rand(i, 3, sd) * 8, z = 2 + rand(i, 4, sd) * 8 * p.q; X.line(o, p.x - ux * 3, p.y - uy * 3 - z, p.x - ux * (3 + L), p.y - uy * (3 + L) - z, R[2]); }
        if (el === 'fire') for (const p of pts) if (p.i % 2 === 0) K.tongue(o, p.x, p.y, 1.8, (6 + 3 * Math.sin(t * 13 + p.i)) * p.q * fade, -ux * 2);
        if (el === 'lightning' && Math.floor(t * 20) % 3 !== 2) for (let i = 1; i < pts.length; i += 2) X.lines(o, K.bolt([pts[i - 1].x, pts[i - 1].y - 6], [pts[i].x, pts[i].y - 6], Math.floor(t * 20) + i, 0.5, 2), R[1]);
        if (el === 'cold') for (const p of pts) if (p.i % 3 === 0) K.shard(o, p.x, p.y - 3, -Math.PI / 2 + (rand(p.i, 1, sd) - 0.5), 5 * p.q * fade, p.i + sd, 1);
        if (id === ELID.life) K.sparkle(o, gx(v.x[k]), gy(v.y[k]) - 6, t, fade, half * PPU, sd, LIFE, 20);
        light(gx(v.x[k]), gy(v.y[k]), 50, R[2], 0.5 * fade);
      }
    }
  }
  /** What a wave leaves on the floor: soaked streaks (water), a jagged fault (earth). k fades it out. */
  private waveTrail(g: Ctx, sx: number, sy: number, ex: number, ey: number, els: Uint8Array, at: number, k: number, half: number): void {
    const earth = has(els, at, ELID.earth), water = has(els, at, ELID.water), fire = has(els, at, ELID.fire);
    if (!earth && !water && !fire) return;
    const L = Math.hypot(ex - sx, ey - sy); if (L < 0.2) return;
    const ux = (ex - sx) / L, uy = (ey - sy) / L, px = -uy, py = ux;
    if (water) for (let i = 0; i < L * 3; i++) {
      const f = rand(i, 61, at) * L, s = (rand(i, 62, at) - 0.5) * 1.8 * half;
      X.poly(g, K.blobPts(gx(sx + ux * f + px * s), gy(sy + uy * f + py * s), 5 + rand(i, 63, at) * 7, 2 + rand(i, 64, at) * 1.5, i), `rgba(30,74,140,${(0.35 * k).toFixed(2)})`);
    }
    if (earth || fire) {
      const col = earth ? `rgba(26,18,12,${(0.9 * k).toFixed(2)})` : `rgba(22,14,16,${(0.6 * k).toFixed(2)})`;
      let lx = gx(sx), ly = gy(sy);
      for (let d = 0.2; d < L; d += 0.2) {
        const j = (rand(Math.round(d * 5), 3, at) - 0.5) * 0.25, nx = gx(sx + ux * d + px * j), ny = gy(sy + uy * d + py * j);
        X.line(g, lx, ly, nx, ny, col);
        if (earth && rand(Math.round(d * 5), 4, at) < 0.18) { const s = rand(Math.round(d * 5), 5, at) < 0.5 ? -1 : 1; X.lines(g, [[nx, ny], [nx + px * s * 3, ny + py * s * 3 * FY], [nx + px * s * 6 + 2, ny + py * s * 6 * FY]], col); }
        lx = nx; ly = ny;
      }
    }
  }

  // ---- Sigil devices -----------------------------------------------------------------------------
  private devices(w: World, t: number, g: Ctx, o: Ctx, bodies: BodyView[], light: LightFn): void {
    const dv = w.devices, s = w.seats;
    for (let k = 0; k < MAX_DEVICES; k++) {
      const ty = dv.type[k]; if (!ty) continue;
      const x = gx(dv.x[k]), y = gy(dv.y[k]), look = dv.look[k], R = look === ELID.life ? LIFE : ramp(look), age = this.st - this.dT0[k], up = easeOut(clamp(age / 0.3, 0, 1));
      const owner = dv.owner[k];
      if (ty === DEVICE.turret) {
        const dry = this.st - this.dDry[k] < 0.7 ? 1 : 0, se = this.st - this.dShot[k];
        const recoil = se >= 0 && se < 0.3 ? 0.7 * (1 - se / 0.3) : 0;
        const charge = !dry && dv.timer[k] > 0 && dv.timer[k] < 12 ? 1 - dv.timer[k] / 12 : 0;
        S.runeRing(g, x, y, 12, t, up, dry);
        X.shadow(g, x, y - 1, 5, 3, 8, 'rgba(8,6,16,0.45)');
        const c = this.pieces.canvas(x - 22, y - 40, 44, 50, y);
        const orb = S.sigilDevice(c, x, y, t, { R: R.length >= 5 ? R : [...R, R[R.length - 1]], rise: up, recoil, charge, dry, orbZ: 16 });
        if (orb) light(orb[0], y, 36, R[2], (recoil > 0 ? 0.8 : 0.4) * up * (dry ? 0.3 : 1));
        if (dry && orb) for (const p of emit(t, 4, 1.2, (i, a2) => ({ x: orb[0] + a2 * 4, y: orb[1] - 2 - a2 * 14, age: a2 }))) K.puff(o, p.x, p.y, 1.5 + p.age * 2, '#4a4458', 1 - p.age);
      } else if (ty === DEVICE.glyph) {
        const draw = clamp(1 - dv.timer[k] / T(STRUCT.glyphArm), 0, 1), armed = dv.timer[k] <= 0;
        S.glyph(g, x, y, STRUCT.glyphRadius * PPU, SV, t, draw, armed, elName(look), R[1]);
        if (!armed) X.ring(g, x, y, STRUCT.glyphRadius * PPU * (1.6 - draw * 0.6), STRUCT.glyphRadius * PPU * (1.6 - draw * 0.6) * FY, SV[1], 0.4 + draw * 0.4);
        light(x, y, 22, armed ? R[2] : SV[2], armed ? 0.3 + 0.12 * Math.sin(t * 5) : 0.2 * draw);
      } else if (ty === DEVICE.lineglyph) {
        const draw = clamp(1 - dv.timer[k] / T(STRUCT.glyphArm), 0, 1), armed = dv.timer[k] <= 0, x2 = gx(dv.x2[k]), y2 = gy(dv.y2[k]);
        S.lineGlyph(g, [[x, y], [x2, y2]], SV, t, draw, armed, R);
        if (armed) light((x + x2) / 2, (y + y2) / 2, 34, R[2], 0.25 + 0.1 * Math.sin(t * 5));
      } else if (ty === DEVICE.orbital) {
        const v = bodies[owner]; if (!v?.on) continue;
        const n = dv.charges[k], RR = STRUCT.orbitRadius * PPU * up, Z = 12;
        // the orbit: a faint dotted ellipse at orb height, its back half behind the caster
        for (let q = 0; q < 56; q++) { const a = (q / 56) * TAU, sy2 = Math.sin(a); if ((q + Math.floor(t * 10)) % 3) continue; X.px(sy2 < 0 ? g : o, v.x + Math.cos(a) * RR, v.y + sy2 * RR * FY - Z, SV[3]); }
        S.seal(g, v.x, v.y, RR + 2, t, 0.45 * up);
        for (let p = 0; p < n; p++) {
          const a = (dv.phase[k] + this.lead * STRUCT.orbitSpeed + p / n) * TAU, ox = v.x + Math.cos(a) * RR, oy = v.y + Math.sin(a) * RR * FY, oz = Z + Math.sin(t * 4 + p) * 1.5;
          X.ellipse(g, ox, oy, 2.5, 1, 'rgba(8,6,16,0.5)');
          const c = this.pieces.canvas(ox - 12, oy - oz - 10, 24, 20, oy);
          for (let j = 1; j <= 5; j++) { const b2 = a - j * 0.16, tx = v.x + Math.cos(b2) * RR, ty2 = v.y + Math.sin(b2) * RR * FY - oz; K.sq(c, tx, ty2, j < 2 ? 2 : 1, j < 2 ? SV[1] : j < 4 ? SV[2] : SV[3]); }
          X.glow(c, ox, oy - oz, 5, SV[3], 0.6);
          this.orb(c, ox, oy - oz, look, t, k * 7 + p);
          light(ox, oy, 20, R[2], 0.3);
        }
      } else if (ty === DEVICE.lens) {
        let pass = 0;
        const m = w.missiles;
        for (let j = 0; j < m.alive.length; j++) if (m.alive[j] && Math.abs(m.x[j] - dv.x[k]) < STRUCT.lensRadius && Math.abs(m.y[j] - dv.y[k]) < STRUCT.lensRadius) pass = 1;
        for (let i = 0; i < MAX_SEATS; i++) if (s.active[i] && s.phase[i] === PHASE.channel) { const ex = s.chanEndX[i], ey = s.chanEndY[i]; if (Math.abs(ex - dv.x[k]) + Math.abs(ey - dv.y[k]) > 0.01) { /* beams through the lens: a steady flare */ const bx = w.bodies.x[i], by = w.bodies.y[i], L2 = Math.hypot(ex - bx, ey - by) || 1, tt = ((dv.x[k] - bx) * (ex - bx) + (dv.y[k] - by) * (ey - by)) / (L2 * L2); if (tt > 0 && tt < 1.05) { const qx = bx + (ex - bx) * tt, qy = by + (ey - by) * tt; if (Math.hypot(qx - dv.x[k], qy - dv.y[k]) < STRUCT.lensRadius) pass = Math.max(pass, 0.7); } } }
        S.seal(g, x, y, 7, t, up);
        X.ellipse(g, x, y + 1, 4, 1.5, 'rgba(8,6,16,0.4)');
        const c = this.pieces.canvas(x - 14, y - 40, 28, 44, y, 0xffffff);
        S.lens(c, x, y, t, up, pass * (0.75 + 0.25 * Math.sin(t * 30)));
        light(x, y - 8, 30, '#d400ff', 0.45 * up); if (pass) light(x, y - 10, 70, '#f0c0ff', 0.9 * pass);
      }
    }
  }
  /** An orbital: a small orb in its element (the look rule). */
  private orb(c: Ctx, x: number, y: number, look: number, t: number, sd: number): void {
    const el = elName(look);
    if (el === 'fire') { K.fireball(c, x, y, 2.4, t, 0.3, -1, sd); return; }
    if (el === 'earth') { K.rock(c, x, y, 2.8, sd); X.px(c, x - 1, y - 1, '#ffffff'); return; }
    if (el === 'cold') { K.rock(c, x, y, 2.6, sd, K.ROCK_MAT.cold); if (Math.floor(t * 6 + sd) % 4 === 0) X.px(c, x - 1, y - 2, '#ffffff'); return; }
    if (el === 'water') { X.ellipse(c, x, y, 2.6, 2.6, EL.water[3]); X.ellipse(c, x - 0.5, y - 0.5, 1.8, 1.8, EL.water[2]); X.px(c, x - 1, y - 1, '#e0f6ff'); return; }
    if (el === 'life') { K.rock(c, x, y, 2.6, sd, K.ROCK_MAT.life); X.glow(c, x, y, 4, LIFE[3], 0.6); X.px(c, x, y, LIFE[1]); return; }
    if (el === 'lightning') { X.glow(c, x, y, 4, EL.lightning[2], 0.9); X.rect(c, x - 1, y - 1, 3, 3, EL.lightning[1]); X.px(c, x, y, '#ffffff'); if (Math.floor(t * 18) % 2) X.lines(c, K.bolt([x, y], [x + 4, y + 2], Math.floor(t * 18) + sd, 0.6, 2), EL.lightning[1]); return; }
    const R = ramp(look);
    X.ellipse(c, x, y, 2.6, 2.6, R[3]); X.ellipse(c, x - 0.5, y - 0.5, 1.7, 1.7, R[1]); X.px(c, x - 1, y - 1, '#ffffff');
  }

  // ---- On wizards: wards, auras, motes, wand, weapons, shields; the Double --------------------------
  private onWizards(w: World, t: number, g: Ctx, o: Ctx, bodies: BodyView[], light: LightFn): void {
    const s = w.seats, b = w.bodies;
    for (let i = 0; i < MAX_SEATS; i++) {
      if (!s.active[i]) continue;
      const v = bodies[i]; if (!v?.on || !v.a) continue;
      const face = (Math.round(b.face[i] * 16) / 16) * TAU, cs = Math.cos(face), sn = Math.sin(face);
      const P = (f: number, r: number, u: number): [number, number, number] => [v.x + f * cs - r * sn, v.y + (f * sn + r * cs) * FY - u * CU, f * sn + r * cs];
      const ch: Pt = [v.x + v.a.chest[0], v.y + v.a.chest[1]];
      if (b.downed[i]) continue;
      // auras first (ground and around), then the ward, then what is held
      if (s.aura[i] > 0) this.aura(w, i, v, t, g, o, P, light);
      if (s.ward[i]) this.ward(w, i, v, t, g, o, P, ch, light);
      if (s.motes[i]) {
        const n = s.motes[i], MR = 15, CY = v.y - 12;
        for (let q = 0; q < 56; q++) if ((q + Math.floor(t * 10)) % 3 === 0) { const a = (q / 56) * TAU; X.px(Math.sin(a) < 0 ? g : o, v.x + Math.cos(a) * MR, CY + Math.sin(a) * MR * FY, SV[3]); }
        for (let p = 0; p < n; p++) {
          const ang = t * 2.2 + (p * TAU) / 3, x = v.x + Math.cos(ang) * MR, y = CY + Math.sin(ang) * MR * FY, c = Math.sin(ang) < -0.2 ? g : o;
          for (let j = 1; j <= 5; j++) { const a2 = ang - j * 0.14; K.sq(c, v.x + Math.cos(a2) * MR, CY + Math.sin(a2) * MR * FY, j < 3 ? 2 : 1, j < 2 ? SV[1] : j < 4 ? SV[2] : SV[3]); }
          X.glow(c, x, y, 5, SV[2], 0.75); X.rect(c, x - 2, y - 1, 5, 3, SV[1]); X.rect(c, x - 1, y - 2, 3, 5, SV[1]); X.rect(c, x - 1, y - 1, 3, 3, SV[0]); X.px(c, x, y, '#ffffff');
        }
        light(v.x, v.y - 6, 30, '#d400ff', 0.3);
      }
      const conj = seg(this.st - this.sConjT0[i], 0, 0.3);
      if (s.wand[i]) this.wand(v, t, g, o, P, conj, light);
      if (s.weapon[i]) this.weapon(w, i, v, t, g, o, P, conj, light);
      if (s.guard[i]) this.guard(w, i, v, t, g, o, P, conj, light);
      if (s.linkTo[i] >= 0) this.link(i, v, bodies[s.linkTo[i]], t, o, light);
      // Phase (Prism pane): a hex afterimage round you while you drift through bodies
      if (s.guard[i] === GUARD.prism && s.retreatT[i] > 0) {
        const k = s.retreatT[i] / T(ARMS.phaseTime), cy = v.y - 12;
        for (let q = 0; q < 2; q++) { const r = 9 + q * 4 + (1 - k) * 4, pts: Pt[] = []; for (let j = 0; j <= 6; j++) { const a = (j / 6) * TAU + Math.PI / 6 + t; pts.push([v.x + Math.cos(a) * r, cy + Math.sin(a) * r * 0.8]); } X.lines(o, pts, q ? EL.arcane[3] : EL.arcane[1]); }
        light(v.x, v.y, 30, '#ff4f9b', 0.4 * k);
      }
    }
    // Doubles: a translucent violet copy (the sprite is tinted and faded) with a violet edge and a seal
    for (let i = MAX_SEATS; i < MAX_BODIES; i++) {
      if (b.kind[i] !== KIND.double) continue;
      const v = bodies[i]; if (!v?.on || !v.a) continue;
      const born = smooth(seg(this.st - this.bornT[i], 0.1, 0.6));
      S.seal(g, v.x, v.y, 9, t, born);
      this.sil.halo(o, v, t, SV[1], { ring: 1, level: Math.round(8 + 8 * born * (0.75 + 0.25 * Math.sin(t * 6))), band: false });
      for (let q = 0; q < 4; q++) { const a = t * 3 + q * 1.57, sn2 = Math.sin(a); X.px(sn2 < 0 ? g : o, v.x + Math.cos(a) * 9, v.y + v.a.head[1] + 4 + sn2 * 4, SV[q % 2 ? 1 : 2]); }
      if (Math.floor(t * 8 + i) % 5 === 0) X.px(o, v.x + (rand(i, Math.floor(t * 8)) - 0.5) * 10, v.y - rand(i, Math.floor(t * 8), 2) * 20, SV[0]);
      light(v.x, v.y - 8, 30, '#d400ff', 0.4 * born);
    }
  }

  private ward(w: World, i: number, v: BodyView, t: number, g: Ctx, o: Ctx, P: (f: number, r: number, u: number) => [number, number, number], ch: Pt, light: LightFn): void {
    const s = w.seats, kind = s.ward[i], up = easeOut(seg(this.st - this.sWardT0[i], 0, 0.25));
    const life = has(s.wardEls, i, ELID.life), coat = lead(s.wardEls, i, ELID.shield, ELID.earth), hit = 0;
    // forming: sparks gather onto the body from all round
    const fe = (this.st - this.sWardT0[i]) / 0.3;
    if (fe > 0 && fe < 1) for (let q = 0; q < 14; q++) { const a = (q / 14) * TAU, r = 16 * (1 - fe); X.px(o, ch[0] + Math.cos(a) * r, ch[1] - 2 + Math.sin(a) * r * 1.2, q % 2 ? EL.shield[0] : life ? LIFE[2] : EL.shield[1]); }
    void hit;
    if (kind === WARD.stone) { this.armour(w, i, v, t, g, o, P, coat, up, light); return; }
    if (kind === WARD.mirror) {
      // the mirror ward: a sheen sweeping over the body and a thin silver edge
      const k = clamp(s.wardHp[i] / STRUCT.mirrorShots, 0.3, 1) * up;
      this.sil.sheen(o, v, t, ['#ffffff', '#c8e4ff'], Math.round(5 + 6 * k));
      this.sil.halo(o, v, t, '#dfe8ff', { ring: 1, level: Math.round(6 + 8 * k), band: false });
      if (Math.floor(t * 3) % 4 === 0) { const p: Pt = [ch[0] - 3, ch[1] - 6]; X.px(o, p[0], p[1], '#ffffff'); X.px(o, p[0] - 1, p[1], '#c8e4ff'); X.px(o, p[0] + 1, p[1], '#c8e4ff'); X.px(o, p[0], p[1] - 1, '#c8e4ff'); X.px(o, p[0], p[1] + 1, '#c8e4ff'); }
      light(v.x, v.y - 8, 28, '#e0f0ff', 0.3 * k);
      return;
    }
    const k = clamp(s.wardHp[i] / STRUCT.wardHp, 0.35, 1) * up;
    if (life) {
      // the Mending ward: a green skin with gold light, slow motes drawn into the body, rising pluses
      this.sil.halo(o, v, t, '#4ec45a', { col2: '#9af07a', hi: '#ffe68a', level: Math.round(6 + 10 * k * 0.85) });
      for (const p of emit(t, 8, 0.9, (q, age) => { const a = rand(q, 4, i) * TAU, r = 10 * (1 - age); return { x: ch[0] + Math.cos(a) * r, y: ch[1] - 2 + Math.sin(a) * r * 1.1, age, q }; })) X.px(o, p.x, p.y, p.age > 0.7 ? '#ffffff' : p.q % 3 ? LIFE[2] : X.WARM[2]);
      K.sparkle(o, v.x, v.y - 12, t, 0.6 * k, 10, i, LIFE, 8);
      light(v.x, v.y - 8, 36, '#8ef07e', 0.45 * k);
      return;
    }
    // the ward: a shimmering golden skin hugging the silhouette (an elemental ward takes its element's colour)
    const R: Ramp = coat ? (elName(coat) === 'cold' ? X.FROST : ramp(coat)) : EL.shield;
    this.sil.halo(o, v, t, R[2], { col2: R[1], hi: R[0], level: Math.round(6 + 10 * k) });
    light(v.x, v.y - 8, 30, coat ? R[2] : '#ffc83a', 0.4 * k);
  }

  /** Stone armour: four big plates sitting flush on the body (two pauldrons, a breastplate, a belt). */
  private armour(w: World, i: number, v: BodyView, t: number, g: Ctx, o: Ctx, P: (f: number, r: number, u: number) => [number, number, number], coat: number, up: number, light: LightFn): void {
    const STN = ['#b8ae9e', '#7e7468', '#5a524a', '#3e3833', '#1e1a16'];
    const plates = [[0.4, -4.6, 11.4, 4.2, 2.8, 0], [2.6, 0, 8.4, 4.4, 4.0, 1], [2.0, 0, 4.0, 5.2, 2.4, 2], [0.4, 4.6, 11.4, 4.2, 2.8, 0]]
      .map((p, q) => { let d = P(p[0], p[1], p[2]); if (p[5] && d[2] < 0) d = P(-p[0], p[1], p[2]); /* seen from behind: a backplate */ return { x: d[0], y: d[1], depth: d[2], hw: p[3], hh: p[4], kind: p[5], q }; })
      .sort((a, b) => a.depth - b.depth);
    const el = coat ? elName(coat) : '';
    for (const p of plates) {
      const c = p.depth < -1.5 ? g : o; // the far side hides behind the body
      const k = easeOut(seg(this.st - this.sWardT0[i], p.q * 0.06, p.q * 0.06 + 0.25)), x = p.x, y = p.y + (1 - k) * 8;
      if (k < 0.05) continue;
      const pts: Pt[] = [];
      for (let q = 0; q < 8; q++) { const a = (q / 8) * TAU, j = 0.92 + rand(p.q, q, 48) * 0.14; pts.push([x + Math.cos(a) * p.hw * j, y + Math.sin(a) * p.hh * j]); }
      X.poly(c, pts.map(([a, b]) => [a + (a - x) * 0.3 + 0.4, b + (b - y) * 0.3 + 0.6] as Pt), '#140e0a');
      X.poly(c, pts, STN[2]);
      X.poly(c, pts.map(([a, b]) => [lerp(x - p.hw * 0.25, a, 0.6), lerp(y - p.hh * 0.3, b, 0.6)] as Pt), STN[1]);
      X.px(c, x - p.hw * 0.5, y - p.hh * 0.55, STN[0]);
      X.line(c, x - p.hw * 0.6, y + p.hh * 0.7, x + p.hw * 0.7, y + p.hh * 0.6, STN[3]);
      if (p.kind === 0) X.line(c, x - p.hw * 0.8, y + p.hh * 0.1, x + p.hw * 0.8, y + p.hh * 0.1, STN[3]);
      // the coat: fire glows in a seam, frost rimes the top, lightning sparks, water glistens, life greens
      if (el === 'fire') { const gl = 0.75 + 0.25 * Math.sin(t * 9 + p.q * 2); X.lines(c, [[x - p.hw * 0.45, y + p.hh * 0.05], [x, y + p.hh * 0.3], [x + p.hw * 0.4, y + p.hh * 0.05]], gl > 0.8 ? EL.fire[2] : EL.fire[3]); X.px(c, x, y + p.hh * 0.3, EL.fire[1]); if (p.kind === 0 && c === o) K.tongue(o, x, y - p.hh * 0.7, 1.1, 1.5 + 1.5 * (0.5 + 0.5 * Math.sin(t * 13 + p.q * 2)), Math.sin(t * 7 + p.q)); }
      else if (el === 'cold') { X.line(c, x - p.hw * 0.7, y - p.hh * 0.75, x + p.hw * 0.5, y - p.hh * 0.85, '#e0ffff'); X.px(c, x - p.hw * 0.2, y - p.hh * 0.9, '#ffffff'); }
      else if (el === 'lightning') { if (Math.floor(t * 20 + p.q) % 4 === 0) X.lines(c, K.bolt([x - p.hw * 0.6, y], [x + p.hw * 0.6, y - 1], Math.floor(t * 20) + p.q, 0.6, 2), EL.lightning[1]); }
      else if (el === 'water') { X.px(c, x - p.hw * 0.4, y - p.hh * 0.4, '#8ad0ff'); }
      else if (el === 'life') { X.px(c, x + p.hw * 0.3, y - p.hh * 0.2, LIFE[2]); X.px(c, x - p.hw * 0.3, y + p.hh * 0.3, LIFE[3]); }
      else if (el === 'arcane') { X.px(c, x, y, EL.arcane[1]); }
    }
    if (el === 'fire') { light(v.x, v.y - 12, 30, '#ff7020', 0.3); for (const p of emit(t, 3, 0.8, (q, age) => ({ x: v.x + (rand(q, 7, i) - 0.5) * 14 + Math.sin(age * 6 + q) * 2, y: v.y - 8 - rand(q, 8, i) * 8 - age * 18, age }))) X.px(o, p.x, p.y, p.age < 0.4 ? EL.fire[1] : EL.fire[3]); }
    if (up < 1) for (let q = 0; q < 4; q++) X.px(o, v.x + (rand(q, i) - 0.5) * 10, v.y - 2 - up * 6, '#9a8e80');
  }

  private aura(w: World, i: number, v: BodyView, t: number, g: Ctx, o: Ctx, P: (f: number, r: number, u: number) => [number, number, number], light: LightFn): void {
    const s = w.seats, b = w.bodies, els = s.auraEls;
    const k = Math.min(seg(this.st - this.sAuraT0[i], 0, 0.3), seg(s.aura[i], 0, 30));
    if (k < 0.05 || !v.a) return;
    const ch: Pt = [v.x + v.a.chest[0], v.y + v.a.chest[1]], hd: Pt = [v.x + v.a.head[0], v.y + v.a.head[1]];
    const sp = Math.hypot(b.vx[i], b.vy[i]), mvx = sp > 0.3 ? b.vx[i] / sp : 0, mvy = sp > 0.3 ? b.vy[i] / sp : 0;
    const AR = STRUCT.auraRadius * PPU;
    let any = false;
    for (let id = 1; id <= N_EL; id++) {
      if (!els[i * N_EL + id - 1] || id === ELID.sigil) continue;
      any = true;
      const el = elName(id);
      if (el === 'fire') {
        // exuding fire: a flickering hot outline, flames peeling off hat, shoulders and hem, embers streaming out
        this.sil.halo(o, v, t, Math.floor(t * 10) % 3 ? EL.fire[3] : EL.fire[2], { ring: 1, level: Math.round(10 + 6 * k), band: false });
        for (let q = 0; q < 26; q++) { const ang = (q / 26) * TAU, r = 11 + Math.sin(t * 7 + q * 1.7) * 1.5; if ((q + Math.floor(t * 12)) % 3 || rand(q, 3) > k) continue; X.px(o, ch[0] + Math.cos(ang) * r * 0.8, ch[1] - 2 + Math.sin(ang) * r, '#ffcf90'); }
        const spots: Pt[] = [[hd[0] - 3, hd[1] - 2], [hd[0] + 3, hd[1] - 1], [ch[0] - 5, ch[1] - 2], [ch[0] + 5, ch[1] - 1], [ch[0] - 5, ch[1] + 6], [ch[0] + 6, ch[1] + 6], [hd[0], hd[1] - 7]];
        spots.forEach(([x, y], j) => { const out = x < ch[0] ? -1 : x > ch[0] ? 1 : 0; K.tongue(o, x, y, 1.6, (4 + 3 * (0.5 + 0.5 * Math.sin(t * 12 + j * 2.3))) * k, out * 4 + Math.sin(t * 8 + j)); });
        for (const p of emit(t, 40, 0.9, (q, age) => { const ang = rand(q, 3, i) * TAU, d = 4 + easeOut(age) * (22 + rand(q, 4, i) * 14), z = 4 + rand(q, 5, i) * 14 + age * 6; return { x: v.x + Math.cos(ang) * d, y: v.y + Math.sin(ang) * d * FY - z, age, q }; })) if (rand(p.q, 6) < k) X.px(o, p.x, p.y, p.age < 0.3 ? EL.fire[1] : p.age < 0.65 ? EL.fire[2] : EL.fire[4]);
        S.seal(g, v.x, v.y, 12, t, 0.35 * k);
        light(v.x, v.y - 6, 64, '#ff7020', 0.7 * k + 0.06 * Math.sin(t * 9)); light(v.x, v.y, 30, '#ffc070', 0.5 * k);
      } else if (el === 'cold') {
        // frost: a clean ellipse of rime at the aura's reach, crystals on the ground, snow orbiting
        const rr = AR * k;
        X.ring(g, v.x, v.y, rr, rr * FY, '#bfeaf8', 0.8); X.ring(g, v.x, v.y, rr - 1, (rr - 1) * FY, '#ffffff', 0.35);
        for (let ring = 1; ring <= 4; ring++) { const r = (rr * ring) / 4.4, n = 6 + ring * 6; for (let q = 0; q < n; q++) { const a = (q / n) * TAU + ring * 0.7 + (rand(q, ring, 5) - 0.5) * 0.25; X.px(g, v.x + Math.cos(a) * r, v.y + Math.sin(a) * r * FY, (q + ring + Math.floor(t * 2)) % 7 === 0 ? '#ffffff' : '#c4eefa'); } }
        S.seal(g, v.x, v.y, 17, t, 0.6 * k);
        S.auraMotes(g, o, v.x, v.y, t, EL.cold, AR, k, 16, 0.6, 5, false);
        light(v.x, v.y - 4, 56, '#9ff4ff', 0.5 * k);
      } else if (el === 'water') {
        // mist: soft drifting banks of blue-grey vapour round the wearer
        S.seal(g, v.x, v.y, 15, t, 0.6 * k);
        for (let q = 0; q < 16; q++) {
          const a = rand(q, 11, i) * TAU + t * 0.25, r = 10 + rand(q, 12, i) * (AR - 10), x = v.x + Math.cos(a) * r, y = v.y + Math.sin(a) * r * FY * 0.8 - 3 - rand(q, 13, i) * 8;
          X.ellipse(Math.sin(a) < 0 ? g : o, x, y, 6 + rand(q, 14, i) * 4, 3.5 + rand(q, 14, i) * 2, `rgba(${q % 2 ? '150,200,240' : '190,215,235'},${(0.2 * k).toFixed(2)})`);
        }
        light(v.x, v.y - 4, 50, '#3a98ff', 0.35 * k);
      } else if (el === 'life') {
        S.seal(g, v.x, v.y, 15, t, 0.6 * k);
        S.auraMotes(g, o, v.x, v.y, t, EL.life, 15, k, 10, 1, 9);
        K.sparkle(o, v.x, v.y - 10, t, k * 0.8, 12, i, LIFE, 10);
        light(v.x, v.y - 4, 50, '#5fe07a', 0.5 * k);
      } else if (el === 'lightning') {
        // haste: speed streaks and a violet afterimage behind while moving, sparks at the feet
        if (sp > 0.3) {
          const lx = -mvx * 6, ly = -mvy * 6 * FY;
          this.sil.halo(o, v, t, EL.lightning[2], { lag: [Math.round(lx) + 4 - 4, Math.round(ly)], level: 5, band: false });
          for (const p of emit(t, 40, 0.35, (q, age) => ({ x: v.x - mvx * (3 + age * 22) + (rand(q, 8, i) - 0.5) * 4, y: v.y - mvy * (3 + age * 22) * FY - 2 - rand(q, 7, i) * 18, age }))) X.px(o, p.x, p.y, p.age < 0.4 ? EL.lightning[0] : EL.lightning[2]);
          for (let q = 0; q < 5; q++) { const z = 4 + q * 3.5, d = 7 + rand(q, Math.floor(t * 12), i) * 10, L = 5 + rand(q, 3, i) * 6; X.line(o, v.x - mvx * d, v.y - mvy * d * FY - z, v.x - mvx * (d + L), v.y - mvy * (d + L) * FY - z, q % 2 ? EL.lightning[1] : EL.lightning[2]); }
        }
        if (Math.floor(t * 20) % 2) X.lines(o, K.bolt([v.x - 4, v.y], [v.x + 5, v.y - 2], Math.floor(t * 20) + i, 0.6, 2), EL.lightning[1]);
        S.auraMotes(g, o, v.x, v.y, t, EL.lightning, 9, k, 6, 4, 14, false);
        light(v.x, v.y - 6, 40, '#c4a4ff', 0.45 * k);
      } else if (el === 'arcane') {
        // the glass cannon: pink cracks flickering over the body, a glassy pink edge
        this.sil.halo(o, v, t, EL.arcane[1], { ring: 1, level: Math.round(5 + 5 * k), band: false });
        for (let q = 0; q < 3; q++) if (Math.floor(t * 6 + q) % 3) X.lines(o, [[ch[0] - 4 + q * 4, ch[1] - 8], [ch[0] - 3 + q * 4, ch[1] - 4], [ch[0] - 5 + q * 4, ch[1]], [ch[0] - 4 + q * 4, ch[1] + 3]], q === 1 ? '#ffffff' : EL.arcane[1]);
        S.auraMotes(g, o, v.x, v.y, t, EL.arcane, 11, k, 8, 1.6, 10);
        light(v.x, v.y - 6, 36, '#ff4f9b', 0.45 * k);
      } else if (el === 'earth') {
        // bulldoze: a plough of rocks riding ahead of the wearer, dust when moving
        for (let q = -2; q <= 2; q++) { const p = P(11 - Math.abs(q) * 1.5, q * 3, 0); const c = p[2] < -1 ? g : o; K.rock(c, p[0], p[1] - 3 - Math.abs(Math.sin(t * 9 + q)), 2.2, 40 + q); }
        if (sp > 0.3) K.dust(o, v.x - mvx * 4, v.y, mod(t, 0.5), Math.floor(t * 2) + i, 4, 8, '#8a7a68', 0.5);
        S.seal(g, v.x, v.y, 13, t, 0.5 * k);
        light(v.x, v.y - 4, 40, '#d8b88a', 0.4 * k);
      } else if (el === 'shield') {
        S.auraMotes(g, o, v.x, v.y, t, EL.shield, 13, k, 8, 1.2, 8);
      }
    }
    if (!any) S.auraMotes(g, o, v.x, v.y, t, SV, 13, k, 8, 1.2, 8);
  }

  private wand(v: BodyView, t: number, g: Ctx, o: Ctx, P: (f: number, r: number, u: number) => [number, number, number], up: number, light: LightFn): void {
    if (!v.a) return;
    const h: Pt = [v.x + v.a.hands[0][0], v.y + v.a.hands[0][1]], side = P(1, -4, 8)[2], c = side < -3.5 ? g : o;
    const L2 = 10 * Math.min(1, up * 1.5 + 0.05), a = -1.15 + Math.sin(t * 2) * 0.08, tp: Pt = [h[0] + Math.cos(a) * L2 * 0.5, h[1] + Math.sin(a) * L2];
    X.line(c, h[0], h[1], tp[0], tp[1], '#1a0e24', 3); X.line(c, h[0], h[1], tp[0], tp[1], SV[2], 1);
    X.line(c, h[0], h[1], lerp(h[0], tp[0], 0.5), lerp(h[1], tp[1], 0.5), SV[3], 1);
    X.glow(c, tp[0], tp[1], 6, SV[2], 0.8);
    X.rect(c, tp[0] - 1, tp[1] - 1, 3, 3, SV[0]); X.px(c, tp[0], tp[1] - 2, '#ffffff'); X.px(c, tp[0], tp[1] + 2, '#ffffff'); X.px(c, tp[0] - 2, tp[1], '#ffffff'); X.px(c, tp[0] + 2, tp[1], '#ffffff');
    for (let k = 0; k < 3; k++) { const b = t * 5 + k * 2.1; X.px(c, tp[0] + Math.cos(b) * 5, tp[1] + Math.sin(b) * 4, SV[1]); }
    if (up < 1) X.ring(o, tp[0], tp[1], 2 + up * 10, 2 + up * 8, SV[1], 1 - up);
    light(tp[0], v.y, 24, '#d400ff', 0.5);
  }

  /** Conjured weapons, distinct per element: stone maul, arcane hook, flame sword, frost spear, lightning whip, tide glaive, healing hands. */
  private weapon(w: World, i: number, v: BodyView, t: number, g: Ctx, o: Ctx, P: (f: number, r: number, u: number) => [number, number, number], up: number, light: LightFn): void {
    if (!v.a) return;
    const el = elName(w.seats.weapon[i]), side = P(1, -4, 8)[2], c = side < -3.5 ? g : o;
    const h: Pt = [v.x + v.a.hands[0][0], v.y + v.a.hands[0][1]];
    const fwd = Math.sign(P(1, 0, 0)[0] - v.x) || 1;
    // held up and a little forward
    const dir = (L: number, lean = 0.45): Pt => [h[0] + fwd * L * lean, h[1] - L * Math.sqrt(1 - lean * lean)];
    const k = Math.min(1, up * 1.4 + 0.1);
    if (el === 'life') {
      for (const hh of v.a.hands) {
        const p: Pt = [v.x + hh[0], v.y + hh[1]];
        X.glow(o, p[0], p[1], 6 + Math.sin(t * 6) * 0.8, LIFE[3], 0.85 * k);
        X.rect(o, p[0] - 1, p[1] - 1, 3, 3, LIFE[2]); X.px(o, p[0], p[1] - 1, LIFE[0]); X.px(o, p[0] - 1, p[1] + 1, SV[1]); X.px(o, p[0] + 1, p[1] + 1, SV[2]);
        for (const q of emit(t, 6, 0.6, (j, age) => ({ x: p[0] + (rand(j, 3, i) - 0.5) * 4, y: p[1] - age * 7, age }))) X.px(o, q.x, q.y, q.age < 0.5 ? LIFE[1] : LIFE[3]);
      }
      light(v.x, v.y - 8, 28, '#8ef07e', 0.5 * k);
      return;
    }
    if (el === 'earth') {
      const tp = dir(11 * k, 0.35);
      X.line(c, h[0], h[1] + 2, tp[0], tp[1], '#1a120c', 3); X.line(c, h[0], h[1] + 2, tp[0], tp[1], '#8a6a48', 1);
      X.rect(c, tp[0] - 4, tp[1] - 3, 8, 6, '#1a120c'); X.rect(c, tp[0] - 3, tp[1] - 2, 6, 4, X.EARTH[2]); X.rect(c, tp[0] - 3, tp[1] - 2, 6, 1, X.EARTH[0]); X.rect(c, tp[0] - 3, tp[1] + 1, 6, 1, X.EARTH[4]);
      X.px(c, tp[0] + 1, tp[1], X.EARTH[3]);
    } else if (el === 'arcane') {
      // the Arcane wand: a short dark rod with a violet orb at its tip; Siphon makes the orb swell and motes circle it
      const tp = dir(10 * k, 0.55), sip = w.seats.specT[i] > 0, r = (sip ? 2.8 + Math.sin(t * 12) * 0.5 : 2.2) * k + 0.5;
      X.line(c, h[0], h[1] + 2, tp[0], tp[1], '#120e1a', 3); X.line(c, h[0], h[1] + 2, tp[0], tp[1], '#5a3a6a', 1);
      X.glow(o, tp[0], tp[1], sip ? 10 : 6, EL.arcane[2], 0.6);
      X.ellipse(c, tp[0], tp[1], r + 1, r + 1, '#120e1a');
      X.ellipse(c, tp[0], tp[1], r, r, EL.arcane[3]); X.ellipse(c, tp[0] - 0.4, tp[1] - 0.4, r * 0.66, r * 0.66, EL.arcane[2]);
      X.px(c, tp[0] - 1, tp[1] - 1, '#ffffff');
      if (sip) for (let q = 0; q < 5; q++) { const a = t * 5 + (q / 5) * TAU, rr = 9 - mod(t * 3 + q * 0.2, 1) * 7; X.px(Math.sin(a) < 0 ? g : o, tp[0] + Math.cos(a) * rr, tp[1] + Math.sin(a) * rr * 0.5, q % 2 ? EL.arcane[1] : '#ffffff'); }
      light(tp[0], v.y, 26, '#ff4f9b', sip ? 0.7 : 0.4);
    } else if (el === 'fire') {
      const tp = dir(14 * k, 0.4);
      X.line(c, h[0] - fwd * 3, h[1] + 1, h[0] + fwd * 3, h[1] - 1, '#3a2a1a', 2); X.px(c, h[0], h[1] + 2, '#3a2a1a');
      // a blade of flame: a hot body with tongues licking up along it, a white core
      X.glow(c, lerp(h[0], tp[0], 0.6), lerp(h[1], tp[1], 0.6), 7, EL.fire[2], 0.6);
      X.line(c, h[0], h[1] - 1, tp[0], tp[1], EL.fire[4], 3); X.line(c, h[0], h[1] - 1, tp[0], tp[1], EL.fire[2], 2);
      for (let q = 0; q < 7; q++) { const f = q / 7, x = lerp(h[0], tp[0], f), y = lerp(h[1], tp[1], f); K.tongue(c, x, y + 2, 1.9 * (1 - f * 0.5), 4 + 2.5 * Math.sin(t * 14 + q * 1.7), Math.sin(t * 9 + q) * 0.8); }
      X.line(c, h[0], h[1] - 1, tp[0], tp[1], EL.fire[0], 1); X.px(c, tp[0], tp[1], '#ffffff');
      for (const p of emit(t, 10, 0.5, (q, age) => ({ x: lerp(h[0], tp[0], rand(q, 2, i)) + Math.sin(age * 7 + q), y: lerp(h[1], tp[1], rand(q, 2, i)) - age * 9, age }))) X.px(o, p.x, p.y, K.fireCol(0.3 + p.age * 0.7));
      light(tp[0], v.y, 30, '#ff7020', 0.5);
    } else if (el === 'cold') {
      const tp = dir(15 * k, 0.25);
      X.line(c, h[0], h[1] + 4, tp[0], tp[1], '#163e7a', 3); X.line(c, h[0], h[1] + 4, tp[0], tp[1], '#c4eefa', 1);
      K.shard(c, tp[0], tp[1] - 2, -Math.PI / 2 + fwd * 0.25, 6, i * 3 + 1, 1);
      if (Math.floor(t * 4 + i) % 5 === 0) X.px(c, tp[0] - 1, tp[1] - 5, '#ffffff');
      light(tp[0], v.y, 24, '#9ff4ff', 0.35);
    } else if (el === 'lightning') {
      // the whip: a crackling lash hanging from the hand and swaying
      const pts: Pt[] = [];
      for (let q = 0; q <= 8; q++) { const f = q / 8; pts.push([h[0] + fwd * f * 10 * k + Math.sin(t * 6 + f * 4) * f * 2, h[1] + f * f * 9 - f * 3 + Math.cos(t * 5 + f * 3) * f]); }
      X.line(c, h[0], h[1], h[0] - fwd, h[1] + 2, '#3a2a4a', 2);
      if (Math.floor(t * 20) % 3 !== 2) { X.lines(c, pts, EL.lightning[3], 2); X.lines(c, pts, EL.lightning[1], 1); } else X.lines(c, pts, EL.lightning[2], 1);
      const e = pts[pts.length - 1]; X.px(c, e[0], e[1], '#ffffff');
      light(h[0], v.y, 28, '#b08aff', 0.45);
    } else if (el === 'water') {
      // the tide trident: a long shaft, a crossbar and three barbed prongs, water running off them
      const tp = dir(16 * k, 0.28), L = Math.hypot(tp[0] - h[0], tp[1] - h[1]) || 1, fx = (tp[0] - h[0]) / L, fy = (tp[1] - h[1]) / L, nx = -fy, ny = fx;
      X.line(c, h[0], h[1] + 3, tp[0], tp[1], '#1a2a3a', 3); X.line(c, h[0], h[1] + 3, tp[0], tp[1], '#6a8aa8', 1);
      X.line(c, tp[0] - nx * 3.5, tp[1] - ny * 3.5, tp[0] + nx * 3.5, tp[1] + ny * 3.5, '#163a7a', 2);
      X.line(c, tp[0] - nx * 3, tp[1] - ny * 3, tp[0] + nx * 3, tp[1] + ny * 3, EL.water[2], 1);
      for (const sd of [-3, 0, 3]) {
        const b0: Pt = [tp[0] + nx * sd, tp[1] + ny * sd], L2 = sd ? 4 : 5.5, tip: Pt = [b0[0] + fx * L2, b0[1] + fy * L2];
        X.line(c, b0[0], b0[1], tip[0], tip[1], EL.water[1], 1); X.px(c, tip[0], tip[1], '#ffffff');
        if (sd) X.px(c, tip[0] - fx * 1.5 - nx * Math.sign(sd), tip[1] - fy * 1.5 - ny * Math.sign(sd), EL.water[1]); // the barb
      }
      for (const p of emit(t, 6, 0.5, (q, age) => ({ x: tp[0] + (rand(q, 4, i) - 0.5) * 7, y: tp[1] + 2 + age * age * 14, age }))) X.px(o, p.x, p.y, '#8ad0ff');
      light(tp[0], v.y, 24, '#3a98ff', 0.35);
    } else {
      const R = ramp(w.seats.weapon[i]), tp = dir(11 * k);
      X.line(c, h[0], h[1], tp[0], tp[1], '#140e0a', 3); X.line(c, h[0], h[1], tp[0], tp[1], R[1], 1); X.glow(c, tp[0], tp[1], 4, R[2], 0.7);
    }
    if (up < 1) X.ring(o, h[0], h[1] - 4, 2 + up * 10, 2 + up * 8, SV[1], 1 - up);
  }

  /**
   * The eight guards (docs/explorations/2026-11-05-guards.md), each its own silhouette: held in front
   * while blocking, slung at the side otherwise. The Bulwark planted in the ground is the Brace tell.
   */
  private guard(w: World, i: number, v: BodyView, t: number, g: Ctx, o: Ctx, P: (f: number, r: number, u: number) => [number, number, number], up: number, light: LightFn): void {
    const s = w.seats, id = s.guard[i], name = GUARD_NAME[id] ?? 'mirror', blocking = s.guardT[i] > 0, raise = blocking ? easeOut(Math.min(1, s.guardT[i] / 6)) : 0;
    const bulwark = id === GUARD.bulwark, braced = bulwark && s.retreatT[i] > 0;
    const hpk = clamp(s.guardHp[i] / (((ARMS.hp as Record<string, number>)[name] || 70) * guardSize(w, i)), 0, 1);
    const at = braced ? P(5, 0, 5) : P(lerp(1, 6, raise), lerp(-5, 0, raise), lerp(6, 9, raise)), c = at[2] < -1.5 ? g : o;
    const face = (Math.round(w.bodies.face[i] * 16) / 16) * TAU, sn = Math.abs(Math.sin(face)), csn = Math.cos(face);
    const x = at[0], y = at[1], R = GUARD_RAMP[name] ?? EL.shield;
    if (bulwark) {
      const hw = 2.5 + (blocking || braced ? 3 : 2) * sn, hh = blocking || braced ? 8 : 6, th = Math.round(Math.abs(csn) * 2);
      if (th) X.rect(c, x - hw - (csn > 0 ? th : -hw * 2) - 1, y - hh, th + 1, hh * 2, X.EARTH[4]);
      X.rect(c, x - hw - 1, y - hh - 1, hw * 2 + 2, hh * 2 + 2, '#1a120c');
      X.rect(c, x - hw, y - hh, hw * 2, hh * 2, X.EARTH[2]);
      X.rect(c, x - hw, y - hh, hw * 2, 1, X.EARTH[0]); X.rect(c, x - hw, y - hh, 1, hh * 2, X.EARTH[1]);
      X.rect(c, x - hw, y + hh - 1, hw * 2, 1, X.EARTH[4]);
      if (hw > 2.5) { X.rect(c, x - 1, y - hh + 2, 2, hh * 2 - 4, EL.shield[2]); X.rect(c, x - hw + 1, y - 1, hw * 2 - 2, 1, EL.shield[3]); }
      if (hpk < 0.5) X.lines(c, [[x - hw + 1, y - hh + 2], [x, y], [x - 1, y + hh - 2]], '#1a120c');
      if (braced) { K.dust(g, x, y + hh, 0.2 + (t % 0.6), i, 6, 12, '#8a7a68', 0.6); K.cracks(g, x, y + hh + 1, 7, i * 5 + 1, 1); }
    } else guardShape(c, name, x, y, 0.8 + 0.4 * raise, t, sn, hpk);
    // On the far side of the body (facing away, or slung on the hidden hip) the guard is drawn under the
    // wizard as it should be, and its rim shows through on top, dithered: a partner can always see
    // that you carry a guard and which one (the rim is in its colour, the Bulwark's square).
    const away = c === g;
    if (away) {
      const k = blocking ? 0.75 : 0.5, sz = 0.8 + 0.4 * raise, wx = 0.55 + 0.45 * sn;
      if (bulwark) {
        const hw = 2.5 + (blocking || braced ? 3 : 2) * sn, hh = blocking || braced ? 8 : 6;
        for (let q = -hw; q <= hw; q++) for (const yy of [y - hh - 1, y + hh]) if (k > X.bay(Math.round(x + q), Math.round(yy))) X.px(o, x + q, yy, X.EARTH[0]);
        for (let q = -hh; q <= hh; q++) for (const xx of [x - hw - 1, x + hw]) if (k > X.bay(Math.round(xx), Math.round(y + q))) X.px(o, xx, y + q, X.EARTH[0]);
      } else X.ring(o, x, y, 4.6 * sz * wx + 0.5, 5 * sz + 0.5, R[1], k);
    }
    if (blocking) {
      // an energy face in front of the guard while it blocks, in the guard's colour; the Bulwark's is wide, the Mirror's narrow.
      // Facing away it would hide behind the body, so there it is drawn on top and wider, its two ends bright ticks
      // either side of the wizard: the block reads from behind as a glow wrapping round you.
      const front = P(9, 0, 9), pulse = 0.6 + 0.3 * Math.sin(t * 12), behind = front[2] < -1;
      const wide0 = bulwark ? 1.6 : id === GUARD.mirror ? 0.9 : 1.2, wide = behind ? Math.max(2.3, wide0 * 1.6) : wide0;
      const arcPts: Pt[] = []; for (let q = -4; q <= 4; q++) { const p = P(9 - Math.abs(q) * 0.4, q * wide, 9 + (4 - Math.abs(q)) * 0.6); arcPts.push([p[0], p[1]]); }
      for (const p of arcPts) X.px(o, p[0], p[1], pulse > 0.75 ? R[0] : R[1]);
      if (behind) for (const p of [arcPts[0], arcPts[8]]) { X.rect(o, p[0] - 0.5, p[1] - 3, 1, 5, R[0]); X.px(o, p[0], p[1] - 4, '#ffffff'); }
      if (raise < 1) X.ring(o, x, y, 3 + raise * 8, 4 + raise * 8, R[1], 1 - raise);
      light(x, y + 8, 26, R[2], 0.4 * pulse);
    }
    // What the guard carries besides its lead: a dotted rim in that colour, so a partner can read the coat.
    const coat = guardCoatLook(w, i);
    if (coat) { const Rc = ramp(coat); for (let q = 0; q < 12; q++) { const a = (q / 12) * TAU + t * 0.6; X.px(o, x + Math.cos(a) * 6.5, y + Math.sin(a) * 7, q % 2 ? Rc[1] : Rc[0]); } }
    // The Prism's stored charge: a violet glow that swells as it fills, ready to Lance.
    const ch = id === GUARD.prism ? s.guardCharge[i] / ARMS.chargeMax : 0;
    if (ch > 0) { X.glow(o, x, y, 3 + 7 * ch, EL.arcane[1], 0.35 + 0.5 * ch); light(x, y, 20 + 30 * ch, EL.arcane[2], 0.5 * ch); }
    if (up < 1) X.ring(o, x, y, 2 + up * 10, 2 + up * 8, SV[1], 1 - up);
  }

  /** The Healing link: a green channel from your hands to the ally it holds, sparkles running along it. */
  private link(i: number, v: BodyView, to: BodyView | undefined, t: number, o: Ctx, light: LightFn): void {
    if (!v.a || !to?.on || !to.a) return;
    const a: Pt = [v.x + (v.a.hands[0][0] + v.a.hands[1][0]) / 2, v.y + (v.a.hands[0][1] + v.a.hands[1][1]) / 2], z: Pt = [to.x + to.a.chest[0], to.y + to.a.chest[1]];
    const L = Math.hypot(z[0] - a[0], z[1] - a[1]) || 1, nx = -(z[1] - a[1]) / L, ny = (z[0] - a[0]) / L, n = Math.max(8, Math.round(L / 3));
    const pts: Pt[] = [];
    for (let q = 0; q <= n; q++) { const f = q / n, wv = Math.sin(f * 9 - t * 8) * 2 * Math.sin(f * Math.PI); pts.push([lerp(a[0], z[0], f) + nx * wv, lerp(a[1], z[1], f) + ny * wv]); }
    X.lines(o, pts, LIFE[4], 2); X.lines(o, pts, LIFE[2], 1);
    for (let q = 0; q < 4; q++) { const f = mod(t * 0.9 + q / 4, 1), p = pts[Math.min(n, Math.round(f * n))]; X.rect(o, p[0] - 1, p[1] - 1, 2, 2, LIFE[1]); X.px(o, p[0], p[1] - 2, '#ffffff'); }
    K.sparkle(o, z[0], z[1], t, 1, 6, i, LIFE, 10);
    light(lerp(a[0], z[0], 0.5), lerp(v.y, to.y, 0.5), 40, '#8ef07e', 0.35);
  }

  /** The Blink spark left on a Spark ring carrier's old spot: it shocks whoever steps on it. */
  private sparks(w: World, t: number, g: Ctx, o: Ctx, light: LightFn): void {
    const z = w.zones;
    for (let k = 0; k < MAX_ZONES; k++) {
      if (z.type[k] !== ZONE.spark) continue;
      const x = gx(z.x[k]), y = gy(z.y[k]), q = clamp(z.life[k] / T(ARMS.spark), 0, 1), fl = Math.floor(t * 20);
      K.scorch(g, x, y, 5, 0.5 * q + 0.1);
      K.gring(g, x, y, 5 + Math.sin(t * 9 + k) * 0.8, EL.lightning[3], 0.5 + 0.4 * q);
      for (let j = 0; j < 3; j++) { const a = rand(j, fl, k) * TAU, b = rand(j, fl, k + 3) * TAU; X.lines(o, K.bolt([x + Math.cos(a) * 4, y - 2 + Math.sin(a) * 2], [x + Math.cos(b) * 3, y - 6 - rand(j, fl, 9) * 5], fl + j, 0.5, 2), j ? EL.lightning[2] : EL.lightning[1]); }
      if (fl % 3 === 0) X.px(o, x, y - 4, '#ffffff');
      light(x, y, 26, '#b08aff', 0.4 * q);
    }
  }

  // ---- Placement preview for seat 0 ------------------------------------------------------------------
  private preview(w: World, t: number, g: Ctx, o: Ctx, bodies: BodyView[]): void {
    const s = w.seats, b = w.bodies, i = this.localSeat;
    const held = !!(s.prevButtons[i] & BTN.area);
    if (!s.active[i] || !held || !s.queueLen[i] || s.phase[i] !== PHASE.idle) return;
    const v = bodies[i]; if (!v?.on) return;
    const drag = s.dragged[i] === 1;
    let spec;
    try { spec = compile(queueOf(w, i), 'place', { drag }); } catch { return; }
    if (spec.shape === 'todo') return;
    const TEAM = X.TEAMS[i % 4], col = TEAM.light;
    const k = drag ? 1 : clamp(s.areaHeld[i] / T(RHYTHM.placeHold), 0, 1), dim = k < 1;
    const d = Math.hypot(s.aimX[i], s.aimY[i]), lim = d > SHAPES.placeRange ? SHAPES.placeRange / d : 1;
    const cxw = b.x[i] + s.aimX[i] * lim, cyw = b.y[i] + s.aimY[i] * lim, cx = gx(cxw), cy = gy(cyw);
    const look = spec.look || spec.form, R = look === ELID.life ? LIFE : ramp(look);
    const matCol = spec.wall === WALL.rock ? '#c8ab86' : spec.wall === WALL.barrier ? EL.shield[1] : R[1];
    if (spec.shape === 'arcwall') {
      const face = Math.atan2(s.aimY[i], s.aimX[i]), half = STRUCT.arcHalf * TAU, r = STRUCT.arcRadius;
      const pts: Pt[] = [];
      for (let q = 0; q <= 24; q++) { const a = face - half + (2 * half * q) / 24; pts.push([gx(b.x[i] + Math.cos(a) * r), gy(b.y[i] + Math.sin(a) * r)]); }
      this.ghostWall(g, o, pts, t, matCol, k, spec.wall === WALL.rock ? 14 : 15);
    } else if (spec.shape === 'drawnwall') {
      const pts: Pt[] = [[gx(s.holdX[i]), gy(s.holdY[i])], [cx, cy]];
      this.ghostWall(g, o, pts, t, matCol, 1, spec.wall === WALL.rock ? 14 : 15);
      S.reticle(g, cx, cy, t, col, 1);
    } else if (spec.shape === 'lineglyph') {
      const pts: Pt[] = [[gx(s.holdX[i]), gy(s.holdY[i])], [cx, cy]];
      S.dragPath(g, S.sample(pts, 2), col, t);
      S.lineGlyph(g, pts, SV, t, 1, false, R);
      S.reticle(g, cx, cy, t, col, 1);
    } else if (spec.shape === 'glyph') {
      S.glyph(g, cx, cy, STRUCT.glyphRadius * PPU, SV, t, dim ? k : 1, false, elName(spec.sub || look), R[1]);
      S.reticle(g, cx, cy, t, col, k);
    } else if (spec.shape === 'lens') {
      S.seal(g, cx, cy, 7, t, 0.6 * k);
      // the lens ghost: its rim only, dithered
      const rx = 5 * k + 1, ry = 12 * k + 1, ly = cy - 18;
      X.ring(o, cx, ly, rx + 1, ry + 1, SV[2], 0.6); X.ring(o, cx, ly, rx, ry, SV[1], 0.45);
      S.reticle(g, cx, cy, t, col, k);
    } else {
      // other Place spells: a target ring in the spell's colour at the cursor
      const r = (spec.shape === 'strike' ? 1 : spec.shape === 'spring' ? 1.6 : 1.4) * PPU;
      X.ring(g, cx, cy, r, r * FY, R[1], 0.5 + 0.4 * k);
      X.ring(g, cx, cy, r * (1.4 - 0.4 * k), r * (1.4 - 0.4 * k) * FY, R[2], 0.4);
      S.reticle(g, cx, cy, t, col, k);
    }
    // a dotted aim line from the caster, while not dragging
    if (!drag && spec.shape !== 'arcwall') for (let q = 2; q < 20; q++) if ((q + Math.floor(t * 14)) % 3 === 0) X.px(g, lerp(v.x, cx, q / 20), lerp(v.y, cy, q / 20), col);
    void CFY; void o;
  }
  /** A wall that will rise here: its line on the ground and ghost columns, in the material's colour. */
  private ghostWall(g: Ctx, o: Ctx, pts: Pt[], t: number, col: string, k: number, h: number): void {
    const P = S.sample(pts, 2);
    S.dragPath(g, P, col, t);
    for (let q = 0; q < P.length; q++) {
      const p = P[q];
      if (q % 3) continue;
      const hh = Math.round(h * k * (0.8 + 0.2 * Math.sin(t * 6 + q)));
      for (let z = 2; z < hh; z += 3) if (0.45 > X.bay(Math.round(p[0]), Math.round(p[1] - z))) X.px(o, p[0], p[1] - z, col);
      X.px(o, p[0], p[1] - hh, col);
    }
  }

  // ---- short-lived effects -------------------------------------------------------------------------
  private drawFx(w: World, f: SFx, e: number, t: number, g: Ctx, o: Ctx, bodies: BodyView[], light: LightFn): void {
    const sd = f.seed, x = gx(f.x), y = gy(f.y), R = f.look === ELID.life ? LIFE : ramp(f.look);
    switch (f.kind) {
      case 'whit': {
        K.dust(o, x, y - 2, e, sd, 5, 10, '#8a7a68', 0.7);
        K.debris(o, x, y - 9, e, sd, 6, 24, [X.EARTH[0], X.EARTH[2], X.EARTH[4]], 30);
        if (e < 0.05) X.rect(o, x - 1, y - 10, 3, 3, '#ffffff');
        return;
      }
      case 'crumble': {
        // the wall breaks: chunks tumble, dust boils up, stones lie at its foot and fade
        const x2 = gx(f.x2), y2 = gy(f.y2), n = 4;
        for (let q = 0; q < n; q++) {
          const px2 = lerp(x, x2, (q + 0.5) / n), py2 = lerp(y, y2, (q + 0.5) / n);
          K.debris(o, px2, py2 - 10, e, sd + q * 7, 5, 20, [X.EARTH[0], X.EARTH[2], X.EARTH[4]], 28);
          if (q % 2 === 0) K.dust(o, px2, py2 - 3, e, sd + q, 4, 10, '#8a7a68', 0.9);
          if (e < 0.05) X.rect(o, px2 - 1, py2 - 12, 3, 3, X.EARTH[0]);
        }
        const rub = 1 - seg(e, f.life - 0.6, f.life);
        for (let q = 0; q < 6; q++) {
          if (rand(q, 5, sd) > rub) continue;
          const kq = rand(q, 1, sd), px2 = lerp(x, x2, kq) + (rand(q, 2, sd) - 0.5) * 5, py2 = lerp(y, y2, kq) + (rand(q, 3, sd) - 0.3) * 4;
          K.rock(g, px2, py2 - 1, 1.5 + rand(q, 4, sd) * 1.4, sd + q);
        }
        return;
      }
      case 'shatter': {
        // an energy segment gives out: shards of light flying off and a flicker
        const x2 = gx(f.x2), y2 = gy(f.y2);
        for (let q = 0; q < 14; q++) {
          const kq = rand(q, 1, sd), px2 = lerp(x, x2, kq), py2 = lerp(y, y2, kq) - rand(q, 2, sd) * 14, a = rand(q, 3, sd) * TAU, d = e * (10 + rand(q, 4, sd) * 14);
          if (rand(q, 5, sd) < e / f.life) continue;
          X.px(o, px2 + Math.cos(a) * d, py2 + Math.sin(a) * d * 0.7 + e * e * 30, q % 3 ? R[1] : '#ffffff');
        }
        if (e < 0.1) X.line(o, x, y - 8, x2, y2 - 8, R[0]);
        return;
      }
      case 'trail': {
        const k = 1 - e / f.life;
        if (f.els) this.waveTrail(g, f.x, f.y, f.x2, f.y2, f.els, 0, k, 1.6);
        if (f.els && has(f.els, 0, ELID.water) && e < 0.5) for (let q = 0; q < 16; q++) K.puff(o, gx(f.x2) + (rand(q, 10, sd) - 0.5) * 30, gy(f.y2) + (rand(q, 9, sd) - 0.5) * 20 - 6 - e * 16, 2 + e * 6, q % 2 ? '#ffffff' : EL.water[0], 1 - e / 0.5);
        return;
      }
      case 'feed': {
        const v = bodies[f.who]; if (!v?.on || !v.a) return;
        const orb: Pt = [x, y - 16], src: Pt = [v.x + v.a.head[0], v.y + v.a.head[1] - 6];
        S.mote(o, src, orb, e / 0.25, R, 12);
        return;
      }
      case 'orbstrike': {
        // an orbital flies into its target and bursts in its element
        const x2 = gx(f.x2), y2 = gy(f.y2), q = Math.min(1, e / 0.12), px2 = lerp(x, x2, q), py2 = lerp(y - 12, y2 - 8, q);
        if (q < 1) { for (let j = 1; j <= 4; j++) K.sq(o, lerp(x, x2, Math.max(0, q - j * 0.15)), lerp(y - 12, y2 - 8, Math.max(0, q - j * 0.15)), 2, j < 2 ? SV[1] : SV[2]); this.orb(o, px2, py2, f.look, t, sd); return; }
        const e2 = e - 0.12;
        if (e2 < 0.06) X.ellipse(o, x2, y2 - 8, 6, 6, '#ffffff');
        K.debris(o, x2, y2 - 6, e2, sd, 8, 30, [R[1], R[2], R[3] ?? R[2]], 30);
        K.dust(o, x2, y2 - 2, e2, sd, 5, 10, f.look === ELID.earth ? '#8a7a68' : R[3] ?? R[2], 0.6);
        light(x2, y2, 40, R[2], 0.6 * (1 - e2 / 0.5));
        return;
      }
      case 'glyphfire': {
        // the trap goes off: a white flash, rings in its element and in Sigil violet
        if (f.n === DEVICE.lineglyph) {
          const x2 = gx(f.x2), y2 = gy(f.y2);
          if (e < 0.1) X.line(o, x, y - 2, x2, y2 - 2, '#ffffff', 2);
          for (let q = 0; q <= 6; q++) { const px2 = lerp(x, x2, q / 6), py2 = lerp(y, y2, q / 6); if (e < 0.4) K.gring(g, px2, py2, 3 + e * 30, R[1], 1 - e / 0.4, 1); }
          light((x + x2) / 2, (y + y2) / 2, 70, R[2], 1 - e / 0.4);
          return;
        }
        if (e < 0.08) X.ellipse(o, x, y - 4, 14, 9, '#ffffff');
        if (e < 0.4) { K.gring(g, x, y, 6 + e * 80, R[1], 1 - e / 0.4, 2); K.gring(g, x, y, 4 + e * 50, SV[1], 0.8 - e / 0.4, 1); }
        light(x, y, 54, R[2], 1 - seg(e, 0, 0.4));
        return;
      }
      case 'fade': {
        // a device fades out: its ring collapses, sparks rise, the bound rune flies home
        const q = e / f.life;
        K.gring(g, x, y, 12 * (1 - q) + 1, SV[1], 1 - q, 1);
        for (let j = 0; j < 8; j++) { const a = (j / 8) * TAU + e * 3, r = 8 * (1 - q); X.px(o, x + Math.cos(a) * r, y - 6 - q * 14 + Math.sin(a) * r * 0.5, j % 2 ? SV[0] : R[1]); }
        const v = f.who >= 0 ? bodies[f.who] : null;
        if (v?.on && v.a) S.mote(o, [x, y - 8], [v.x + v.a.head[0], v.y + v.a.head[1]], q, SV, 14);
        return;
      }
      case 'dismiss': {
        const v = bodies[f.who]; if (!v?.on) return;
        const q = e / f.life;
        K.gring(g, v.x, v.y, 4 + q * 20, SV[1], 1 - q, 1);
        for (let j = 0; j < 10; j++) { const a = (j / 10) * TAU - e * 6, r = 14 * (1 - q); X.px(o, v.x + Math.cos(a) * r, v.y - 10 + Math.sin(a) * r * 0.6, j % 2 ? SV[0] : SV[2]); }
        light(v.x, v.y, 40, '#d400ff', 0.5 * (1 - q));
        return;
      }
      case 'motein': {
        // a spent mote spirals into its owner along the orbit, tightening
        const v = bodies[f.who]; if (!v?.on || !v.a) return;
        const q = e / 0.5, ch: Pt = [v.x + v.a.chest[0], v.y + v.a.chest[1]];
        if (q >= 1) { if (q < 1.2) X.glow(o, ch[0], ch[1], 6, SV[1], 0.8); return; }
        const at = (qq: number): Pt => { const kk = smooth(Math.min(1, qq)), a2 = t * 2.2 + (f.n * TAU) / 3 + qq * qq * 5.5; return [v.x + Math.cos(a2) * 15 * (1 - kk), lerp(v.y - 12, ch[1], kk) + Math.sin(a2) * 15 * (1 - kk) * FY]; };
        for (let j = 1; j <= 6; j++) { const p = at(Math.max(0, q - j * 0.05)); K.sq(o, p[0], p[1], j < 3 ? 2 : 1, j < 2 ? SV[1] : SV[2]); }
        const p = at(q); X.glow(o, p[0], p[1], 5, SV[2], 0.75); X.rect(o, p[0] - 1, p[1] - 1, 3, 3, SV[1]); X.px(o, p[0], p[1], '#ffffff');
        return;
      }
      case 'wardoff': {
        const v = bodies[f.who]; if (!v?.on || !v.a) return;
        const ch: Pt = [v.x + v.a.chest[0], v.y + v.a.chest[1]], q = e / f.life, Rw = f.n === WARD.stone ? X.EARTH : f.look === ELID.life ? LIFE : EL.shield;
        for (let j = 0; j < 16; j++) { const px2 = ch[0] + (rand(j, 1, sd) - 0.5) * 12 + Math.sin(e * 6 + j) * 2, py2 = ch[1] - 10 + rand(j, 2, sd) * 22 + q * q * 10; if (rand(j, 3, sd) < q) continue; X.px(o, px2, py2, j % 2 ? Rw[1] : Rw[0]); }
        return;
      }
      case 'dblborn': {
        // the Double materialises: violet motes stream out of the caster and a ring climbs the copy
        const v = bodies[f.who], d = bodies[f.n]; if (!v?.on || !v.a || !d?.on) return;
        for (let j = 0; j < 8; j++) S.mote(o, [v.x + v.a.chest[0], v.y + v.a.chest[1]], [d.x, d.y - 10], (e - j * 0.04) / 0.32, SV, 10);
        const q = seg(e, 0.2, 0.75), yy = d.y - q * 22;
        if (q > 0 && q < 1) { X.ring(o, d.x, yy, 7, 2.5, SV[0], 1); X.ring(o, d.x, yy + 1, 6, 2, SV[2], 0.8); for (let j = 0; j < 6; j++) X.px(o, d.x + (rand(j, Math.floor(t * 20)) - 0.5) * 14, yy - rand(j, 9) * 4, j % 2 ? '#ffffff' : SV[1]); }
        light(d.x, d.y, 40, '#d400ff', 0.7 * (1 - e / f.life));
        return;
      }
      case 'dblgone': {
        for (let j = 0; j < 14; j++) { const a = rand(j, 1, sd) * TAU, d = e * 24; if (rand(j, 2, sd) < e / f.life) continue; X.px(o, x + Math.cos(a) * d, y - 10 + Math.sin(a) * d * 0.6 - e * 10, j % 2 ? SV[0] : SV[2]); }
        return;
      }
      case 'mv-dash': case 'mv-flamestep': case 'mv-iceslide': {
        // a streak along the move: frost for the spear's lunge and the ice slide, flame for the flame step
        const x2 = gx(f.x2), y2 = gy(f.y2), q = e / f.life, Rs = f.kind === 'mv-flamestep' ? EL.fire : X.FROST;
        for (let j = 0; j < 14; j++) {
          const kq = rand(j, 1, sd), px2 = lerp(x, x2, kq), py2 = lerp(y, y2, kq) - 6 - rand(j, 2, sd) * 8;
          if (rand(j, 3, sd) < q) continue;
          X.line(o, px2, py2, px2 - (x2 - x) * 0.08, py2 - (y2 - y) * 0.08, j % 3 ? Rs[1] : '#ffffff');
        }
        if (f.kind === 'mv-dash' && q < 0.5) for (let j = 0; j < 4; j++) K.shard(o, lerp(x, x2, 0.25 + j * 0.2), lerp(y, y2, 0.25 + j * 0.2) - 6, Math.atan2(y2 - y, x2 - x), 6 * (1 - q * 2), sd + j, 1 - q * 2);
        if (f.kind === 'mv-flamestep') K.dust(o, x, y - 2, e, sd, 5, 10, '#4a3a3a', 0.6);
        return;
      }
      case 'mv-backstep': case 'mv-phase': case 'mv-seedstep': {
        // hop dust (Mirror), a hex afterimage (Prism), a leaf trail (Leaf) from the bloom it left
        const q = e / f.life;
        if (f.kind === 'mv-backstep') { K.dust(g, x, y, e, sd, 7, 12, '#8a7a68', 0.7); K.gring(g, x, y, 3 + q * 9, EL.shield[1], 1 - q, 1); return; }
        if (f.kind === 'mv-phase') {
          for (let r = 0; r < 2; r++) { const rr = 10 + r * 5, pts: Pt[] = []; for (let j = 0; j <= 6; j++) { const a = (j / 6) * TAU + Math.PI / 6; pts.push([x + Math.cos(a) * rr, y - 12 + Math.sin(a) * rr * 0.8]); } if (rand(r, Math.floor(t * 20), sd) > q) X.lines(o, pts, r ? EL.arcane[3] : EL.arcane[1]); }
          return;
        }
        const x2 = gx(f.x2), y2 = gy(f.y2);
        for (let j = 0; j < 12; j++) { const kq = j / 12, px2 = lerp(x, x2, kq * 0.8) + Math.sin(kq * 6 + sd) * 4, py2 = lerp(y, y2, kq * 0.8) - 2; if (rand(j, 4, sd) < q) continue; X.px(g, px2, py2, j % 2 ? LIFE[2] : LIFE[3]); X.px(o, px2 + 1, py2 - 4 - q * 6, LIFE[1]); }
        return;
      }
      case 'mv-shovestep': {
        // the slab slammed forward as you step back: a shock arc in front of where you stood, and dust
        const x2 = gx(f.x2), y2 = gy(f.y2), L = Math.hypot(x - x2, y - y2) || 1, ux = (x - x2) / L, uy = (y - y2) / L, q = e / f.life;
        if (q < 0.5) for (let j = -4; j <= 4; j++) { const a = Math.atan2(uy, ux) + j * 0.16, rr = 8 + q * 40; X.px(g, x + Math.cos(a) * rr, y + Math.sin(a) * rr * FY, j % 2 ? X.EARTH[1] : '#e8dcc8'); X.px(g, x + Math.cos(a) * (rr - 2), y + Math.sin(a) * (rr - 2) * FY, X.EARTH[3]); }
        K.dust(o, x + ux * 10, y + uy * 10 * FY, e, sd, 8, 16, '#8a7a68', 0.8);
        return;
      }
      case 'mv-coat': {
        // a guard's coat biting back: a puff and sparks in the mixed-in element's colour on whoever it bit
        const q = e / f.life, R4 = f.look === ELID.life ? LIFE : ramp(f.look || ELID.shield);
        for (let j = 0; j < 7; j++) K.puff(o, x + (rand(j, 1, sd) - 0.5) * 12, y - 8 - e * 12, 1.5 + e * 4, j % 2 ? R4[0] : R4[2], 1 - q);
        light(x, y, 30, R4[2], 0.6 * (1 - q));
        return;
      }
      case 'mv-glance': case 'mv-chill': {
        // a shot skipping off the Mirror: a white flash and sparks; frost biting back at a Rime blocker's attacker
        const q = e / f.life;
        if (f.kind === 'mv-chill') { for (let j = 0; j < 8; j++) K.puff(o, x + (rand(j, 1, sd) - 0.5) * 14, y - 8 - e * 10, 1.5 + e * 4, j % 2 ? '#ffffff' : X.FROST[1], 1 - q); return; }
        const v = bodies[f.who]; if (!v?.on) return;
        const fx = gx(w.bodies.x[f.who] + Math.cos(w.bodies.face[f.who] * TAU) * 0.6), fy = gy(w.bodies.y[f.who] + Math.sin(w.bodies.face[f.who] * TAU) * 0.6) - 10;
        X.ellipse(o, fx, fy, 5 * (1 - q), 5 * (1 - q), '#ffffff', 1 - q);
        for (let j = 0; j < 6; j++) { const a = rand(j, 1, sd) * TAU, d = e * 40; X.px(o, fx + Math.cos(a) * d, fy + Math.sin(a) * d * 0.5, j % 2 ? '#ffffff' : EL.shield[1]); }
        return;
      }
      case 'mv-surge': case 'mv-tidewave': {
        // a wave shoving forward from you (Surge rides back on it; the Tide parry throws it)
        const x2 = gx(f.x2), y2 = gy(f.y2), L = Math.hypot(x - x2, y - y2) || 1, ux = (x - x2) / L, uy = (y - y2) / L, q = e / f.life;
        const cx = x + ux * (6 + q * 30), cy = y + uy * (6 + q * 30) * FY;
        for (let j = -5; j <= 5; j++) { const px2 = cx - uy * j * 2.4, py2 = cy + ux * j * 2.4 * FY, h = (8 - Math.abs(j)) * (1 - q); if (h < 1) continue; X.line(o, px2, py2, px2, py2 - h, EL.water[2]); X.px(o, px2, py2 - h, '#ffffff'); }
        for (let j = 0; j < 8; j++) K.puff(o, cx + (rand(j, 1, sd) - 0.5) * 20, cy - 4 - e * 14, 2 + e * 5, j % 2 ? '#ffffff' : EL.water[0], 1 - q);
        return;
      }
      case 'mv-parry': case 'mv-block': case 'mv-guardbreak': {
        // parry: a big, brief flash in the guard's colour; block: a small spark; break: shards flying off
        const v = bodies[f.who]; if (!v?.on) return;
        const R2 = f.look === ELID.life ? LIFE : ramp(f.look || ELID.shield), q = e / f.life, fx = gx(w.bodies.x[f.who] + Math.cos(w.bodies.face[f.who] * TAU) * 0.6), fy = gy(w.bodies.y[f.who] + Math.sin(w.bodies.face[f.who] * TAU) * 0.6) - 10;
        if (f.kind === 'mv-parry') { if (q < 0.3) X.ellipse(o, fx, fy, 9 * (1 - q), 9 * (1 - q), '#ffffff'); K.gring(o, fx, fy + 8, 4 + q * 26, R2[1], 1 - q, 2); X.glow(o, fx, fy, 14 * (1 - q), R2[2], 0.9 * (1 - q)); light(fx, fy + 10, 60, R2[2], 0.9 * (1 - q)); return; }
        if (f.kind === 'mv-block') { for (let j = 0; j < 6; j++) { const a = rand(j, 1, sd) * TAU, d = e * 30; X.px(o, fx + Math.cos(a) * d, fy + Math.sin(a) * d * 0.7, j % 2 ? '#ffffff' : R2[1]); } return; }
        for (let j = 0; j < 14; j++) { const a = rand(j, 1, sd) * TAU, d = e * (14 + rand(j, 2, sd) * 16); if (rand(j, 3, sd) < q) continue; X.px(o, fx + Math.cos(a) * d, fy + Math.sin(a) * d * 0.7 + e * e * 30, j % 3 ? R2[1] : '#ffffff'); }
        return;
      }
      case 'mv-flameburst': {
        const v = bodies[f.who]; if (!v?.on) return;
        const a0 = w.bodies.face[f.who] * TAU, q = e / f.life;
        for (let j = 0; j < 9; j++) { const a = a0 + (rand(j, 1, sd) - 0.5) * 1.0, d = 6 + q * 26 * (0.6 + rand(j, 2, sd) * 0.4); K.tongue(o, v.x + Math.cos(a) * d, v.y + Math.sin(a) * d * FY - 4, 2.2 * (1 - q), 8 * (1 - q), Math.cos(a)); }
        light(v.x, v.y, 50, '#ff7020', 0.8 * (1 - q));
        return;
      }
      case 'mv-lance': {
        // the Prism's Lance: a white-hot line straight ahead in the coat's colour (violet bare), thinning as it fades
        const x2 = gx(f.x2), y2 = gy(f.y2), q = e / f.life, R = ramp(f.look || ELID.arcane), yo = -8;
        const wd = Math.max(1, Math.round(4 * (1 - q)));
        X.line(o, x, y + yo, x2, y2 + yo, R[2], wd + 2); X.line(o, x, y + yo, x2, y2 + yo, R[0], wd);
        if (q < 0.4) X.line(o, x, y + yo, x2, y2 + yo, '#ffffff', 1);
        for (let j = 0; j < 10; j++) { const kq = rand(j, 1, sd); if (rand(j, 2, sd) < q) continue; X.px(o, lerp(x, x2, kq), lerp(y, y2, kq) + yo + (rand(j, 3, sd) - 0.5) * 8 * (1 + q * 2), j % 2 ? R[1] : '#ffffff'); }
        X.glow(o, x2, y2 + yo, 8 * (1 - q), R[1], 0.8);
        light((x + x2) / 2, y + yo, 60, R[2], 0.8 * (1 - q));
        return;
      }
      case 'mv-chargedbolt': case 'mv-siphon': {
        // the wand: rings off the tip as a charged bolt leaves; Siphon pulls violet motes in from all round
        const v = bodies[f.who]; if (!v?.on || !v.a) return;
        const tip: Pt = [v.x + v.a.hands[0][0], v.y + v.a.hands[0][1] - 9], q = e / f.life;
        if (f.kind === 'mv-siphon') { for (let j = 0; j < 6; j++) { const a = rand(j, 1, sd) * TAU; S.mote(o, [tip[0] + Math.cos(a) * 30, tip[1] + 10 + Math.sin(a) * 18], tip, q, EL.arcane, 10); } return; }
        K.gring(o, tip[0], tip[1] + 4, 3 + q * 18, EL.arcane[1], 1 - q, 1); X.glow(o, tip[0], tip[1], 9 * (1 - q), EL.arcane[2], 0.9);
        return;
      }
      case 'mv-javelin': {
        // the throw: the spear thrusts and an ice copy peels off its head along the thrust line, shedding frost
        const v = bodies[f.who]; if (!v?.on || !v.a) return;
        const q = e / f.life, a = w.bodies.face[f.who] * TAU, ux = Math.cos(a), uy = Math.sin(a) * FY, hx = v.x + v.a.hands[0][0], hy = v.y + v.a.hands[0][1];
        if (q < 0.35) { const k = q / 0.35; X.line(o, hx + ux * (4 + k * 10), hy + uy * (4 + k * 10) - 2, hx + ux * (16 + k * 14), hy + uy * (16 + k * 14) - 2, '#c4eefa', 2); X.glow(o, hx + ux * 16, hy + uy * 16 - 2, 6 * (1 - k), '#9ff4ff', 0.8); }
        for (let j = 0; j < 8; j++) { const d = 14 + rand(j, 1, sd) * 12; if (rand(j, 2, sd) < q) continue; X.px(o, hx + ux * d + (rand(j, 3, sd) - 0.5) * 4, hy + uy * d - 2 + e * 14, j % 2 ? '#ffffff' : X.FROST[1]); }
        return;
      }
      case 'mv-mend': {
        // Mend: a soft green ring swelling out to its reach at your feet, leaves lifting off it
        const q = e / f.life, R3 = 3.5 * 16;
        K.gring(g, x, y, R3 * (0.3 + 0.7 * q), LIFE[2], 1 - q, 1);
        for (let j = 0; j < 8; j++) { const a = (j / 8) * TAU + sd, rr = R3 * (0.3 + 0.7 * q); X.px(o, x + Math.cos(a) * rr, y + Math.sin(a) * rr * FY - q * 8, j % 2 ? LIFE[1] : LIFE[3]); }
        return;
      }
      case 'mv-link': case 'mv-linkbreak': {
        const x2 = gx(f.x2), y2 = gy(f.y2), q = e / f.life;
        if (f.kind === 'mv-link') { K.gring(g, x2, y2, 4 + q * 12, LIFE[2], 1 - q, 1); return; }
        for (let j = 0; j < 10; j++) { const kq = rand(j, 1, sd); X.px(o, lerp(x, x2, kq), lerp(y, y2, kq) - 10 + q * q * 20, j % 2 ? LIFE[1] : LIFE[3]); }
        return;
      }
      case 'echo': {
        // the Double repeats a spell: a violet flash on it and a ring at its feet
        const d = bodies[f.n]; if (!d?.on || !d.a) return;
        const q = e / f.life;
        K.gring(g, d.x, d.y, 4 + q * 14, SV[1], 1 - q, 1);
        if (q < 0.4) X.glow(o, d.x + d.a.chest[0], d.y + d.a.chest[1], 7 * (1 - q), SV[1], 0.8);
        for (let j = 0; j < 6; j++) { const a = (j / 6) * TAU + e * 8, r = 6 + q * 6; X.px(o, d.x + Math.cos(a) * r, d.y - 10 + Math.sin(a) * r * 0.6, SV[j % 2 ? 0 : 2]); }
        return;
      }
      default:
    }
  }
}

// =====================================================================================================
// Portals and enemy telegraphs (kept from the sim-side placeholder; Graphics layers).
export interface StructureLayers { ground: Graphics; overlay: Graphics; ax: (x: number) => number; ay: (y: number) => number }

export function drawTelegraphs(w: World, L: StructureLayers, frame: number): void {
  const g = L.ground, o = L.overlay, b = w.bodies;
  const enc = w.enc;
  if (enc.state[0]) {
    for (let p = 0; p < MAX_PORTALS; p++) {
      if (!enc.total[p] || (enc.state[0] === PHASE_ENC.wave && !enc.left[p])) continue;
      const x = L.ax(enc.px[p]), y = L.ay(enc.py[p]);
      const pulse = 0.5 + 0.3 * Math.sin(frame / 6 + p);
      g.ellipse(x, y, 12, 12 * CFY).fill({ color: 0x2a0d33, alpha: 0.8 }).stroke({ color: 0xff4f9b, width: 1, alpha: pulse });
      if (enc.state[0] === PHASE_ENC.lull) {
        const f = Math.max(0, Math.min(1, enc.state[2] / (WAVE_TIMES.lull * 60)));
        o.ellipse(x, y - 1, 15 * f + 3, (15 * f + 3) * CFY).stroke({ color: 0xffd36b, width: 1, alpha: 0.8 });
      }
      for (let k = 0; k < enc.left[p]; k++) o.rect(x - enc.left[p] * 2 + k * 4, y + 9, 2, 2).fill({ color: 0xff4f9b });
    }
  }
  for (let i = MAX_SEATS; i < b.kind.length; i++) {
    if (b.kind[i] !== KIND.enemy || b.ai[i] !== AI.windup) continue;
    const a = ARCHETYPES[b.arch[i]], f = Math.min(1, b.aiT[i] / Math.max(1, a.windup * 60));
    const x = L.ax(b.x[i]), y = L.ay(b.y[i]);
    if (a.attack === ATTACK.slam) {
      const r = (a.slamRadius ?? 2) * PPU, cx = L.ax(b.lockX[i]), cy = L.ay(b.lockY[i]);
      g.ellipse(cx, cy, r, r * CFY).stroke({ color: 0xff8a3a, width: 1, alpha: 0.9 });
      g.ellipse(cx, cy, r * f, r * f * CFY).fill({ color: 0xff8a3a, alpha: 0.28 });
    } else if (a.attack === ATTACK.bolt || a.attack === ATTACK.grab) {
      const tx = L.ax(b.lockX[i]), ty = L.ay(b.lockY[i]);
      const c = a.attack === ATTACK.bolt ? 0x7cff9a : 0x4fe0d6;
      for (let k = 0; k < 10; k += 2) {
        const f1 = k / 10, f2 = (k + 1) / 10;
        g.moveTo(x + (tx - x) * f1, y + (ty - y) * f1).lineTo(x + (tx - x) * f2, y + (ty - y) * f2).stroke({ color: c, width: 1, alpha: 0.4 + 0.5 * f });
      }
    } else {
      const reach = (a.reach + b.r[i] + 0.5) * PPU, face = b.face[i] * 6.283185307179586;
      const pts: number[] = [x, y];
      for (let k = -2; k <= 2; k++) { const an = face + k * 0.3; pts.push(x + Math.cos(an) * reach, y + Math.sin(an) * reach * CFY); }
      g.poly(pts).fill({ color: 0xff3a3a, alpha: 0.15 + 0.3 * f });
    }
  }
}
