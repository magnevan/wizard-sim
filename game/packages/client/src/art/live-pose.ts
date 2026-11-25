/**
 * What a live 3D model shows for a body's rig state (art/rigs.ts RigState): the move, its clip time, the second clip
 * blended in, the legs under it, the props shown and how they are held. The wizard's move sets (a blow's path through
 * its clip, the ready stance, the maul's arcs), one-shots squeezed onto the game's release, blocking, the Force cast; an
 * enemy's attack with its contact frame on the game's hit. Moved out of art/sprites.ts for the port to 3D, so the pixel
 * path (sprites.ts spriteFrame) and the 3D view (view3d/bodies.ts) choose poses the same way. No Pixi.
 */
import type { RigState } from './rigs';
import { liveMeta, type LivePose } from './model-pose';
import * as X from './px';
import { GUARD, GUARD_NAME, N_EL, elementName, twoHanded } from '@wizard-sim/sim';

const TAU = Math.PI * 2;

/**
 * An attack variant, picked afresh for each swing: a hash of the body and the swing's hit tick, so it holds through one
 * attack, differs between neighbours, and survives a rollback re-simulation. Purely cosmetic; enemies whose attacks
 * differ in what they do should have the sim choose instead.
 */
export function variantOf(who: number, swing: number, n: number): number {
  if (n < 2) return 0;
  let h = Math.imul(who + 1, 0x9e3779b1) ^ Math.imul(swing, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); h ^= h >>> 12;
  return (h >>> 0) % n;
}

/** After an attack's hit: its follow-through plays this long before a moving body's legs take over, over BLEND (s). */
const FOLLOW = 0.25, BLEND = 0.3;
/** A wizard's one-shot starts this long (s) before its release, so the game's instant cast gets a moment's wind-up. */
export const SHOT_LEAD = 0.2;
/** A one-shot's wind-up kept before its release (s of clip): a longer one (the lash, the bow's draw) starts this far back. */
const SHOT_WIND = 0.5;
/** Moves with their own timing: the bow's draw keeps a second of clip and has its release this long after the game's. */
const SHOT_TIMING: Record<string, { wind: number; lead: number; after: number }> = {
  // the lash keeps its whole wind-up (from 0.125 s: the hand drawn back behind the shoulder by 0.63, raised overhead
  // by 1.0, cracked forward at 1.125; clip-paths.mjs), so the strand is seen going out behind first (#6)
  shoot: { wind: 1, lead: 0.35, after: 2 }, thrust: { wind: SHOT_WIND, lead: SHOT_LEAD, after: 3 }, lash: { wind: 1, lead: 0.3, after: 2.5 },
  bolt: { wind: SHOT_WIND, lead: 0.12, after: 1.6 },
};
const SHOT_DEFAULT = { wind: SHOT_WIND, lead: SHOT_LEAD, after: 1 };
/** Seconds from the game's release of a one-shot to the body's (its clip's hit): the whip's strand cracks on it. */
export const shotLead = (move: string): number => (SHOT_TIMING[move] ?? SHOT_DEFAULT).lead;
/** How much faster than the clip's own pace a move plays once released (the thrust's long pause and return are sped up: the user, 2026-11-20, "too long of a recovery"). */
const shotRate = (move: string): number => (SHOT_TIMING[move] ?? SHOT_DEFAULT).after;
/** A one-shot's first moments ease in from the standing pose over this many seconds, so the body doesn't snap into the clip. */
const SHOT_EASE = 0.1;
/**
 * The clip a conjured weapon's blow plays: the sword swings, the maul smashes, the whip lashes, the bow draws and looses,
 * the Arcane wand (the focus) flicks its bolt out (#7: it had borrowed the sword's slash, and its light bolt played
 * nothing), the staff, spear and trident jab (the staff's overhead swing went through the hat).
 */
const blowOf = (prop: string | undefined): string => prop === 'earthmaul' ? 'smash' : prop === 'sword' ? 'attack0' : prop === 'focus' ? 'bolt' : prop === 'whip' ? 'lash' : prop === 'icebow' ? 'shoot' : 'jab';
/**
 * Movesets: a blow played as a cut-down path through its clip, then a held ready pose (the user, 2026-11-20: "I'm
 * expecting more of a jab movement", "if you are repeating jabs, the character may stay hunched over with the spear in a
 * forward position"). `path` is [s after the game's blow, clip s] keys, played straight between (the jab clip's own hold,
 * 0.75 to 1.1 s, is skipped); `ready` is the clip time held for `linger` s after, so the next jab starts from it and a
 * cast or the standing pose is eased into from it (live3d blendPose). `hl` is the half-life of the ease back to standing.
 */
/**
 * A maul's swing (round 9, the user, 2026-11-21: "the hand movements are better, but the maul doesnt swing around like
 * youd expect a maul to do"): the haft along the arms only turned as far as they did, at their pace. A heavy head lags:
 * it drops behind the back as the hands go up, then whips over far faster than they move and slams down. So the haft
 * follows keys on the clip's time, [clip s, elevation degrees (0 level ahead, 90 straight up, past 90 back over the
 * shoulders), sideways degrees (to the wielder's right)], both measured from the facing (the strike's line after `turn`).
 * The smash (attack-maul.glb: the hands top out at 0.7 s and strike at 0.9): raised, cocked 205° (the head behind the
 * back), whipped over in 0.1 clip s to 38° below level, the head on the ground ahead, and it rests there.
 */
const SMASH_ARC = [[0.1, 70, 0], [0.4, 120, 10], [0.6, 170, -35], [0.72, 200, -40], [0.8, 135, -15], [0.86, 40, 0], [0.9, -38, 0], [1.75, -38, 0]] as const;
/**
 * The flat swing (attack-maul-swing.glb: the hands right at 0.3 s, across the front at 0.5, left by 0.7, the chest
 * following through 110°): the head held out right, lagging back behind as the hands start across, then whipped
 * round through the front (the hit) and on round to the left, settling down ahead.
 */
const SWING_ARC = [[0.15, 15, 90], [0.32, 5, 150], [0.45, 0, 70], [0.52, -5, 0], [0.62, -10, -80], [0.8, -20, -125], [1.1, -32, -80], [1.6, -38, 10]] as const;
const MOVESETS: Record<string, { path: readonly (readonly [number, number])[]; ready: number; linger: number; hl: number; turn?: number; spin?: number; slide?: readonly (readonly [number, number])[]; free?: boolean; haft?: number; arc?: readonly (readonly [number, number, number])[]; raise?: boolean; coil?: number; clip?: string }> = {
  // the maul, two-handed (attack-maul.glb, round 8: raised over the right shoulder by 0.7 s, then struck out with the
  // arms extended at waist height at 0.9, the back kept straight, 55° left of the facing, so turned by that; the first
  // smash, now spare-maul-crouch.glb, folded the body double with the fists on the ground, the user: "looks like the
  // character slamming the ground with his fist"). The Strike winds up from the carry, the blow landing 0.3 s in; a
  // held Heavy keeps it raised (`coil`, the clip time held while charging), its release a bigger smash; the Sweep holds
  // the swing's mid-point out level while the body turns once. Strikes in quick succession go on through a combo.
  // The haft swings on its own arc (`arc`, SMASH_ARC), the head lagging and then whipping over.
  smash: { path: [[0, 0.1], [0.2, 0.66], [0.3, 0.9], [0.45, 1.0], [0.8, 1.75]], ready: 1.75, linger: 0.3, hl: 0.1, turn: 55, free: true, coil: 0.7, arc: SMASH_ARC },
  // the combo's second blow: a flat swing across from right to left (attack-maul-swing.glb, the hands crossing the
  // front at 0.5 s), then the next Strike smashes again
  smashCombo1: { path: [[0, 0.15], [0.15, 0.32], [0.3, 0.55], [0.45, 0.78], [0.8, 1.6]], ready: 1.6, linger: 0.3, hl: 0.1, turn: 0, free: true, arc: SWING_ARC, clip: 'swing' },
  smashHeavy: { path: [[0, 0.7], [0.12, 0.92], [0.45, 1.05], [0.8, 1.75]], ready: 1.75, linger: 0, hl: 0.12, turn: 55, free: true, arc: SMASH_ARC },
  smashSweep: { path: [[0, 0.7], [0.06, 0.86], [0.3, 0.88], [0.5, 1.6]], ready: 1.75, linger: 0, hl: 0.12, turn: 55, free: true, haft: 0.2, spin: 0.42 * 0.7 },
  // the bow (Archery Shot, release at 3.25 s): a shot from the drawn pose, then held drawn for `linger`, and drawn
  // whenever the aim is on an enemy in range (`raise`, RigState.aimed), so the instant shot finishes a short release
  // instead of firing before the bow is up (the user, 2026-11-20). `free`: the bow keeps its own hold (no shaft aim).
  // The clip's 90° side-on turn is on the hips (`turn`), so it eases in and out instead of snapping (export --yaw).
  shoot: { path: [[0, 3.1], [0.05, 3.3], [0.3, 3.65]], ready: 3.15, linger: 1, hl: 0.1, turn: 90, free: true, raise: true },
  // the Heavy (RigState.blow 1; the user, 2026-11-20: "I'd expect just pulling back and standing in a ready to jab
  // position, followed by maybe a more emphasized jab and just returning to normal"): held, the ready stance coiling
  // (COIL); released, the jab lunges and holds its full reach, then straight back to standing (no ready hold)
  jabHeavy: { path: [[0, 0.25], [0.08, 0.75], [0.35, 0.95], [0.6, 1.55]], ready: 0.25, linger: 0, hl: 0.12, turn: 49 },
  // the Sweep (blow 2): the jab's reach held while the whole body turns once (`spin` s, as the 2D ring's head,
  // view-structures mv-sweep), so the ring is the trident's own path (the user: "a phantom trident sweep around you")
  jabSweep: { path: [[0, 0.25], [0.06, 0.7], [0.3, 0.75], [0.5, 1.55]], ready: 0.25, linger: 0, hl: 0.12, turn: 49, spin: 0.42 * 0.7 },
  // the jab (Meshy text-to-motion, 2026-11-20 round 2: the first jab clip pushed up and 55° right, with the hands side by
  // side, so it read as a spell cast off to the side): a right-handed thrust, the right shoulder driving through, the
  // hand 1.5 units out at 0.75 s, 49° left of the body's facing (scripts/clip-paths.mjs). `turn` squares it to the facing,
  // which also makes the ready stance (0.25 s, drawn back) left shoulder forward, as a spearman stands
  jab: { path: [[0, 0.25], [0.1, 0.7], [0.16, 0.95], [0.4, 1.55]], ready: 0.25, linger: 0.8, hl: 0.09, turn: 49 },
};
/** A Strike within COMBO_GAP s of the end of the last one's recovery (ARMS.strikeRecovery) moves its combo on, through COMBO_LEN blows (MOVESETS `Combo`n). */
export const COMBO_GAP = 0.5, COMBO_LEN = 2;
/** A Strike's place in its combo (RigState.combo), from the last one's place, the seconds since it and its weapon's Strike recovery (view.ts and the Model Viewer both use this). */
export const comboNext = (last: number, since: number, recovery: number): number => (since < recovery + COMBO_GAP ? (last + 1) % COMBO_LEN : 0);
/** A maul's haft at clip time `t` on its arc's keys (SMASH_ARC): [elevation, sideways] degrees, straight between keys, held past the ends. */
export function arcAt(arc: readonly (readonly [number, number, number])[], t: number): [number, number] {
  if (t <= arc[0][0]) return [arc[0][1], arc[0][2]];
  for (let k = 1; k < arc.length; k++) {
    const b = arc[k];
    if (t <= b[0]) { const a = arc[k - 1], u = (t - a[0]) / (b[0] - a[0]); return [a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u]; }
  }
  const z = arc[arc.length - 1];
  return [z[1], z[2]];
}
/** Clip time on a moveset's path `s` seconds after the blow (clamped to its ends). */
export function pathTime(path: readonly (readonly [number, number])[], s: number): number {
  if (s <= path[0][0]) return path[0][1];
  for (let k = 1; k < path.length; k++) {
    const [s1, t1] = path[k];
    if (s <= s1) { const [s0, t0] = path[k - 1]; return t0 + ((s - s0) / (s1 - s0)) * (t1 - t0); }
  }
  return path[path.length - 1][1];
}
/** A Heavy held: the body turns this many degrees further side-on than the ready stance, by half charge. */
const COIL = 25;
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
export function livePose(slug: string, s: RigState, who: number): LivePose {
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
  // standing and turning on the spot: the walk's legs at the turn steps' phase under the standing body (#3)
  const turnSteps = s.spd === 0 && s.turnPh > 0 ? { legs: 'walk', tl: s.turnPh * dur('walk') } : {};
  // after a one-shot's last frame its pose eases into the legs (or the standing pose) over BLEND
  const after = (move: string, last: number, over: number, extra: Partial<LivePose> = {}): LivePose | null => {
    if (over < 0 || over >= BLEND) return null;
    const k = over / BLEND;
    return { move, t: last, face, flash, ...extra, move2: s.spd > 0 ? legs : 'walk', t2: s.spd > 0 ? step(legs) : 0, w2: k * k * (3 - 2 * k) };
  };
  if (s.dead > 0) return { move: 'death', t: dur('death') * Math.min(1, s.dead), face, flash, ...(s.kind === 'wizard' ? { props: wizardProps(s) } : {}) };
  // the wizard's changes of move blend from the pose on screen (live3d blendPose); `settle` (a moveset's ready pose let go) eases slower
  let settle = 0, lift: number | undefined;
  if (s.kind === 'wizard') {
    const p = wizardPose();
    // a two-handed weapon (the bow, the maul) carries the guard on its back
    return { ...p, infuse: s.infuse, hl: settle || BLEND_HL, ...(lift !== undefined && p.aim === undefined ? { aim: lift } : {}), ...(s.guard && twoHanded(s.weapon) ? { sling: 1 } : {}) };
  }
  function wizardPose(): LivePose {
    const seat = X.TEAMS[s.pal % X.TEAMS.length], c = meta.casts?.cast, props = wizardProps(s);
    // a moveset's blow (the jab): its path through the clip, then the ready pose held for its linger unless a cast or a
    // block takes over; the shaft points along the facing throughout
    const base = blowOf(props[0]), own = MOVESETS[base] && meta.clips[base];
    // `free`: the weapon keeps the hand's own hold (no shaft aim); `arc`: a maul's haft on its swing's keys at clip time
    // `t` (LivePose.arc); `haft`: a two-hander's haft out along the arms, leaned down by it (LivePose.haft)
    const free = (m: { free?: boolean; haft?: number; arc?: readonly (readonly [number, number, number])[] }, t: number) =>
      (m.arc ? { arc: arcAt(m.arc, t) } : m.haft !== undefined ? { haft: m.haft } : m.free ? {} : { aim: 1 });
    const busy = s.cast > 0 || s.block > 0;
    // a Heavy held: the ready stance, the body coiling further round as it charges
    if (own && s.charge > 0 && !busy) {
      const r = MOVESETS[base];
      return { move: base, t: r.coil ?? r.ready, face, flash, seat, grip: 1, ...free(r, r.coil ?? r.ready), props, turn: (r.turn ?? 0) + COIL * smooth01(s.charge * 2), ...under };
    }
    const kind = s.blow === 1 ? 'Heavy' : s.blow === 2 ? 'Sweep' : s.combo ? 'Combo' + s.combo : '';
    const pick = s.shot === 1 ? MOVESETS[base + kind] : undefined;
    const set = s.shot === 1 ? (pick && meta.clips[pick.clip ?? base] ? pick : MOVESETS[base]) : undefined;
    let settling = false;
    if (set && s.shotT >= 0 && own) {
      const move = set.clip ?? base, end = set.path[set.path.length - 1][0];
      // a Sweep turns the body once round, the way the ring goes (against the clock on screen)
      const spun = set.spin && s.shotT < set.spin ? face - TAU * smooth01(s.shotT / set.spin) : face;
      if (s.shotT < end) return { move, t: pathTime(set.path, s.shotT), face: spun, flash, seat, grip: 1, ...free(set, pathTime(set.path, s.shotT)), props, turn: set.turn, ...under, ...(set.slide ? { slide: pathTime(set.slide, s.shotT) } : {}) };
      if (s.shotT < end + set.linger && !busy) return { move, t: set.ready, face, flash, seat, grip: 1, ...free(set, set.ready), props, turn: set.turn, ...under };
      if (s.shotT < end + set.linger + 1 && !busy) {
        settle = set.hl; settling = true;
        // the body settles fast, but the shaft is lifted back to the carry over SHAFT_LIFT: at the blend's pace a long
        // shaft swung up through the air like a second blow (the user, 2026-11-20: "a second slice towards the sky")
        if (!set.free) lift = 1 - smooth01((s.shotT - end - set.linger) / SHAFT_LIFT);
      }
    }
    // the bow held drawn while the aim is on an enemy in range (view.ts `aimed`)
    if (own && MOVESETS[base].raise && s.aimed && !busy) {
      const r = MOVESETS[base];
      return { move: base, t: r.ready, face, flash, seat, grip: 1, ...free(r, r.ready), props, turn: r.turn, ...under };
    }
    if (own && MOVESETS[base].raise && !settling && !busy) settle = MOVESETS[base].hl;   // lowered at the stance's pace too
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
    return { move: 'walk', t: 0, face, flash, seat, props, ...turnSteps };
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
  return { move: 'walk', t: 0, face, flash, ...turnSteps };
}

/** The pose the game shows for a wizard in rig state `s` (the Model Viewer's game sequences play it). */
export const wizardLivePose = (s: RigState): LivePose => livePose('wizard', s, 0);

/** A multiply tint for a model's statuses (the code rigs paint them on the body): on a Pixi sprite, or into the 3D materials. */
export function statusTint(s: RigState): number {
  if (s.frozen > 0) return 0x8fd0ff;
  if (s.shock) return 0xfff2a0;
  if (s.burn > 0) return s.burnF & 1 ? 0xffb070 : 0xff9a60;
  if (s.wet > 0) return 0xa8c4ff;
  if (s.chill > 0) return 0xd0e6ff;
  return 0xffffff;
}
