/**
 * Survive's power-ups as the player sees them: a name, a one-line rule, a colour ramp and a 7x7
 * glyph in the element-icon style (px.ts ICON). The altars (view-structures.ts), the HUD's pick
 * badges and the run-over screen all draw from here.
 */
import { PERKS as SIM_PERKS, PU, elementName } from '@wizard-sim/sim';
import * as X from './px';
import type { Ctx, Ramp } from './px';

export interface PerkArt { name: string; rule: string; ramp: Ramp; glyph: string[] }

const GEAR = ['.#.#.#.', '#######', '.##.##.', '###.###', '.##.##.', '#######', '.#.#.#.'];
const POOLS = ['#.#.#.#', '#.#.#.#', '#.#.#.#', '.......', '...#...', '..###..', '.#####.'];
const SPRING = ['...#...', '..###..', '.#.#.#.', '...#...', '.#...#.', '#.###.#', '.#####.'];
const MIRROR = ['.#####.', '#.....#', '#..#..#', '#.#.#.#', '#.....#', '.#...#.', '..###..'];
const WALL = ['.......', '##.##.#', '##.##.#', '.......', '#.##.##', '#.##.##', '.......'];
/** Two figures, one a step behind the other. */
const ECHO = ['.#...#.', '###.###', '.#...#.', '###.###', '.#...#.', '#.#.#.#', '#.#.#.#'];
/** A heart with a crack down it (the Survive Review's draft). */
const HEART = ['.##.##.', '#######', '###.###', '##.#.##', '.#####.', '..###..', '...#...'];

export const PERKS: Record<number, PerkArt> = {
  [PU.three]: { name: '+1 to three', rule: '+1 max rune of three elements you tap', ramp: X.EL.sigil, glyph: POOLS },
  [PU.deepEl]: { name: 'Deep', rule: '+2 max runes of one element', ramp: X.EL.arcane, glyph: POOLS },
  [PU.wellspring]: { name: 'Wellspring', rule: `Runes regenerate ${Math.round(SIM_PERKS.wellspring * 100)}% faster`, ramp: X.EL.water, glyph: SPRING },
  [PU.shieldSigil]: { name: 'Shield and Sigil', rule: '+1 max Shield and +1 max Sigil rune', ramp: X.EL.shield, glyph: X.ICON.sigil },
  [PU.bedrock]: { name: 'Bedrock', rule: 'Your rock walls last twice as long', ramp: X.EL.earth, glyph: WALL },
  [PU.pyre]: { name: 'Pyre', rule: 'Foes you set burning explode on death', ramp: X.EL.fire, glyph: X.ICON.fire },
  [PU.charm]: { name: 'Mirror charm', rule: 'A mirror ward regrows on you', ramp: X.EL.shield, glyph: MIRROR },
  [PU.clockwork]: { name: 'Clockwork', rule: 'Your turrets fire for free', ramp: X.EL.shield, glyph: GEAR },
  [PU.echo]: { name: 'Echo', rule: 'A free Double stands with you next wave', ramp: X.EL.sigil, glyph: ECHO },
  [PU.glass]: { name: 'Glass heart', rule: `+${Math.round(SIM_PERKS.glassDmg * 100)}% damage, -${Math.round(SIM_PERKS.glassHp * 100)}% max health`, ramp: X.EL.fire, glyph: HEART },
};

/** What a pick shows: Deep (one element) takes its element's colour, icon and name. */
export function perkOf(pu: number, el: number): PerkArt {
  const p = PERKS[pu] ?? PERKS[PU.three];
  if (pu !== PU.deepEl || el < 1) return p;
  const name = elementName(el);
  return { ...p, name: `Deep ${name}`, rule: `+2 max ${name} runes`, ramp: X.EL[name] ?? p.ramp, glyph: X.ICON[name] ?? p.glyph };
}

/** The 7x7 glyph at (x, y), scaled by k. */
export function glyph(c: Ctx, g: readonly string[], x: number, y: number, col: string, k = 1): void {
  X.fs(c, col);
  for (let j = 0; j < 7; j++) for (let i = 0; i < 7; i++) if (g[j][i] === '#') c.fillRect(Math.round(x) + i * k, Math.round(y) + j * k, k, k);
}

/** A small badge: the glyph on a dark tile with a rim in the power-up's colour (9x9). */
export function badge(c: Ctx, p: PerkArt, x: number, y: number): void {
  X.rect(c, x, y, 9, 9, '#0a0810'); X.rect(c, x + 1, y + 1, 7, 7, '#1a1726');
  X.rect(c, x, y, 9, 1, p.ramp[3] ?? p.ramp[2]);
  glyph(c, p.glyph, x + 1, y + 1, p.ramp[1]);
}
