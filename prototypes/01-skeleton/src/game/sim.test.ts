import { describe, expect, it } from 'vitest';
import type { InputSnapshot } from '../core/input';
import { createArena } from '../rooms/arena';
import { createSanctum } from '../rooms/sanctum';
import { PlaceholderResolver } from '../spells/placeholderResolver';
import { ProposalAResolver } from '../spells/proposalA';
import { DefaultSpellRunner } from '../spells/runner';
import { CAST_MODES } from '../spells/types';
import { spawnWizard } from '../world/spawn';
import { World } from '../world/world';
import { DemoController } from './demo';
import { step, type Sim } from './sim';

const NO_INPUT: InputSnapshot = { presses: [], keysDown: new Set(), buttonsDown: new Set(), shift: false, mouseScreen: { x: 0, y: 0 }, wheel: 0 };

function makeSim(room = createSanctum()): Sim {
  const world = new World(room.width, room.height);
  room.build(world);
  const wiz = spawnWizard(world, room.spawnPoints[0], 0, '#4f8cff');
  return {
    world,
    room,
    players: [{ index: 0, color: '#4f8cff', controller: new DemoController(), entityId: wiz.id, spawn: room.spawnPoints[0] }],
    resolver: new ProposalAResolver(),
    runner: new DefaultSpellRunner(),
  };
}

describe('simulation smoke test', () => {
  it('the demo script damages the dummies in the Sanctum', () => {
    const sim = makeSim();
    for (let i = 0; i < 60 * 12; i++) step(sim, NO_INPUT, 1 / 60);
    const dummies = sim.world.entities.filter((e) => e.dummy && e.team === 'enemy');
    expect(dummies).toHaveLength(3);
    for (const d of dummies) expect(d.dummy!.total).toBeGreaterThan(0);
  });

  it('the demo exercises Point, walls, Seal and Release without leaking state', () => {
    const sim = makeSim();
    const wiz = () => sim.world.get(sim.players[0].entityId)!;
    let sawWall = false;
    let sawRune = false;
    let maxOrbitals = 0;
    for (let i = 0; i < 60 * 17; i++) {
      step(sim, NO_INPUT, 1 / 60);
      sawWall ||= sim.world.entities.some((e) => e.wall?.material === 'rock');
      sawRune ||= sim.world.entities.some((e) => e.rune);
      maxOrbitals = Math.max(maxOrbitals, wiz().caster!.orbitals.length);
    }
    expect(sawWall && sawRune).toBe(true);
    expect(maxOrbitals).toBe(4);
    expect(wiz().caster!.orbitals).toHaveLength(0);
    expect(sim.world.entities.filter((e) => e.effect).length).toBeLessThan(40);
  });

  it('a lightning strike on the puddle surges through everyone standing in it', () => {
    const sim = makeSim();
    const c = sim.world.entities.find((e) => e.dummy?.label === 'Dummy C')!;
    const caster = sim.world.get(sim.players[0].entityId)!;
    sim.players[0].controller = { label: 'idle', poll: () => ({ move: { x: 0, y: 0 }, aim: null, actions: [], castHeld: false }) };
    sim.runner.begin(sim.world, caster, new ProposalAResolver().resolve(['lightning'], 'point')!, { point: { ...c.pos }, targetId: null, charge: 0 });
    for (let i = 0; i < 60; i++) step(sim, NO_INPUT, 1 / 60);
    expect(sim.world.floaters.some((f) => f.text === 'Surge!')).toBe(true);
  });

  it('arena telegraphs the first wave with portals during the lull, then spawns it', () => {
    const sim = makeSim(createArena());
    for (let i = 0; i < 60 * 3; i++) step(sim, NO_INPUT, 1 / 60);
    expect(sim.world.encounter!.phase).toBe('lull');
    expect(sim.world.encounter!.portals.length).toBeGreaterThan(0);
    expect(sim.world.entities.some((e) => e.kind === 'enemy')).toBe(false);
    for (let i = 0; i < 60 * 8; i++) step(sim, NO_INPUT, 1 / 60);
    expect(sim.world.encounter!.phase).toBe('wave');
    expect(sim.world.entities.some((e) => e.kind === 'enemy')).toBe(true);
  });
});

describe('placeholder resolver', () => {
  const r = new PlaceholderResolver();
  it('returns null for an empty queue except weapon', () => {
    for (const m of CAST_MODES) expect(r.resolve([], m) === null).toBe(m !== 'weapon');
    for (const m of CAST_MODES) expect(new ProposalAResolver().resolve([], m) === null).toBe(m !== 'weapon');
  });
  it('picks shapes by element', () => {
    expect(r.resolve(['earth'], 'force')!.effects[0].kind).toBe('projectile');
    expect(r.resolve(['arcane'], 'force')!.effects[0].kind).toBe('beam');
    expect(r.resolve(['fire'], 'force')!.effects[0].kind).toBe('spray');
    expect(r.resolve(['fire'], 'area')!.effects[0].kind).toBe('burst');
    expect(r.resolve(['shield'], 'self')!.effects[0].kind).toBe('ward');
  });
  it('cast time grows with element count, independent of which keys', () => {
    const a = r.resolve(['fire', 'fire', 'fire'], 'force')!.castTime;
    const b = r.resolve(['steam', 'lightning', 'fire'], 'force')!.castTime;
    expect(a).toBe(b);
    expect(r.resolve(['fire'], 'force')!.castTime).toBeLessThan(a);
  });
});
