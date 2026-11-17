/**
 * Enemy sprites rendered from 3D models (tools/sprites-3d: Meshy rigs and clips, pixelized, packed by pack.py into
 * content/assets/sprites/<slug>/sheet.png + sheet.json). They stand in for the code rigs of the goblin warband: each
 * frame is copied into a cell the size of a rig cell with its feet on the rig's feet point, so shadows, silhouettes and
 * ghosts that read the cached frame keep working. Frames are picked from the same RigState the rigs paint from:
 * facing, walk or run phase, the time from the attack's hit (each clip plays at its own speed, its contact frame on the
 * hit; nothing is retimed, since smooth swings matter more than telegraphs here), knocked down. Deaths play the knock-down. Statuses are a tint, a hit a white flash.
 *
 * On by default; ?sprites=0 shows the code rigs. With sprites on the wizard is drawn 1.7x (rigs.ts WIZ_Z), the scale
 * the 32 px goblins were made for (explorations/2026-11-16-warband-art.md).
 *
 * The wizard has a sheet too (made the same way from the code rig's design), recoloured per seat from px.ts TEAMS when
 * it loads: its robe and hat are keyed by hue (crimson), its trim by gold. Gathering (prep) loops a raised-hands clip,
 * a Force cast holds the push clip at its full stretch. ?wizsprite=0 keeps the wizard's code rig; the detailed drawing
 * (hd) always does.
 */
import { Texture } from 'pixi.js';
import { HEIGHT, CELL_H, CELL_W, FEET_X, FEET_Y, SPRITES_ON, type Anchors, type RigState } from './rigs';
import type { Frame } from './actors';
import * as X from './px';

interface Move { row: number; n: number }
interface SheetMeta { cell: [number, number]; feet: [number, number]; height: number; dirs: string[]; fps: number; moves: Record<string, Move>; attacks?: { hit: number }[]; casts?: Record<string, { hit: number }> }
interface Attack extends Move { hit: number }
interface Sheet { meta: SheetMeta; img: HTMLImageElement | null; attacks: Attack[]; seats?: HTMLCanvasElement[] }

/** The wizard's sprite (on with the warband's unless ?wizsprite=0). */
const WIZ_SPRITE = SPRITES_ON && (() => {
  try { return new URLSearchParams(globalThis.location?.search ?? '').get('wizsprite') !== '0'; } catch { return true; }
})();

const metas = import.meta.glob<SheetMeta>('../../../../content/assets/sprites/*/sheet.json', { eager: true, import: 'default' });
const urls = import.meta.glob<string>('../../../../content/assets/sprites/*/sheet.png', { eager: true, query: '?url', import: 'default' });

const TAU = Math.PI * 2;
const sheets = new Map<string, Sheet>();
for (const [path, meta] of Object.entries(metas)) {
  const slug = path.split('/').slice(-2)[0];
  const attacks = Object.keys(meta.moves).filter((k) => k.startsWith('attack')).sort()
    .map((k, j) => ({ ...meta.moves[k], hit: meta.attacks?.[j]?.hit ?? Math.floor(meta.moves[k].n / 2) }));
  sheets.set(slug, { meta, img: null, attacks });
}
let loading = false;
/** Fetches every sheet once; until one arrives its body keeps the code rig. */
function load(): void {
  if (loading) return;
  loading = true;
  for (const [path, url] of Object.entries(urls)) {
    const slug = path.split('/').slice(-2)[0], sh = sheets.get(slug);
    if (!sh) continue;
    const img = new Image();
    img.onload = () => { if (slug === 'wizard') sh.seats = X.TEAMS.map((p) => seatSheet(img, p)); sh.img = img; };
    img.onerror = () => console.warn('sprites: could not load', url);
    img.src = url;
  }
}

const hexRgb = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/**
 * The wizard's sheet in one seat's colours. The pixelizer gives each part four tones (pixelize.py); the crimson robe
 * and hat (hue 320..15, saturated) take the seat's deep / dark / main / light by brightness, the gold trim (hue 30..58,
 * saturated) the seat's trim shaded by its brightness. Skin, beard, boots and the staff's wood are left alone.
 */
function seatSheet(img: HTMLImageElement, p: X.TeamPal): HTMLCanvasElement {
  const { c, x } = X.canvas(img.width, img.height);
  x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, img.width, img.height), a = d.data;
  const ramp = [p.deep, p.dark, p.main, p.light].map(hexRgb), trim = hexRgb(p.trim);
  for (let i = 0; i < a.length; i += 4) {
    if (!a[i + 3]) continue;
    const r = a[i], g = a[i + 1], b = a[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx < 40 || mx - mn < 0.45 * mx) continue;
    const ch = mx - mn;
    let h = mx === r ? ((g - b) / ch) % 6 : mx === g ? (b - r) / ch + 2 : (r - g) / ch + 4;
    h = (h * 60 + 360) % 360;
    const v = mx / 255;
    let o: [number, number, number] | null = null;
    if (h >= 320 || h <= 15) o = ramp[v < 0.45 ? 0 : v < 0.76 ? 1 : v < 0.9 ? 2 : 3];
    else if (h >= 30 && h <= 58 && ch > 0.6 * mx) { const k = Math.min(1.1, v / 0.92); o = [trim[0] * k, trim[1] * k, trim[2] * k].map((q) => Math.min(255, Math.round(q))) as [number, number, number]; }
    if (o) { a[i] = o[0]; a[i + 1] = o[1]; a[i + 2] = o[2]; }
  }
  x.putImageData(d, 0, 0);
  return c;
}

/**
 * Which sheet draws this rig state, or null for a code rig. The goblin rig's variants 0..2 are the common raiders
 * (hooded twice as often as goggled), 4 the grabber (the hooker), 5 the shieldbearer; the imp (3) and the tutorial's
 * straw goblin (pal 6) stay code.
 */
export function slugOf(s: RigState): string | null {
  if (!SPRITES_ON) return null;
  if (s.kind === 'wizard') return WIZ_SPRITE && !s.hd && sheets.has('wizard') ? 'wizard' : null;
  if (s.kind === 'archer') return 'archer';
  if (s.kind === 'brute') return 'chieftain';
  if (s.kind !== 'goblin' || s.pal === 6) return null;
  if (s.variant === 5) return 'shieldbearer';
  if (s.variant === 4) return 'hooker';
  if (s.variant === 3) return null;
  return s.variant === 1 ? 'raider-goggles' : 'raider-hooded';
}

const dirOf = (face: number): number => ((Math.round(face / (TAU / 8)) % 8) + 8) % 8;

/**
 * An attack variant, picked afresh for each swing: a hash of the body and the swing's hit tick, so it holds through one
 * attack, differs between neighbours, and survives a rollback re-simulation. Purely cosmetic; enemies whose attacks
 * differ in what they do should have the sim choose instead.
 */
function variantOf(who: number, swing: number, n: number): number {
  if (n < 2) return 0;
  let h = Math.imul(who + 1, 0x9e3779b1) ^ Math.imul(swing, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); h ^= h >>> 12;
  return (h >>> 0) % n;
}

/** The cell (move, frame) a state shows. */
function cellOf(sh: Sheet, s: RigState, who: number): [Move, number] {
  const M = sh.meta.moves;
  if (s.dead > 0) { const d = M.death; return [d, Math.round((d.n - 1) * Math.min(1, s.dead))]; }
  if (s.kind === 'wizard') {
    // a Force cast: the push clip into its full stretch (halfway from the release to the clip's end), held there while
    // the spell flows; gathering loops in real time
    const c = M.cast, hit = sh.meta.casts?.cast?.hit ?? 0, held = c ? hit + Math.floor((c.n - 1 - hit) / 2) : 0;
    if (c && s.cast > 0) return [c, Math.round(held * Math.min(1, s.cast))];
    if (M.gather && s.prep > 0) return [M.gather, Math.floor((performance.now() / 1000) * (sh.meta.fps || 12)) % M.gather.n];
  }
  // an attack plays its clip at the clip's own speed, never retimed, with its contact frame on the game's hit: a longer
  // wind-up than the clip's holds its first pose, a shorter one starts it partway; once the clip ends the body walks or idles
  if ((s.hitT === s.hitT || s.hold > 0) && sh.attacks.length) {
    const a = sh.attacks[variantOf(who, s.swing, sh.attacks.length)];
    const f = s.hold > 0 ? a.hit + 1 : a.hit + Math.round(s.hitT * (sh.meta.fps || 12));
    if (f < a.n) return [a, Math.max(0, Math.min(a.n - 1, f))];
  }
  if (s.spd > 0) {
    const m = s.spd >= 1 ? M.run : M.walk;
    return [m, Math.floor(((s.ph % TAU) + TAU) % TAU / TAU * m.n) % m.n];
  }
  return [M.idle, 0];
}

/** A cell-sized frame with the sheet frame on the rig's feet point; `white` for a hit flash. */
function compose(sh: Sheet, m: Move, dir: number, f: number, white: boolean, a: Anchors, seat = 0): Frame {
  const { c, x } = X.canvas(CELL_W, CELL_H);
  const [cw, ch] = sh.meta.cell, [fx, fy] = sh.meta.feet;
  x.drawImage(sh.seats?.[seat % sh.seats.length] ?? sh.img!, f * cw, (m.row + dir) * ch, cw, ch, FEET_X - fx, FEET_Y - fy, cw, ch);
  if (white) { x.globalCompositeOperation = 'source-in'; x.fillStyle = '#ffffff'; x.fillRect(0, 0, CELL_W, CELL_H); x.globalCompositeOperation = 'source-over'; }
  const tex = Texture.from(c); tex.source.scaleMode = 'nearest';
  return { tex, a, c, sx: 0, sy: 0 };
}

/** The rig's anchors (head, chest, hands, feet-relative) stretched to the sprite's height. */
function stretch(a: Anchors, k: number): Anchors {
  const p = (q: [number, number]): [number, number] => [Math.round(q[0] * k), Math.round(q[1] * k)];
  return { tip: p(a.tip), chest: p(a.chest), head: p(a.head), hands: a.hands.map(p), charge: p(a.charge) };
}

const cache = new Map<string, Frame>();
/**
 * The sprite frame for a rig state, or null (a code rig, or its sheet not loaded yet). `rigAnchors` are the code rig's
 * anchors for the same state, which effects aim at; they are stretched to the sprite's size.
 */
export function spriteFrame(s: RigState, who: number, rigAnchors: Anchors): Frame | null {
  const slug = slugOf(s);
  if (!slug) return null;
  load();
  const sh = sheets.get(slug);
  if (!sh?.img) return null;
  const [m, f] = cellOf(sh, s, who), dir = dirOf(s.face), white = s.flash >= 9;
  const seat = s.kind === 'wizard' ? s.pal : 0;
  const key = slug + '|' + seat + '|' + m.row + '|' + dir + '|' + f + '|' + (white ? 1 : 0);
  let fr = cache.get(key);
  if (!fr) { fr = compose(sh, m, dir, f, white, stretch(rigAnchors, sh.meta.height / HEIGHT[s.kind]), seat); cache.set(key, fr); }
  return fr;
}

/** A multiply tint for a sprite's statuses (the code rigs paint them on the body). */
export function statusTint(s: RigState): number {
  if (s.frozen > 0) return 0x8fd0ff;
  if (s.shock) return 0xfff2a0;
  if (s.burn > 0) return s.burnF & 1 ? 0xffb070 : 0xff9a60;
  if (s.wet > 0) return 0xa8c4ff;
  if (s.chill > 0) return 0xd0e6ff;
  return 0xffffff;
}

/** Two tints multiplied (a status on the room's ambient light). */
export function mulTint(a: number, b: number): number {
  const ch = (sh: number) => Math.round((((a >> sh) & 255) * ((b >> sh) & 255)) / 255) << sh;
  return ch(16) | ch(8) | ch(0);
}

/** A death on a sprite: the knock-down plays once, then lies still and fades. */
export interface SpriteDeath { slug: string; dir: number; x: number; y: number; t0: number }
export const DEATH_HOLD = 1.6, DEATH_FADE = 0.6;
/** The frame of a death `td` seconds in, and its opacity; null once it has faded out. */
export function deathFrame(d: SpriteDeath, td: number, rigAnchors: Anchors): { f: Frame; alpha: number } | null {
  const sh = sheets.get(d.slug);
  if (!sh?.img) return null;
  const m = sh.meta.moves.death, play = m.n / (sh.meta.fps || 12);
  if (td > play + DEATH_HOLD + DEATH_FADE) return null;
  const f = Math.min(m.n - 1, Math.floor((td / play) * m.n));
  const key = d.slug + '|0|' + m.row + '|' + d.dir + '|' + f + '|0';
  let fr = cache.get(key);
  if (!fr) { fr = compose(sh, m, d.dir, f, false, rigAnchors); cache.set(key, fr); }
  const fade = td - play - DEATH_HOLD;
  return { f: fr, alpha: fade > 0 ? Math.max(0, 1 - fade / DEATH_FADE) : 1 };
}
export const deathDir = dirOf;
