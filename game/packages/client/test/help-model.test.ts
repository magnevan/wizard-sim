import { describe, expect, it } from 'vitest';
import { rules, type Element } from '@wizard-sim/rules';
import { EL, GUARD } from '@wizard-sim/sim';
import { clip, helpModel, shortText, wrap, type HandsState } from '../src/help-model';

const bare: HandsState = { weapon: 0, uses: 0, guard: 0, wand: false };
const titles = (q: Element[]) => helpModel(q, bare).rows.map((r) => r.title);

describe('help panel model: queue -> rows', () => {
  it('one row per cast gesture, in the panel order, with their keys', () => {
    const m = helpModel(['fire'], bare);
    expect(m.mode).toBe('spell');
    expect(m.rows.map((r) => r.slot)).toEqual(['force', 'area', 'place', 'self', 'conjure']);
    expect(m.rows.map((r) => r.keys.pad)).toEqual(['RT', 'LT', 'LT HOLD', 'RB', 'LB+RT']);
    expect(m.rows[0].keys).toMatchObject({ mouse: 'R', shift: false });
    expect(m.rows[1].keys).toMatchObject({ mouse: 'R', shift: true, note: 'TAP' });
    expect(m.rows[2].keys).toMatchObject({ mouse: 'R', shift: true, note: 'HOLD' });
    expect(m.rows[3].keys.space).toBe(true);
    expect(m.rows[4].keys).toMatchObject({ mouse: 'L', shift: true });
  });

  it('Fire: the rules titles, short text, and a demo that queues Fire', () => {
    expect(titles(['fire'])).toEqual(['Flamethrower', 'Fire ring', 'Fire patch', 'Burn', 'Fire burst']);
    const m = helpModel(['fire'], bare);
    for (const r of m.rows) {
      expect(r.text.length).toBeGreaterThan(5);
      expect(r.text.length).toBeLessThan(160);
      expect(r.demo.els).toEqual([EL.fire]);
      expect(r.look).toBe('fire');
    }
    // Fire on yourself: what it does to you, not the generic paragraph
    expect(m.rows[3].text).toMatch(/^Burn: sets you alight/);
    // the imbued burst gets its short line
    expect(m.rows[4].text).toMatch(/^A burst of every queued element/);
  });

  it('Water + Cold make Ice, one rune with its own row: the names, and the Ice sheet described as ice (not rain)', () => {
    expect(rules.addElement(rules.addElement([], 'water').queue, 'cold').queue).toEqual(['ice']);
    expect(titles(['ice'])).toEqual(['Ice shards', 'Ice ring', 'Ice sheet', 'Impale', 'Ice burst']);
    const m = helpModel(['ice'], bare);
    expect(m.rows[0].stats[0]).toBe('2 RUNES'); // an Ice is a Water and a Cold
    expect(m.rows[2].text).toMatch(/ice/i);
    expect(m.rows[2].text).not.toMatch(/rain/i);
  });

  it('Shield + Earth: walls and the Bulwark, whose preview conjures it and then blocks', () => {
    expect(titles(['shield', 'earth'])).toEqual(['Fault line', 'Ring of stone', 'Stone arc', 'Stone armour', 'Bulwark']);
    const bulwark = helpModel(['shield', 'earth'], bare).rows[4];
    expect(bulwark.demo.seq?.map((d) => d.cast)).toEqual(['weapon', 'block']);
  });

  it('Sigil + Arcane: devices, and a conjured weapon is used on the next loop', () => {
    expect(titles(['sigil', 'arcane'])).toEqual(['Arcane beam turret', 'Arcane orbitals', 'Arcane glyph', 'Glass cannon', 'Arcane wand']);
    const m = helpModel(['sigil', 'arcane'], bare);
    expect(m.rows[4].demo.seq?.map((d) => d.cast)).toEqual(['weapon', 'strike']);
    expect(m.rows[0].stats[0]).toMatch(/BINDS 1 SIGIL/);
  });

  it('stats: rune cost, damage per element, reach, duration and hold', () => {
    const fire = helpModel(['fire', 'fire'], bare).rows;
    expect(fire[0].stats[0]).toBe('2 RUNES');
    expect(fire[0].stats.join(' ')).toMatch(/FIRE \d+(\.\d)?\/S/);
    expect(fire[0].stats.join(' ')).toMatch(/HOLD: CHANNEL/);
    expect(fire[2].stats.join(' ')).toMatch(/LASTS 14.4S/); // a fire patch: 12 s, +20 % for the second Fire
    const rock = helpModel(['earth'], bare).rows[0].stats.join(' ');
    expect(rock).toMatch(/EARTH 22 CHARGED/);
    expect(rock).toMatch(/HOLD: CHARGE/);
    const heal = helpModel(['life'], bare).rows[1].stats.join(' ');
    expect(heal).toMatch(/HEALS 14/);
  });

  it('the arc counts its zaps: 0.5 a rune every 0.2 s, and the beam its reach', () => {
    expect(helpModel(['lightning'], bare).rows[0].stats.join(' ')).toMatch(/LIGHTNING 25\/S/);
    expect(helpModel(['arcane', 'arcane'], bare).rows[0].stats.join(' ')).toMatch(/RANGE 30U/);
  });

  it('+1 rune: what one more rune of the lead element changes', () => {
    const scale = (q: Element[], k: number) => helpModel(q, bare).rows[k].scale;
    expect(scale(['fire'], 0)).toBe('+1 FIRE: DMG ×1.41, RANGE +0.5U, CONE +25%, WIND-UP +0.04S');
    expect(scale(['arcane'], 1)).toBe('+1 ARCANE: DMG ×1.7, RADIUS +0.6U, WIND-UP +0.04S');
    expect(scale(['arcane'], 0)).toBe('+1 ARCANE: DMG ×1.7, WIND-UP +0.04S'); // a beam's runes buy power; upkeep pays for time
    expect(scale(['life'], 0)).toBe('+1 LIFE: HEAL ×2, WIND-UP +0.04S');
    expect(helpModel(['water'], bare).rows[0].stats.join(' ')).toMatch(/PUSH 18U\/S A SECOND/);
    expect(scale(['earth'], 0)).toMatch(/^\+1 EARTH: DMG ×2.83/);
    expect(scale(['lightning'], 0)).toMatch(/JUMPS \+1/);
    expect(scale(['shield', 'earth'], 2)).toMatch(/HP \+40 A PIECE, STANDS \+5S/); // the lead of a Shield spell is its material
    expect(scale(['sigil', 'fire'], 3)).toBe('+1 FIRE: NOTHING MORE, WIND-UP +0.04S'); // a fire aura burns the same
    expect(scale(['cold', 'cold', 'cold', 'cold'], 1)).toMatch(/\(A COLD POOL HOLDS 4\)$/);
    expect(scale(['fire', 'fire', 'fire', 'fire', 'fire'], 0)).toBe('QUEUE FULL: 5 RUNES IS THE MOST');
    expect(scale(['shield'], 2)).toBe('+1 SHIELD: SHIELD CANCELS SHIELD');
    expect(scale(['fire'], 3)).toBe(''); // Self on yourself: nothing to compare
  });

  it('an empty queue shows your hands: the trident and the Tide shield', () => {
    const m = helpModel([], { weapon: EL.water, uses: 22, guard: GUARD.tide, wand: false });
    expect(m.mode).toBe('hands');
    expect(m.header).toBe('Tide trident (22) + Tide shield');
    expect(m.rows.map((r) => r.title)).toEqual(['Strike', 'Heavy', 'Sweep', 'Defend', 'Surge']);
    expect(m.rows.map((r) => r.demo.cast)).toEqual(['strike', 'heavy', 'special', 'block', 'retreat']);
    expect(m.rows[1].text).toMatch(/wave slash/);
  });

  it('empty hands: the staff, a hop back, and Defend says how to get a guard', () => {
    const m = helpModel([], bare);
    expect(m.header).toBe('Bare staff');
    expect(m.rows[3].idle).toBe(true);
    expect(m.rows[3].text).toMatch(/No guard/);
    expect(m.rows[4].title).toBe('Hop back');
  });

  it('held Specials (the wand\'s Siphon) are shown as holds', () => {
    const m = helpModel([], { weapon: EL.arcane, uses: 30, guard: 0, wand: false });
    expect(m.rows[2].title).toBe('Siphon');
    expect(m.rows[2].keys.note).toBe('HOLD');
    expect(m.rows[2].demo.cast).toBe('channel');
  });

  it('the key changes with the queue and the hands, so the panel redraws', () => {
    const a = helpModel(['fire'], bare).key, b = helpModel(['fire', 'fire'], bare).key, c = helpModel([], bare).key;
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it('every cell of the rules gets a short text', () => {
    for (const a of rules.BASE as Element[]) for (const b of rules.BASE as Element[]) {
      const q = rules.addElement([a], b).queue;
      if (!q.length) continue;
      for (const r of helpModel(q, bare).rows) {
        expect(r.title.length).toBeGreaterThan(0);
        expect(r.text.length).toBeGreaterThan(5);
        expect(r.text.length).toBeLessThan(220);
      }
    }
    expect(shortText(rules.resolve(['arcane'], 'force'))).toBe('A sustained beam.');
  });
});

// The rules' own cell text matches what the game builds (hands.ts, guards.ts), so the help panel
// needn't patch it (the final-pass review, 2026-11-06).
describe('the rules describe what the game builds', () => {
  const r = (q: Element[], cast: Parameters<typeof rules.resolve>[1]) => rules.resolve(q, cast);
  it('steam and ice have their own Area and Place text (the Ice sheet is not Rain)', () => {
    expect(r(['ice'], 'place').text).not.toMatch(/rain/i);
    expect(r(['ice'], 'place').text).toMatch(/ice/i);
    expect(r(['ice', 'water'], 'place').text).toMatch(/ice/i); // Ice leads Water: still the sheet
    expect(r(['water', 'fire'], 'place').text).toMatch(/steam/i);
    expect(r(['fire', 'fire', 'water'], 'place').text).toMatch(/steam/i);
    expect(r(['water', 'fire'], 'area').text).toMatch(/steam/i);
    expect(r(['ice'], 'area').text).toMatch(/freez/i);
  });
  it('Sigil conjures the weapons hands.ts builds', () => {
    expect(r(['sigil', 'arcane'], 'conjure').title).toBe('Arcane wand');
    expect(r(['sigil', 'arcane'], 'conjure').text).toMatch(/Siphon/);
    expect(r(['sigil', 'arcane'], 'conjure').text).not.toMatch(/hook|Yank/i);
    expect(r(['sigil', 'water'], 'conjure').title).toBe('Tide trident');
    expect(r(['sigil', 'life'], 'conjure').text).toMatch(/Mend/);
  });
  it('Shield conjures the guard its lead element picks (guards.ts), with its real Defend', () => {
    const guard = (q: Element[]) => r(q, 'conjure').title;
    expect(guard(['shield'])).toBe('Mirror buckler');
    expect(guard(['shield', 'earth'])).toBe('Bulwark');
    expect(guard(['shield', 'fire'])).toBe('Ember targe');
    expect(guard(['shield', 'cold'])).toBe('Rime kite');
    expect(guard(['shield', 'lightning'])).toBe('Spark ring');
    expect(guard(['shield', 'water'])).toBe('Tide shield');
    expect(guard(['shield', 'arcane'])).toBe('Prism');
    expect(guard(['shield', 'life'])).toBe('Leaf aegis');
    expect(guard(['shield', 'earth', 'life'])).toBe('Leaf aegis'); // Life leads, as in spells
    expect(guard(['shield', 'water', 'cold', 'cold'])).toBe('Rime kite'); // the most runes of the sprays
    expect(r(['shield', 'earth'], 'conjure').text).not.toMatch(/swing to bash/);
  });
  it('the help panel uses the rules text as it is (no per-cell overrides left)', () => {
    for (const q of [['water', 'cold'], ['water', 'fire']] as Element[][]) for (const cast of ['area', 'place'] as const) {
      expect(shortText(r(q, cast))).toBe(shortTextOf(r(q, cast).text));
    }
    expect(shortText(r(['fire'], 'conjure'))).toBe(shortTextOf(r(['fire'], 'conjure').text));
  });
});
/** The first sentence, and the second while both stay short (help-model.ts shortText's rule). */
function shortTextOf(t: string): string {
  const s = t.split(/(?<=[.!?])\s+/).filter(Boolean);
  return s[0] + (s[1] && s[0].length + s[1].length < 120 ? ' ' + s[1] : '');
}

describe('help panel text', () => {
  it('wraps at spaces and cuts a word longer than a line', () => {
    expect(wrap('a bb ccc dddd', 6)).toEqual(['a bb', 'ccc', 'dddd']);
    expect(wrap('abcdefghij', 4)).toEqual(['abcd', 'efgh', 'ij']);
  });
  it('clips to a number of lines with an ellipsis', () => {
    expect(clip(['one two', 'three', 'four'], 2, 10)).toEqual(['one two', 'three...']);
    expect(clip(['a'], 3, 10)).toEqual(['a']);
  });
});
