import { describe, expect, it } from 'vitest';
import { elementId } from '@wizard-sim/sim';
import { parseDemo } from '../src/demo';

describe('?spell= demos', () => {
  it('reads a bare hands word as a cast with nothing queued, as the doc example writes it', () => {
    const d = parseDemo('sigil+cold/weapon;heavy')!;
    expect(d.seq!.map((x) => x.cast)).toEqual(['weapon', 'heavy']);
    expect(d.seq![0].els).toEqual([elementId('sigil'), elementId('cold')]);
    expect(parseDemo('sigil+cold/weapon;/heavy')!.seq!.map((x) => x.cast)).toEqual(['weapon', 'heavy']);
    expect(parseDemo('shield+earth/place;wait;wait')!.seq!.map((x) => x.cast)).toEqual(['place', 'wait', 'wait']);
    expect(parseDemo('fire')!.cast).toBe('force');
  });
});
