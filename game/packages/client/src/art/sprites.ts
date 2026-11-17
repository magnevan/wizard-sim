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
 */
import { Texture } from 'pixi.js';
import { HEIGHT, CELL_H, CELL_W, FEET_X, FEET_Y, SPRITES_ON, type Anchors, type RigState } from './rigs';
import type { Frame } from './actors';
import { LIVE3D_ON, liveFrame, liveMeta, type LivePose } from './live3d';
import * as X from './px';

interface Move { row: number; n: number }
interface SheetMeta { cell: [number, number]; cols?: number; feet: [number, number]; height: number; dirs: string[]; fps: number; moves: Record<string, Move>; attacks?: { hit: number }[] }
interface Attack extends Move { hit: number }
interface Sheet { meta: SheetMeta; img: HTMLImageElement | null; attacks: Attack[] }

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
    img.onload = () => { sh.img = img; };
    img.onerror = () => console.warn('sprites: could not load', url);
    img.src = url;
  }
}

/**
 * Which sheet draws this rig state, or null for a code rig. The goblin rig's variants 0..2 are the common raiders
 * (hooded twice as often as goggled), 4 the grabber (the hooker), 5 the shieldbearer; the imp (3) and the tutorial's
 * straw goblin (pal 6) stay code.
 */
export function slugOf(s: RigState): string | null {
  if (!SPRITES_ON) return null;
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
function compose(sh: Sheet, m: Move, dir: number, f: number, white: boolean, a: Anchors): Frame {
  const { c, x } = X.canvas(CELL_W, CELL_H);
  const [cw, ch] = sh.meta.cell, [fx, fy] = sh.meta.feet;
  // a long move wraps into further bands of 8 direction rows (pack.py): frame f at column f % cols
  const cols = sh.meta.cols ?? Infinity, col = f % cols, band = Math.floor(f / cols);
  x.drawImage(sh.img!, col * cw, (m.row + dir + 8 * band) * ch, cw, ch, FEET_X - fx, FEET_Y - fy, cw, ch);
  if (white) { x.globalCompositeOperation = 'source-in'; x.fillStyle = '#ffffff'; x.fillRect(0, 0, CELL_W, CELL_H); x.globalCompositeOperation = 'source-over'; }
  const tex = Texture.from(c); tex.source.scaleMode = 'nearest';
  return { tex, a, c, sx: 0, sy: 0 };
}

/** The rig's anchors (head, chest, hands, feet-relative) stretched to the sprite's height. */
function stretch(a: Anchors, k: number): Anchors {
  const p = (q: [number, number]): [number, number] => [Math.round(q[0] * k), Math.round(q[1] * k)];
  return { tip: p(a.tip), chest: p(a.chest), head: p(a.head), hands: a.hands.map(p), charge: p(a.charge) };
}

/** After an attack's hit: its follow-through plays this long before a moving body's legs take over, over BLEND (s). */
const FOLLOW = 0.25, BLEND = 0.3;

/**
 * What a live model (art/live3d.ts) shows for a rig state: the same choices as cellOf, as a clip time instead of a sheet
 * frame. An attack runs on the game's clock with its hit on the game's hit; a cut hold is skipped, as the sheet leaves it out.
 */
function livePose(slug: string, s: RigState, who: number): LivePose {
  const meta = liveMeta(slug)!, face = s.faceT, flash = s.flash >= 9;
  const dur = (m: string) => meta.clips[m]?.duration ?? 1;
  // walk and run go by the distance walked over the clip's stride (art px: model units x the squash x 16 px a unit),
  // so the feet stay planted whatever the body's speed
  const step = (m: string) => {
    const c = meta.clips[m], stride = (c?.stride ?? 1) * 1.15 * 16;
    return (((s.dist / stride) % 1) + 1) % 1 * (c?.duration ?? 1);
  };
  const legs = s.spd >= 1 ? 'run' : 'walk';
  if (s.dead > 0) return { move: 'death', t: dur('death') * Math.min(1, s.dead), face, flash };
  if ((s.hitT === s.hitT || s.hold > 0) && meta.attacks.length) {
    const a = meta.attacks[variantOf(who, s.swing, meta.attacks.length)];
    const cut = a.cut, gap = cut ? cut[1] - cut[0] + 1 / meta.fps : 0;
    // time on the clip with the cut hold taken out, then back to clip time
    const kept = (t: number) => (cut && t > cut[1] ? t - gap : t);
    const u = kept(a.hit) + (s.hold > 0 ? 1 / meta.fps : s.hitT);
    const t = Math.max(a.first, cut && u >= cut[0] ? u + gap : u);
    // the game creeps a goblin forward through its recovery: once the follow-through is done and it moves, its legs
    // take over (a crossfade into the walk), so it doesn't slide on the attack's planted feet
    const k = s.spd > 0 && s.hitT > FOLLOW ? Math.min(1, (s.hitT - FOLLOW) / BLEND) : 0;
    const w2 = k * k * (3 - 2 * k);
    if (t <= a.last && w2 < 1) return { move: a.clip, t, face, flash, ...(w2 > 0 ? { move2: legs, t2: step(legs), w2 } : {}) };
  }
  if (s.spd > 0) return { move: legs, t: step(legs), face, flash };
  return { move: 'walk', t: 0, face, flash };
}

const cache = new Map<string, Frame>();
/**
 * The sprite frame for a rig state, or null (a code rig, or its sheet not loaded yet). `rigAnchors` are the code rig's
 * anchors for the same state, which effects aim at; they are stretched to the sprite's size. Drawn live from the 3D
 * model when it has one (art/live3d.ts), else from the baked sheet.
 */
export function spriteFrame(s: RigState, who: number, rigAnchors: Anchors): Frame | null {
  const slug = slugOf(s);
  if (!slug) return null;
  const sh = sheets.get(slug);
  if (LIVE3D_ON && sh && liveMeta(slug)) {
    const live = liveFrame(slug, livePose(slug, s, who), stretch(rigAnchors, sh.meta.height / HEIGHT[s.kind]));
    if (live) return live;
  }
  load();
  if (!sh?.img) return null;
  const [m, f] = cellOf(sh, s, who), dir = dirOf(s.face), white = s.flash >= 9;
  const key = slug + '|' + m.row + '|' + dir + '|' + f + '|' + (white ? 1 : 0);
  let fr = cache.get(key);
  if (!fr) { fr = compose(sh, m, dir, f, white, stretch(rigAnchors, sh.meta.height / HEIGHT[s.kind])); cache.set(key, fr); }
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

/** A death on a sprite: the knock-down plays once, then lies still and fades. `face` for a live model, `dir` for a sheet. */
export interface SpriteDeath { slug: string; dir: number; face: number; x: number; y: number; t0: number }
export const DEATH_HOLD = 1.6, DEATH_FADE = 0.6;
/** The frame of a death `td` seconds in, and its opacity; null once it has faded out. */
export function deathFrame(d: SpriteDeath, td: number, rigAnchors: Anchors): { f: Frame; alpha: number } | null {
  const meta = LIVE3D_ON ? liveMeta(d.slug) : undefined;
  if (meta) {
    const play = meta.clips.death?.duration ?? 2;
    if (td > play + DEATH_HOLD + DEATH_FADE) return null;
    const f = liveFrame(d.slug, { move: 'death', t: Math.min(td, play), face: d.face, flash: false }, rigAnchors);
    const fade = td - play - DEATH_HOLD;
    if (f) return { f, alpha: fade > 0 ? Math.max(0, 1 - fade / DEATH_FADE) : 1 };
  }
  const sh = sheets.get(d.slug);
  if (!sh?.img) return null;
  const m = sh.meta.moves.death, play = m.n / (sh.meta.fps || 12);
  if (td > play + DEATH_HOLD + DEATH_FADE) return null;
  const f = Math.min(m.n - 1, Math.floor((td / play) * m.n));
  const key = d.slug + '|' + m.row + '|' + d.dir + '|' + f + '|0';
  let fr = cache.get(key);
  if (!fr) { fr = compose(sh, m, d.dir, f, false, rigAnchors); cache.set(key, fr); }
  const fade = td - play - DEATH_HOLD;
  return { f: fr, alpha: fade > 0 ? Math.max(0, 1 - fade / DEATH_FADE) : 1 };
}
export const deathDir = dirOf;
