import { describe, expect, it } from 'vitest';
import { advance, BREATHER_SECONDS, FIRST_LULL_SECONDS, LULL_SECONDS, newEncounter, respawnBlocked, WAVES, wavePlan } from './waves';

describe('wave plan', () => {
  it('mixes at most 3 archetypes per authored wave', () => {
    for (const w of WAVES) expect(w.length).toBeLessThanOrEqual(3);
    expect(WAVES).toHaveLength(6);
  });
  it('loops harder after the authored waves', () => {
    const a = wavePlan(2);
    const b = wavePlan(2 + WAVES.length);
    expect(b.loop).toBe(1);
    expect(b.groups.map((g) => g.archetype)).toEqual(a.groups.map((g) => g.archetype));
    b.groups.forEach((g, i) => expect(g.count).toBeGreaterThan(a.groups[i].count));
    expect(b.hp).toBeGreaterThan(a.hp);
  });
});

describe('wave director', () => {
  it('lull -> wave -> breather -> lull, with portals opened at the start of every lull', () => {
    const enc = newEncounter();
    expect(advance(enc, 0.1, 0, 1)).toBe('openPortals');
    enc.portals = [{ pos: { x: 0, y: 0 }, archetype: 'swarmer', left: 2, total: 2, next: 0 }];
    expect(advance(enc, FIRST_LULL_SECONDS - 0.5, 0, 1)).toBe(null);
    expect(advance(enc, 1, 0, 1)).toBe('startWave');
    expect(enc.phase).toBe('wave');
    expect(respawnBlocked(enc)).toBe(true);
    // Not over while a portal still has enemies to spill.
    expect(advance(enc, 1, 0, 1)).toBe(null);
    enc.portals[0].left = 0;
    expect(advance(enc, 1, 3, 1)).toBe(null);
    expect(advance(enc, 1, 0, 1)).toBe('cleared');
    expect(enc.phase).toBe('breather');
    expect(respawnBlocked(enc)).toBe(false);
    expect(advance(enc, BREATHER_SECONDS + 0.1, 0, 1)).toBe('nextLull');
    expect(enc).toMatchObject({ phase: 'lull', wave: 2, timer: LULL_SECONDS, portals: [] });
  });
  it('reports a wipe when every player is down during a wave', () => {
    const enc = newEncounter();
    enc.phase = 'wave';
    expect(advance(enc, 0.1, 4, 0)).toBe('wiped');
  });
});
