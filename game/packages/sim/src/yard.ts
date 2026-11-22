/**
 * The drill yard (docs/campaign/01-opening, beats 2 and 3): the crash course in fighting, as stations along one worn
 * path through a real place (the level: tools/segments/01-opening/yard-level.py). Nothing is a gate but the last: each
 * station wakes as you walk up to it, its keys show while you're there and it isn't done, and you can always walk on
 * (a returning player gets through by walking). The way out north waits for a charged focus from the rack.
 *
 *   WALK     move (done once anyone has walked a few units from where they started)
 *   STRIKE   knock down the straw goblins in the lanes (they stand back up a while after)
 *   HEAVY    shove the sack into the chalk ring with a Heavy
 *   RETREAT  a hired soldier with a mallet slams; hop out of two
 *   PARRY    a soldier at the end of the lane shoots blunt bolts; send one back (a training buckler is yours there)
 *   HANDS    four straw goblins, animated, rush whoever steps into the ring; Sweep catches them all (again once cleared)
 *   FOCUS    Use at the rack: a focus charged from the academy's store, one Fire and one Sigil and no regen; the flame
 *            sword is the lesson (beat 3). Use again for a fresh charge.
 *   GATE     with a focus taken, the north gate: the party leaves for the battery (Mode.leaveTo).
 *
 * A station that acts on you (the slam, the bolts, the rush) waits until someone has stood in it for YARD.ready, so
 * you see it and its keys first. The sparring soldiers can't be beaten and never leave their station: with nobody there they wait at their spot
 * (EnemyRules.restAt). Nobody dies here: no encounter runs (enc.state[0] stays 0), so a wizard at 0 hp gets up whole
 * (effects.ts tickHealth), and lies still a moment first (below).
 *
 * Spots are the level's Markers, by id: straw-0..3, heavy, heavy-ring, retreat, parry, parry-home, hands, hands-in-0..3,
 * focus, gate. Everything is state in w.yard and runs inside step(), so it rolls back and replays like the rest.
 */
import { ARCH } from './archetypes';
import { ARMS, SHAPES, T } from './config';
import { EL, N_EL } from './elements';
import { len } from './geom';
import { conjureGuard } from './guards';
import { BTN, type PlayerInput } from './input';
import { markerOf, type MarkerDef } from './room';
import { spawnEnemy } from './spawn';
import { EV, KIND, MAX_BODIES, MAX_SEATS, type World, type Yard } from './world';
import type { Checkpoint } from './mode';

/** The stations, in path order: a bit each in YS.done. */
export const YST = { walk: 0, strike: 1, heavy: 2, retreat: 3, parry: 4, hands: 5, focus: 6 } as const;
export const N_YST = 7;
/** w.yard.state slots. */
export const YS = {
  done: 0,
  /** HEAVY: a Heavy has been swung near the sack. */
  heavy: 1,
  /** RETREAT: slams dodged in a row. */
  dodged: 2,
  /** PARRY: bolts sent back. */
  parried: 3,
  /** HANDS: 0 ready, 1 out, 2 cleared (ready again once nobody is near). */
  hands: 4,
  /** STRIKE: ticks until the fallen straw goblins stand again (0: none down / not counting). */
  strikeT: 5,
  /** 1: the party is leaving through the gate. */
  leave: 6,
  /** Set up (the first tick lays the yard out). */
  laid: 7,
  /** Ticks someone has stood in the slam ring, the parry lane, the hands ring: a station acts only after YARD.ready. */
  ringT: 8, laneT: 9, handsT: 10,
} as const;
const YS_LEN = 11;
/** What a body is to the yard. */
export const YTAG = { none: 0, straw: 1, sack: 2, mallet: 3, bow: 4, goblin: 5 } as const;

export const YARD = {
  /** A station is "here" within this of its marker: its keys show, and its soldier fights. */
  near: 8,
  /** WALK is done once anyone is this far from where they started. */
  walked: 5,
  /** The parry lane: how far either side of its line a wizard counts as in it. */
  laneHalf: 4,
  /** The chalk ring's radius. */
  ringR: 1.2,
  /** The hands test's ring: you're in it this near its middle; once cleared, it re-arms when nobody is within `rearm`. */
  ring: 6, rearm: 10,
  /** s before knocked-down straw goblins stand again. */
  strikeBack: 12,
  /** How near the rack Use takes a focus, and the gate the way out. */
  reach: 2.2,
  /** s a wizard lies still after fainting. */
  faint: 1.5,
  /** The training buckler's guard HP, times a Mirror buckler's. */
  buckler: 4,
  /** The charged focus: what it holds. */
  focusFire: 1, focusSigil: 1,
  /**
   * s someone must stand in a station before it acts (the slam, the first bolt, the straw goblins' rush): you see
   * what it does and its keys first, and nothing happens to you just for walking past (the user, 2026-11-22).
   */
  ready: 1.5,
} as const;

export function newYard(): Yard {
  return { state: new Int32Array(YS_LEN), tag: new Uint8Array(MAX_BODIES), focus: new Uint8Array(MAX_SEATS) };
}

const at = (w: World, id: string): MarkerDef | undefined => markerOf(w.def, id);
const wizards = (w: World): number[] => {
  const out: number[] = [];
  for (let s = 0; s < MAX_SEATS; s++) if (w.seats.active[s] && w.bodies.kind[s] === KIND.wizard) out.push(s);
  return out;
};
const near = (w: World, i: number, m: MarkerDef | undefined, r: number): boolean => !!m && len(w.bodies.x[i] - m.x, w.bodies.y[i] - m.y) < r;
/** Is anyone within r of the marker? */
const anyNear = (w: World, id: string, r: number): boolean => { const m = at(w, id); return wizards(w).some((i) => near(w, i, m, r)); };
const tagged = (w: World, tag: number): number[] => {
  const out: number[] = [], b = w.bodies, y = w.yard!;
  for (let i = MAX_SEATS; i < MAX_BODIES; i++) if (b.kind[i] === KIND.enemy && y.tag[i] === tag) out.push(i);
  return out;
};
export const yardDone = (w: World, st: number): boolean => !!w.yard && (w.yard.state[YS.done] & (1 << st)) !== 0;
const finish = (w: World, st: number): void => { w.yard!.state[YS.done] |= 1 << st; };

function spawn(w: World, arch: number, tag: number, m: MarkerDef | undefined, o: Parameters<typeof spawnEnemy>[4] = {}): number {
  if (!m) return -1;
  const i = spawnEnemy(w, arch, m.x, m.y, o);
  if (i >= 0) w.yard!.tag[i] = tag;
  return i;
}
/** The straw goblins in the strike lanes, one a lane (they stand again together, once all four are down). */
function standStraw(w: World): void {
  for (let k = 0; k < 4; k++) spawn(w, ARCH.straw, YTAG.straw, at(w, `straw-${k}`), { face: 0.25 });
}

/** The first tick: the straw goblins, the sack, the two sparring soldiers at their spots. */
function layOut(w: World): void {
  standStraw(w);
  spawn(w, ARCH.straw, YTAG.sack, at(w, 'heavy'), { hp: 999, r: 0.45 });
  spawn(w, ARCH.brute, YTAG.mallet, at(w, 'retreat'), { hp: 99999, r: 0.45, dmg: 0.25, speed: 0.8 });
  spawn(w, ARCH.caster, YTAG.bow, at(w, 'parry-home'), { hp: 99999, r: 0.4, dmg: 0.25 });
  w.yard!.state[YS.laid] = 1;
}

/** The mode's buttons: Use at the rack takes a charged focus (a fresh one each time). */
export function yardPress(w: World, inputs: readonly PlayerInput[]): void {
  const y = w.yard!, s = w.seats, rack = at(w, 'focus');
  for (const i of wizards(w)) {
    const inp = inputs[i];
    if (!inp || !(inp.buttons & ~s.prevButtons[i] & BTN.use) || !near(w, i, rack, YARD.reach)) continue;
    y.focus[i] = 1;
    s.runes[i * N_EL + EL.fire - 1] = YARD.focusFire;
    s.runes[i * N_EL + EL.sigil - 1] = YARD.focusSigil;
    w.events.push({ tick: w.clock[0], kind: 'burst', who: i, x: w.bodies.x[i], y: w.bodies.y[i], amount: 0.5, look: EL.fire, ev: EV.infuse, text: 'focus' });
  }
}

/** Is wizard i in the parry lane (between the shooter's spot and where you stand, near its line)? */
function inLane(w: World, i: number): boolean {
  const a = at(w, 'parry'), b = at(w, 'parry-home');
  if (!a || !b) return false;
  const dx = b.x - a.x, dy = b.y - a.y, L = len(dx, dy) || 1, px = w.bodies.x[i] - a.x, py = w.bodies.y[i] - a.y;
  const along = (px * dx + py * dy) / L, off = Math.abs(px * dy - py * dx) / L;
  return along > -3 && along < L - 4 && off < YARD.laneHalf;
}

/** Who a sparring soldier spars with: the nearest wizard at its station, or -1. */
export function sparTarget(w: World, i: number): number {
  const tag = w.yard?.tag[i] ?? 0;
  if (tag !== YTAG.mallet && tag !== YTAG.bow) return -1;
  const home = at(w, tag === YTAG.mallet ? 'retreat' : 'parry-home');
  let best = -1, bd = Infinity;
  if (w.yard!.state[tag === YTAG.bow ? YS.laneT : YS.ringT] < T(YARD.ready)) return -1;
  for (const s of wizards(w)) {
    if (w.bodies.down[s] > 0) continue;
    if (tag === YTAG.bow ? !inLane(w, s) : !near(w, s, home, YARD.near * 0.75)) continue;
    const d = len(w.bodies.x[s] - w.bodies.x[i], w.bodies.y[s] - w.bodies.y[i]);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

/** Where a sparring soldier waits while nobody is at its station; the shooter shoots from there too. */
export function sparRest(w: World, i: number): [number, number] | undefined {
  const tag = w.yard?.tag[i] ?? 0;
  if (tag !== YTAG.mallet && tag !== YTAG.bow) return undefined;
  if (tag === YTAG.mallet && sparTarget(w, i) >= 0) return undefined;
  if (tag === YTAG.bow && sparTarget(w, i) >= 0) return undefined;
  const m = at(w, tag === YTAG.mallet ? 'retreat' : 'parry-home');
  return m ? [m.x, m.y] : undefined;
}
/** The shooter stands at its end of the lane. */
export function sparStandoff(w: World, i: number): [number, number] | undefined {
  if (w.yard?.tag[i] !== YTAG.bow) return undefined;
  const m = at(w, 'parry-home');
  return m ? [m.x, m.y] : undefined;
}

/** The yard each tick, before nav and the enemies: lay out, the stations' clockwork. */
export function tickYard(w: World): void {
  const y = w.yard!, st = y.state, b = w.bodies;
  if (!st[YS.laid]) layOut(w);
  // how long someone has stood in each station that acts on you (each acts only after YARD.ready)
  const ws = wizards(w).filter((i) => b.down[i] <= 0), cap = T(YARD.ready) + 1;
  const stay = (slot: number, here: boolean) => { st[slot] = here ? Math.min(st[slot] + 1, cap) : 0; };
  stay(YS.ringT, ws.some((i) => near(w, i, at(w, 'retreat'), YARD.near * 0.75)));
  stay(YS.laneT, ws.some((i) => inLane(w, i)));
  stay(YS.handsT, ws.some((i) => near(w, i, at(w, 'hands'), YARD.ring)));
  // HANDS: four straw goblins come at whoever has stepped into the ring
  if (st[YS.hands] === 0 && st[YS.handsT] >= T(YARD.ready)) {
    for (let k = 0; k < 4; k++) spawn(w, ARCH.swarmer, YTAG.goblin, at(w, `hands-in-${k}`), { hp: 6, dmg: 0.25, speed: 0.6 });
    st[YS.hands] = 1;
  } else if (st[YS.hands] === 2 && !anyNear(w, 'hands', YARD.rearm)) st[YS.hands] = 0;
  // STRIKE: knocked-down straw goblins stand again a while later (to try the blade on)
  if (st[YS.strikeT] > 0 && --st[YS.strikeT] === 0) standStraw(w);
  // PARRY: whoever walks into the lane holds a training buckler
  for (const i of wizards(w)) if (inLane(w, i) && !w.seats.guard[i]) { conjureGuard(w, i, new Uint8Array(N_EL)); w.seats.guardHp[i] *= YARD.buckler; }
  void b;
}

/** Last in the step, so the checks see every event of the tick. */
export function lateYard(w: World): void {
  const y = w.yard!, st = y.state, b = w.bodies, ws = wizards(w);
  for (const e of w.events) {
    // a wizard who fainted lies still a moment (they're already up at full hp)
    if (e.kind === 'fizzle' && e.ev === EV.downed && e.who >= 0 && e.who < MAX_SEATS) b.down[e.who] = Math.max(b.down[e.who], T(YARD.faint));
    // RETREAT: the mallet's slams that hit nobody, in a row
    if (e.kind === 'note' && e.ev === EV.slamDone && y.tag[e.who] === YTAG.mallet) st[YS.dodged] = e.amount === 1 ? 0 : st[YS.dodged] + 1;
    // PARRY: a bolt sent back
    if (e.kind === 'move' && e.text === 'parry' && e.who >= 0 && e.who < MAX_SEATS && inLane(w, e.who)) st[YS.parried]++;
    // HEAVY: a Heavy is the staff's long shove (a 'strike' move with the Heavy's longer reach)
    if (e.kind === 'move' && e.text === 'strike' && e.who >= 0 && e.who < MAX_SEATS && (e.amount ?? 0) > (SHAPES.swingRange * (1 + ARMS.heavyReach)) / 2 && near(w, e.who, at(w, 'heavy'), YARD.near)) st[YS.heavy] = 1;
  }
  if (!yardDone(w, YST.walk)) for (let i = 0; i < MAX_SEATS; i++) if (ws.includes(i) && len(b.x[i] - w.def.starts[i][0], b.y[i] - w.def.starts[i][1]) > YARD.walked) finish(w, YST.walk);
  if (!tagged(w, YTAG.straw).length) { finish(w, YST.strike); if (!st[YS.strikeT]) st[YS.strikeT] = T(YARD.strikeBack); }
  const sack = tagged(w, YTAG.sack)[0], ring = at(w, 'heavy-ring');
  if (st[YS.heavy] && sack !== undefined && ring && len(b.x[sack] - ring.x, b.y[sack] - ring.y) < YARD.ringR) finish(w, YST.heavy);
  if (st[YS.dodged] >= 2) finish(w, YST.retreat);
  if (st[YS.parried] >= 1) finish(w, YST.parry);
  if (st[YS.hands] === 1 && !tagged(w, YTAG.goblin).length) { st[YS.hands] = 2; finish(w, YST.hands); }
  if (ws.some((i) => y.focus[i])) finish(w, YST.focus);
  // GATE: with a focus taken, anyone at the gate takes everyone on
  if (yardDone(w, YST.focus) && ws.some((i) => near(w, i, at(w, 'gate'), YARD.reach))) st[YS.leave] = 1;
}

/** Seat i's most runes: the charged focus's, once taken; nothing before (melee only). */
export function yardRuneMax(w: World, i: number, id: number): number {
  if (!w.yard || i < 0 || i >= MAX_SEATS || !w.yard.focus[i]) return 0;
  return id === EL.fire ? YARD.focusFire : id === EL.sigil ? YARD.focusSigil : 0;
}

/** The yard's places to start from: the beginning, and at the rack with every lesson done. */
export const YARD_CHECKPOINTS: readonly Checkpoint[] = [
  { id: 'start', name: 'Into the yard', apply: () => {} },
  {
    id: 'focus', name: 'The charged focus',
    apply: (w) => {
      w.yard!.state[YS.done] = (1 << N_YST) - 1 & ~(1 << YST.focus);
      const rack = markerOf(w.def, 'focus');
      if (!rack) return;
      for (let i = 0; i < MAX_SEATS; i++) if (w.seats.active[i]) { w.bodies.x[i] = rack.x - 1.5 + (i % 2) * 1.2; w.bodies.y[i] = rack.y + 2 + Math.floor(i / 2) * 1.2; }
    },
  },
];
export const yardReached = (w: World): string => (yardDone(w, YST.parry) ? 'focus' : 'start');
