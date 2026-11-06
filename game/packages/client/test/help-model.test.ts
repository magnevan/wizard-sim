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

  it('Water + Cold: the freeze mix names, the mix as a tag, and Ice sheet described as ice (not rain)', () => {
    expect(titles(['water', 'cold'])).toEqual(['Ice shards', 'Freezing splash', 'Ice sheet', 'Douse + Chill', 'Freezing burst']);
    const m = helpModel(['water', 'cold'], bare);
    expect(m.rows[0].tags.map((t) => t.text)).toEqual(['Chill', 'Freeze']);
    expect(m.rows[2].text).toMatch(/ice/i);
    expect(m.rows[2].text).not.toMatch(/rain/i);
  });

  it('Shield + Earth: walls and the Bulwark, whose preview conjures it and then blocks', () => {
    expect(titles(['shield', 'earth'])).toEqual(['Fault line', 'Ring of stone', 'Stone arc', 'Stone armour', 'Bulwark']);
    const bulwark = helpModel(['shield', 'earth'], bare).rows[4];
    expect(bulwark.demo.seq?.map((d) => d.cast)).toEqual(['weapon', 'block']);
  });

  it('Sigil + Arcane: devices, and a conjured weapon is used on the next loop', () => {
    expect(titles(['sigil', 'arcane'])).toEqual(['Arcane beam turret', 'Arcane orbitals', 'Arcane glyph', 'Glass cannon', 'Arcane hook']);
    const m = helpModel(['sigil', 'arcane'], bare);
    expect(m.rows[4].demo.seq?.map((d) => d.cast)).toEqual(['weapon', 'strike']);
    expect(m.rows[0].stats[0]).toMatch(/BINDS 1 SIGIL/);
  });

  it('stats: rune cost, damage per element, reach, duration and hold', () => {
    const fire = helpModel(['fire', 'fire'], bare).rows;
    expect(fire[0].stats[0]).toBe('2 RUNES');
    expect(fire[0].stats.join(' ')).toMatch(/FIRE \d+(\.\d)?\/S/);
    expect(fire[0].stats.join(' ')).toMatch(/HOLD: CHANNEL/);
    expect(fire[2].stats.join(' ')).toMatch(/LASTS 12S/); // a fire patch: 10 s, +20 % for the second Fire
    const rock = helpModel(['earth'], bare).rows[0].stats.join(' ');
    expect(rock).toMatch(/EARTH 22 CHARGED/);
    expect(rock).toMatch(/HOLD: CHARGE/);
    const heal = helpModel(['life'], bare).rows[1].stats.join(' ');
    expect(heal).toMatch(/HEALS 14/);
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
