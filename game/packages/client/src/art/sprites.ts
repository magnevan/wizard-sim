/**
 * Enemy sprites rendered from 3D models (tools/sprites-3d: Meshy rigs and clips, pixelized, packed by pack.py into
 * content/assets/sprites/<slug>/sheet.png + sheet.json). They stand in for the code rigs of the goblin warband: each
 * frame is copied into a cell the size of a rig cell with its feet on the rig's feet point, so shadows, silhouettes and
 * ghosts that read the cached frame keep working. Frames are picked from the same RigState the rigs paint from:
 * facing, walk or run phase, the time from the attack's hit (each clip plays at its own speed, its contact frame on the
 * hit; nothing is retimed, since smooth swings matter more than telegraphs here), knocked down. Deaths play the knock-down. Statuses are a tint, a hit a white flash.
 *
 * On by default; ?sprites=0 shows the code rigs. With sprites on the wizard is drawn 1.4x (rigs.ts WIZ_Z; the user found
 * 1.7 too big), beside the 32 px goblins (explorations/2026-11-16-warband-art.md).
 *
 * Bodies with a 3D model are drawn live (art/live3d.ts); these baked sheets are the fallback: before a model loads,
 * without a usable GPU, or with ?live3d=0. The wizard's fallback sheet was baked for 1.7x and is not re-made.
 *
 * The wizard has a sheet too (made the same way from the code rig's design), recoloured per seat from px.ts TEAMS when
 * it loads: its robe and hat are keyed by hue (crimson), its trim by gold. Gathering (prep) loops a raised-hands clip,
 * a Force cast holds the push clip at its full stretch. ?wizsprite=0 keeps the wizard's code rig; the detailed drawing
 * (hd) always does.
 */
import { Texture } from 'pixi.js';
import { HEIGHT, CELL_H, CELL_W, FEET_X, FEET_Y, SPRITES_ON, type Anchors, type RigState } from './rigs';
import type { Frame } from './actors';
import { LIVE3D_ON, PX_PER_UNIT, liveFrame, liveMeta, type LivePose } from './live3d';
import * as X from './px';
import { GUARD, GUARD_NAME, N_EL, elementName } from '@wizard-sim/sim';
import { optOn } from '../dev-options';

interface Move { row: number; n: number }
interface SheetMeta { cell: [number, number]; cols?: number; feet: [number, number]; height: number; dirs: string[]; fps: number; moves: Record<string, Move>; attacks?: { hit: number }[]; casts?: Record<string, { hit: number }> }
interface Attack extends Move { hit: number }
interface Sheet { meta: SheetMeta; img: HTMLImageElement | null; attacks: Attack[]; seats?: HTMLCanvasElement[] }

/** The wizard's sprite (on with the warband's unless ?wizsprite=0). */
const WIZ_SPRITE = SPRITES_ON && optOn('wizsprite');

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
  // players' wizards (seats 0..3); the drill yard's students (pal 4 on) keep their code rigs and robes
  if (s.kind === 'wizard') return WIZ_SPRITE && !s.hd && s.pal < 4 && sheets.has('wizard') ? 'wizard' : null;
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
    // the spell flows (queuing runes plays nothing)
    const c = M.cast, hit = sh.meta.casts?.cast?.hit ?? 0, held = c ? hit + Math.floor((c.n - 1 - hit) / 2) : 0;
    if (c && s.cast > 0) return [c, Math.round(held * Math.min(1, s.cast))];
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
  // a long move wraps into further bands of 8 direction rows (pack.py): frame f at column f % cols; the wizard's
  // sheet in its seat's colours
  const cols = sh.meta.cols ?? Infinity, col = f % cols, band = Math.floor(f / cols);
  x.drawImage(sh.seats?.[seat % sh.seats.length] ?? sh.img!, col * cw, (m.row + dir + 8 * band) * ch, cw, ch, FEET_X - fx, FEET_Y - fy, cw, ch);
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
/** A wizard's one-shot starts this long (s) before its release, so the game's instant cast gets a moment's wind-up. */
export const SHOT_LEAD = 0.2;
/** A one-shot's wind-up kept before its release (s of clip): a longer one (the lash, the bow's draw) starts this far back. */
const SHOT_WIND = 0.5;
/** Moves with their own timing: the bow's draw keeps a second of clip and has its release this long after the game's. */
const SHOT_TIMING: Record<string, { wind: number; lead: number; after: number }> = {
  shoot: { wind: 1, lead: 0.35, after: 2 }, thrust: { wind: SHOT_WIND, lead: SHOT_LEAD, after: 3 }, lash: { wind: 0.6, lead: SHOT_LEAD, after: 2.5 },
};
const SHOT_DEFAULT = { wind: SHOT_WIND, lead: SHOT_LEAD, after: 1 };
/** How much faster than the clip's own pace a move plays once released (the thrust's long pause and return are sped up: the user, 2026-11-20, "too long of a recovery"). */
const shotRate = (move: string): number => (SHOT_TIMING[move] ?? SHOT_DEFAULT).after;
/** A one-shot's first moments ease in from the standing pose over this many seconds, so the body doesn't snap into the clip. */
const SHOT_EASE = 0.1;
/** The clip a conjured weapon's blow plays: the sword, maul and focus swing, the whip lashes, the bow draws and looses, the staff, spear and trident jab (the staff's overhead swing went through the hat). */
const blowOf = (prop: string | undefined): string => prop === 'sword' || prop === 'earthmaul' || prop === 'focus' ? 'attack0' : prop === 'whip' ? 'lash' : prop === 'icebow' ? 'shoot' : 'jab';
/**
 * Movesets: a blow played as a cut-down path through its clip, then a held ready pose (the user, 2026-11-20: "I'm
 * expecting more of a jab movement", "if you are repeating jabs, the character may stay hunched over with the spear in a
 * forward position"). `path` is [s after the game's blow, clip s] keys, played straight between (the jab clip's own hold,
 * 0.75 to 1.1 s, is skipped); `ready` is the clip time held for `linger` s after, so the next jab starts from it and a
 * cast or the standing pose is eased into from it (live3d blendPose). `hl` is the half-life of the ease back to standing.
 */
const MOVESETS: Record<string, { path: readonly (readonly [number, number])[]; ready: number; linger: number; hl: number; turn?: number; slide?: readonly (readonly [number, number])[] }> = {
  // the jab (Meshy text-to-motion, 2026-11-20 round 2: the first jab clip pushed up and 55° right, with the hands side by
  // side, so it read as a spell cast off to the side): a right-handed thrust, the right shoulder driving through, the
  // hand 1.5 units out at 0.75 s, 49° left of the body's facing (scripts/clip-paths.mjs). `turn` squares it to the facing,
  // which also makes the ready stance (0.25 s, drawn back) left shoulder forward, as a spearman stands
  jab: { path: [[0, 0.25], [0.1, 0.7], [0.16, 0.95], [0.4, 1.55]], ready: 0.25, linger: 0.8, hl: 0.09, turn: 49 },
};
/** Clip time on a moveset's path `s` seconds after the blow (clamped to its ends). */
export function pathTime(path: readonly (readonly [number, number])[], s: number): number {
  if (s <= path[0][0]) return path[0][1];
  for (let k = 1; k < path.length; k++) {
    const [s1, t1] = path[k];
    if (s <= s1) { const [s0, t0] = path[k - 1]; return t0 + ((s - s0) / (s1 - s0)) * (t1 - t0); }
  }
  return path[path.length - 1][1];
}
/** After a moveset's ready stance, its shaft is lifted back to the carry over this many seconds. */
const SHAFT_LIFT = 0.6;
/** The half-life (s) of the wizard's blended transitions (live3d blendPose); a moveset's settle sets its own. */
const BLEND_HL = 0.05;
/**
 * Where a one-shot's clip is `shotT` seconds after the game's release: the wind-up (from `first`, or SHOT_WIND before the
 * release) runs sped up to meet the release SHOT_LEAD later, then the clip plays on at its own pace.
 */
export function shotClipTime(o: { first: number; hit: number }, shotT: number, move = ''): number {
  const { wind, lead, after } = SHOT_TIMING[move] ?? SHOT_DEFAULT;
  const start = Math.max(o.first, o.hit - wind);
  return shotT >= lead ? o.hit + (shotT - lead) * after : start + (o.hit - start) * (shotT / lead);
}
/** The staff's blow takes the staff firmly over GRIP_IN (s) and lets it settle upright over GRIP_OUT as the blow ends. */
const GRIP_IN = 0.12, GRIP_OUT = 0.35;
/** Blocking (livePose): the guard clip eases in over BLOCK_IN s and plays GUARD_RATE times fast to GUARD_HOLD of its length, held there. */
const BLOCK_IN = 0.12, GUARD_HOLD = 0.75, GUARD_RATE = 2.5;
const smooth01 = (x: number) => { const k = Math.min(1, Math.max(0, x)); return k * k * (3 - 2 * k); };

/** Each conjured weapon's 3D prop (tools/sprites-3d/wizprops.py), by element; Life (glowing hands) and the wand have none. */
export const WEAPON_PROP: Record<string, string> ={ fire: 'sword', earth: 'earthmaul', arcane: 'focus', ice: 'icebow', cold: 'frostspear', lightning: 'whip', water: 'trident' };
/**
 * The wizard's props to show: its conjured weapon's in place of the staff (none for a wand or Life's bare hands, which
 * are drawn in 2D), and its guard's on the forearm (GUARD_NAME is the prop's name).
 */
function wizardProps(s: RigState): string[] {
  const wp = s.weapon >= 1 && s.weapon <= N_EL ? WEAPON_PROP[elementName(s.weapon)] : undefined, gp = s.guard ? GUARD_NAME[s.guard] : undefined;
  return [...(wp ? [wp] : s.bare ? [] : ['staff']), ...(gp ? [gp] : [])];
}
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
  // a moving body's legs under a move that drives its upper body (the wizard casts while walking)
  const under = s.spd > 0 ? { legs, tl: step(legs) } : {};
  // after a one-shot's last frame its pose eases into the legs (or the standing pose) over BLEND
  const after = (move: string, last: number, over: number, extra: Partial<LivePose> = {}): LivePose | null => {
    if (over < 0 || over >= BLEND) return null;
    const k = over / BLEND;
    return { move, t: last, face, flash, ...extra, move2: s.spd > 0 ? legs : 'walk', t2: s.spd > 0 ? step(legs) : 0, w2: k * k * (3 - 2 * k) };
  };
  if (s.dead > 0) return { move: 'death', t: dur('death') * Math.min(1, s.dead), face, flash, ...(s.kind === 'wizard' ? { props: wizardProps(s) } : {}) };
  // the wizard's changes of move blend from the pose on screen (live3d blendPose); `settle` (a moveset's ready pose let go) eases slower
  let settle = 0, lift: number | undefined;
  if (s.kind === 'wizard') { const p = wizardPose(); return { ...p, hl: settle || BLEND_HL, ...(lift !== undefined && p.aim === undefined ? { aim: lift } : {}) }; }
  function wizardPose(): LivePose {
    const seat = X.TEAMS[s.pal % X.TEAMS.length], c = meta.casts?.cast, props = wizardProps(s);
    // a moveset's blow (the jab): its path through the clip, then the ready pose held for its linger unless a cast or a
    // block takes over; the shaft points along the facing throughout
    const set = s.shot === 1 ? MOVESETS[blowOf(props[0])] : undefined;
    if (set && s.shotT >= 0 && meta.clips[blowOf(props[0])]) {
      const move = blowOf(props[0]), end = set.path[set.path.length - 1][0];
      if (s.shotT < end) return { move, t: pathTime(set.path, s.shotT), face, flash, seat, grip: 1, aim: 1, props, turn: set.turn, ...under, ...(set.slide ? { slide: pathTime(set.slide, s.shotT) } : {}) };
      if (s.shotT < end + set.linger && !(s.cast > 0) && !(s.block > 0)) return { move, t: set.ready, face, flash, seat, grip: 1, aim: 1, props, turn: set.turn, ...under };
      if (s.shotT < end + set.linger + 1 && !(s.cast > 0) && !(s.block > 0)) {
        settle = set.hl;
        // the body settles fast, but the shaft is lifted back to the carry over SHAFT_LIFT: at the blend's pace a long
        // shaft swung up through the air like a second blow (the user, 2026-11-20: "a second slice towards the sky")
        lift = 1 - smooth01((s.shotT - end - set.linger) / SHAFT_LIFT);
      }
    }
    // a one-shot (a weapon's blow, an Area or Self cast) plays its whole wind-up, squeezed into the SHOT_LEAD between the
    // game's release and the body's (shotClipTime), easing in from the standing pose, over the legs if the wizard walks
    // on, then eases back (the user, 2026-11-20: "the game skips the first part of the animation, so there's no wind up")
    if (s.shot && !set) {
      const move = s.shot === 1 ? blowOf(props[0]) : s.shot === 2 ? 'area' : 'self';
      const a = meta.attacks[0], o = move === 'attack0' ? (a ? { first: a.first, hit: a.hit, last: a.last } : undefined) : meta.casts?.[move];
      if (o && s.shotT >= 0) {
        const t = shotClipTime(o, s.shotT, move), standing = s.spd > 0 ? legs : 'walk';
        // the staff's blow grips the staff firmly (it swings with the hand) and lets it settle upright again after
        const grip = s.shot === 1 ? smooth01(s.shotT / GRIP_IN) * smooth01((o.last + BLEND - t) / GRIP_OUT) : undefined;
        const into = 1 - smooth01(s.shotT / SHOT_EASE);
        const aim = move === 'thrust' ? grip : undefined;   // the shaft thrusts along the facing, not along the hand's tilt
        if (t <= o.last) return { move, t, face, flash, seat, grip, aim, props, ...under, ...(into > 0 ? { move2: standing, t2: s.spd > 0 ? step(legs) : 0, w2: into } : {}) };
        const out = after(move, o.last, (t - o.last) / shotRate(move), { seat, grip, aim, props, ...under });
        if (out) return out;
      }
    }
    // Blocking: the guard raised (round 3, the user: "some defend animation where the character uses the shield"). The tower
    // guards (Bulwark, Spike kite) brace behind theirs in a crouch; the rest hold theirs across the chest (Meshy text-to-
    // motion clips: the library's boxing guards held it up under the hat brim). Each plays fast to its held pose and
    // stays there, easing in over BLOCK_IN, over the legs if the wizard walks while blocking.
    if (s.block > 0 && s.guard && meta.clips.block) {
      const tower = (s.guard === GUARD.bulwark || s.guard === GUARD.spike) && !!meta.clips.brace, mv = tower ? 'brace' : 'block', d = dur(mv), sec = s.block / 60;
      const t = Math.min(d * GUARD_HOLD, sec * GUARD_RATE), k = Math.min(1, sec / BLOCK_IN);   // up fast, then held
      const e = k * k * (3 - 2 * k);
      return { move: mv, t, face, flash, seat, props, ...under, move2: s.spd > 0 ? legs : 'walk', t2: s.spd > 0 ? step(legs) : 0, w2: 1 - e, guardUp: e };
    }
    // a Force cast: the push clip into its full stretch (halfway from the release to the clip's end), held while the
    // spell flows. Queuing runes plays nothing: the body only casts when the spell goes off (the user, 2026-11-17).
    if (c && s.cast > 0) { const held = c.hit + (c.last - c.hit) / 2; return { move: 'cast', t: c.first + (held - c.first) * Math.min(1, s.cast), face, flash, seat, props, ...under }; }
    if (s.spd > 0) return { move: legs, t: step(legs), face, flash, seat, props };
    return { move: 'walk', t: 0, face, flash, seat, props };
  }
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
    // past its last frame (a clip cut short, like the shieldbearer's thrust): ease into the legs instead of snapping
    const out = w2 < 1 ? after(a.clip, a.last, t - a.last) : null;
    if (out) return out;
  }
  if (s.spd > 0) return { move: legs, t: step(legs), face, flash };
  return { move: 'walk', t: 0, face, flash };
}

/** The pose the game shows for a wizard in rig state `s` (the Model Viewer's game sequences play it). */
export const wizardLivePose = (s: RigState): LivePose => livePose('wizard', s, 0);

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
  const lm = LIVE3D_ON ? liveMeta(slug) : undefined;
  if (lm && sh) {
    const px = lm.height ? lm.height * PX_PER_UNIT : sh.meta.height;
    const live = liveFrame(slug, livePose(slug, s, who), stretch(rigAnchors, px / HEIGHT[s.kind]), who);
    if (live) return live;
  }
  load();
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
  const key = d.slug + '|0|' + m.row + '|' + d.dir + '|' + f + '|0';
  let fr = cache.get(key);
  if (!fr) { fr = compose(sh, m, d.dir, f, false, rigAnchors); cache.set(key, fr); }
  const fade = td - play - DEATH_HOLD;
  return { f: fr, alpha: fade > 0 ? Math.max(0, 1 - fade / DEATH_FADE) : 1 };
}
export const deathDir = dirOf;
