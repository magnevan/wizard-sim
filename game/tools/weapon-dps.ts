/**
 * Weapon vs spell sustained DPS (docs/explorations/2026-11-05-weapon-dps.md). One wizard, one sturdy
 * standing target, and a pilot that repeats one thing as fast as the game allows for `seconds`:
 *
 *   strike / heavy / sweep   conjure the weapon (Sigil + its elements, then Weapon), use it until its
 *                            uses run out, conjure again; the conjure's runes are counted, so its cost
 *                            is amortized over its uses. The staff (nothing conjured) costs nothing.
 *   spell                    queue the spell as soon as the pools allow, cast it (channels held for their
 *                            free natural duration, Earth Force charged fully), repeat.
 *
 * Every run starts from full pools under the current regen (RUNES.regen, shared), so both sides have
 * the same runes. The target is put back on its spot every tick (no knockback out of reach), and its
 * statuses (burning, wet...) are left to do what they do. Pure: no I/O, so tests can call it.
 */
import type { Element } from '@wizard-sim/rules';
import { BTN, KIND, NO_INPUT, PHASE, RHYTHM, TAP, compile, createWorld, elementId, quantize, step, type PlayerInput, type World } from '../packages/sim/src';

export type Move = 'strike' | 'heavy' | 'sweep';
export interface Plan {
  name: string;
  /** A weapon (with the Sigil) and the move spammed, or nothing (the staff). */
  weapon?: Element[];
  move?: Move;
  /** A spell cast over and over. */
  spell?: Element[];
  /** How far the target stands. */
  dist: number;
}
export interface Result { name: string; seconds: number; damage: number; runes: number; dps: number; perRune: number; uses: number }

const TARGET = 8;

function setup(dist: number): World {
  const w = createWorld(1, 1, { dummies: false });
  const b = w.bodies;
  b.x[0] = 0; b.y[0] = 0;
  b.kind[TARGET] = KIND.enemy; b.arch[TARGET] = 0; b.team[TARGET] = 2; // a standing target: archetype 0 doesn't act
  b.x[TARGET] = dist; b.y[TARGET] = 0; b.r[TARGET] = 0.45; b.hp[TARGET] = b.maxHp[TARGET] = 1e7;
  return w;
}

/** Can the pools pay for this queue now? */
function affordable(w: World, q: Element[]): boolean {
  const need = new Map<number, number>();
  for (const e of q) need.set(elementId(e), (need.get(elementId(e)) ?? 0) + 1);
  for (const [id, n] of need) if (w.seats.runes[id - 1] < n) return false;
  return true;
}

export function measure(plan: Plan, seconds: number): Result {
  const w = setup(plan.dist), s = w.seats, b = w.bodies;
  const aim = (o: Partial<PlayerInput>): PlayerInput[] => [quantize({ ...NO_INPUT, aimX: plan.dist * 32, aimY: 0, ...o })];
  let runes = 0, uses = 0;
  // the pilot: a queue to type (one press a tick), then a button to hold for `hold` ticks
  let typing: Element[] = [], btn = 0, hold = 0, toggle = false, rest = 0;
  const spell = plan.spell ? compile(plan.spell, 'force') : null;
  const ticks = Math.round(seconds * 60);
  for (let t = 0; t < ticks; t++) {
    b.x[TARGET] = plan.dist; b.y[TARGET] = 0; b.kx[TARGET] = 0; b.ky[TARGET] = 0; b.vx[TARGET] = 0; b.vy[TARGET] = 0;
    const idle = s.phase[0] === PHASE.idle && s.handT[0] === 0;
    let inp: Partial<PlayerInput> = {};
    if (hold > 0) { inp = { buttons: btn }; hold--; if (!hold) rest = 1; }
    else if (rest > 0) rest--; // let go of the button for a tick
    else if (typing.length) { inp = { press0: elementId(typing.shift()!) }; runes++; if (!typing.length) hold = -1; }
    else if (hold === -1) { // the queue is typed: press the cast
      hold = 0;
      if (plan.spell) {
        btn = BTN.force;
        const windup = Math.round(60 * (RHYTHM.windup + RHYTHM.windupPerRune * plan.spell.length));
        hold = spell!.channel ? windup + Math.round(60 * RHYTHM.naturalChannel * (spell!.shape === 'beam' ? Math.max(1, spell!.formN) : 1)) : spell!.charge ? windup + 60 + 2 : 2;
      } else { btn = BTN.weapon; hold = 2; }
      inp = { buttons: btn }; hold--;
    } else if (idle && s.queueLen[0] === 0 && s.bufTicks[0] === 0) { // (a buffered tap would cast the new queue)
      if (plan.spell) { if (affordable(w, plan.spell)) typing = [...plan.spell]; }
      else if (plan.weapon && !s.weapon[0]) { if (affordable(w, plan.weapon)) typing = [...plan.weapon]; }
      else if (plan.move === 'heavy') { btn = BTN.force; hold = TAP + 60 + 1; inp = { buttons: btn }; hold--; }
      else if (plan.move === 'sweep') { inp = { buttons: BTN.area }; rest = 1; }
      else { inp = { buttons: BTN.force }; rest = 1; } // a Strike: a one-tick tap
    } else if (!idle && !plan.spell && plan.move === 'strike' && s.weapon[0] && s.weaponUses[0] > 1 && s.phase[0] === PHASE.recover && s.handT[0] === 0) {
      // mash: tap again during recovery (the cast buffer keeps it), as a player spamming would
      toggle = !toggle;
      inp = toggle ? { buttons: BTN.force } : {};
    }
    const u0 = s.weaponUses[0];
    step(w, aim(inp));
    if (s.weaponUses[0] < u0) uses += u0 - s.weaponUses[0];
  }
  // let what's in flight land (bolts, burning) for a moment, without new actions
  for (let t = 0; t < 30; t++) step(w, aim({}));
  const damage = 1e7 - b.hp[TARGET];
  return {
    name: plan.name, seconds, damage: Math.round(damage), runes, uses,
    dps: Math.round((damage / seconds) * 10) / 10, perRune: runes ? Math.round((damage / runes) * 10) / 10 : Infinity,
  };
}

/** The weapons, their moves, and the spells they're compared with (the same element's one-rune Force). */
export const WEAPONS: { name: string; weapon?: Element[]; spell: Element[]; spellName: string; dist: number }[] = [
  { name: 'staff', spell: ['arcane'], spellName: 'Arcane beam', dist: 1.0 },
  { name: 'Arcane wand', weapon: ['sigil', 'arcane'], spell: ['arcane'], spellName: 'Arcane beam', dist: 3 },
  { name: 'Flame sword', weapon: ['sigil', 'fire'], spell: ['fire'], spellName: 'Fire spray', dist: 1.0 },
  { name: 'Stone maul', weapon: ['sigil', 'earth'], spell: ['earth'], spellName: 'Earth rock', dist: 1.0 },
  { name: 'Frost spear', weapon: ['sigil', 'cold'], spell: ['cold'], spellName: 'Ice shards', dist: 1.0 },
  { name: 'Lightning whip', weapon: ['sigil', 'lightning'], spell: ['lightning'], spellName: 'Lightning arc', dist: 1.0 },
  { name: 'Tide trident', weapon: ['sigil', 'water'], spell: ['water'], spellName: 'Water spray', dist: 1.0 },
];

export const SPELLS: { name: string; spell: Element[]; dist: number }[] = [
  { name: 'Arcane beam', spell: ['arcane'], dist: 3 },
  { name: 'Arcane beam x2', spell: ['arcane', 'arcane'], dist: 3 },
  { name: 'Fire spray', spell: ['fire'], dist: 2 },
  { name: 'Fire spray x2', spell: ['fire', 'fire'], dist: 2 },
  { name: 'Earth rock', spell: ['earth'], dist: 3 },
  { name: 'Earth rock x2', spell: ['earth', 'earth'], dist: 3 },
  { name: 'Ice shards', spell: ['cold'], dist: 2 },
  { name: 'Lightning arc', spell: ['lightning'], dist: 2 },
];

/** Every row: each weapon's Strike, Heavy and Sweep spam, and the spells. */
export function table(seconds: number): Result[] {
  const out: Result[] = [];
  for (const wpn of WEAPONS) for (const move of ['strike', 'heavy', 'sweep'] as Move[]) {
    if (wpn.weapon?.[1] === 'arcane' && move === 'sweep') continue; // the wand's Special is Siphon, not a Sweep
    if (wpn.weapon?.[1] === 'cold' && move === 'sweep') continue; // the spear's is the javelin
    out.push(measure({ name: `${wpn.name} ${move}`, weapon: wpn.weapon, move, dist: wpn.dist }, seconds));
  }
  for (const sp of SPELLS) out.push(measure({ name: sp.name, spell: sp.spell, dist: sp.dist }, seconds));
  return out;
}
