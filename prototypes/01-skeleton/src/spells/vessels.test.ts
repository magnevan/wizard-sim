import { describe, expect, it } from 'vitest';
import type { InputSnapshot } from '../core/input';
import type { PlayerAction, PlayerController } from '../game/controllers';
import { step, type Sim } from '../game/sim';
import { createSanctum } from '../rooms/sanctum';
import { spawnWizard } from '../world/spawn';
import { World } from '../world/world';
import type { Element } from './elements';
import { ProposalAResolver } from './proposalA';
import { DefaultSpellRunner } from './runner';
import type { CastMode } from './types';
import { contingencyFires, ORBITAL_CAP, orbitalCharges, orbitalsToAdd, RUNE_CAP, runeArmed, runesOf, runesToEvict } from './vessels';

describe('vessel rules (pure)', () => {
  it('rune cap: placing past the cap evicts the oldest', () => {
    expect(runesToEvict(0)).toBe(0);
    expect(runesToEvict(RUNE_CAP - 1)).toBe(0);
    expect(runesToEvict(RUNE_CAP)).toBe(1);
    expect(runesToEvict(RUNE_CAP + 2)).toBe(3);
  });

  it('orbitals: one charge per element (min 1), stacking up to the cap', () => {
    expect(orbitalCharges([])).toBe(1);
    expect(orbitalCharges(['earth', 'earth', 'fire'])).toBe(3);
    expect(orbitalsToAdd(0, 2)).toBe(2);
    expect(orbitalsToAdd(6, 5)).toBe(ORBITAL_CAP - 6);
    expect(orbitalsToAdd(ORBITAL_CAP, 3)).toBe(0);
  });

  it('runes arm after a delay', () => {
    expect(runeArmed({ armAt: 1 }, 0.9)).toBe(false);
    expect(runeArmed({ armAt: 1 }, 1)).toBe(true);
  });

  it('contingency fires only with a Shield staff spell and damage taken', () => {
    const spec = new ProposalAResolver().resolve(['fire'], 'area')!;
    expect(contingencyFires(null, true)).toBe(false);
    expect(contingencyFires({ contingency: null }, true)).toBe(false);
    expect(contingencyFires({ contingency: spec }, false)).toBe(false);
    expect(contingencyFires({ contingency: spec }, true)).toBe(true);
  });
});

/** A controller that replays queued actions, one batch per tick. */
class Scripted implements PlayerController {
  readonly label = 'test';
  batches: PlayerAction[][] = [];
  aim = { x: 13, y: 9 };
  poll() {
    return { move: { x: 0, y: 0 }, aim: this.aim, actions: this.batches.shift() ?? [], castHeld: false };
  }
}

const NO_INPUT: InputSnapshot = { presses: [], keysDown: new Set(), buttonsDown: new Set(), shift: false, mouseScreen: { x: 0, y: 0 }, wheel: 0 };

function makeSim() {
  const room = createSanctum();
  const world = new World(room.width, room.height);
  room.build(world);
  const ctrl = new Scripted();
  const wiz = spawnWizard(world, { x: 7, y: 9 }, 0, '#4f8cff');
  const sim: Sim = { world, room, players: [{ index: 0, color: '#4f8cff', controller: ctrl, entityId: wiz.id, spawn: { x: 7, y: 9 } }], resolver: new ProposalAResolver(), runner: new DefaultSpellRunner() };
  const run = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds * 60); i++) step(sim, NO_INPUT, 1 / 60);
  };
  const cast = (els: Element[], mode: CastMode, seal = false) => {
    ctrl.batches.push([...(seal ? [{ type: 'seal' as const }] : []), ...els.map((element) => ({ type: 'element' as const, element })), { type: 'cast', mode }]);
    run(1);
  };
  return { sim, world, wiz, ctrl, run, cast };
}

describe('vessels in the world', () => {
  it('Seal + Point places runes; the 4th replaces the oldest', () => {
    const { world, wiz, ctrl, cast } = makeSim();
    const points = [{ x: 9, y: 6 }, { x: 10, y: 6 }, { x: 11, y: 6 }, { x: 12, y: 6 }];
    for (const p of points) {
      ctrl.aim = p;
      cast(['fire'], 'point', true);
    }
    const runes = runesOf(world, wiz.id);
    expect(runes).toHaveLength(RUNE_CAP);
    expect(runes.map((r) => r.pos.x)).toEqual([10, 11, 12]);
    expect(wiz.caster!.sealArmed).toBe(false);
  });

  it('Seal + Area stacks orbitals up to the cap; Release flings them', () => {
    const { wiz, ctrl, cast, run } = makeSim();
    for (let i = 0; i < 3; i++) cast(['earth', 'earth', 'fire'], 'area', true);
    expect(wiz.caster!.orbitals).toHaveLength(ORBITAL_CAP);
    ctrl.batches.push([{ type: 'release' }]);
    run(0.1);
    expect(wiz.caster!.orbitals).toHaveLength(0);
  });

  it('Release triggers runes and shatters own walls', () => {
    const { world, wiz, ctrl, cast, run } = makeSim();
    ctrl.aim = { x: 13, y: 9 };
    cast(['shield', 'earth'], 'force');
    expect(world.entities.some((e) => e.wall?.ownerId === wiz.id)).toBe(true);
    ctrl.aim = { x: 9, y: 6 };
    cast(['fire'], 'point', true);
    ctrl.batches.push([{ type: 'release' }]);
    run(0.1);
    expect(runesOf(world, wiz.id)).toHaveLength(0);
    expect(world.entities.some((e) => e.wall?.ownerId === wiz.id && !e.removed)).toBe(false);
    expect(world.entities.some((e) => e.effect?.spec.kind === 'projectile')).toBe(true);
  });

  it('a Shield staff spell fires itself as an Area cast when the caster is hurt (Contingency)', () => {
    const { world, wiz, cast, run } = makeSim();
    cast(['shield', 'fire'], 'self', true);
    expect(wiz.caster!.staff?.contingency).toBeTruthy();
    world.hit({ targetId: wiz.id, sourceId: null, damage: { physical: 5 }, statuses: [], impulse: { x: 0, y: 0 } });
    run(0.05);
    expect(wiz.caster!.staff).toBeNull();
  });

  it('an armed rune triggers when an enemy steps on it', () => {
    const { world, wiz, ctrl, cast, run } = makeSim();
    const dummyB = world.entities.find((e) => e.dummy?.label === 'Dummy B')!;
    ctrl.aim = { x: dummyB.pos.x - 1.2, y: dummyB.pos.y };
    cast(['fire'], 'point', true);
    expect(runesOf(world, wiz.id)).toHaveLength(1);
    dummyB.dummy!.home = { x: dummyB.pos.x - 1.2, y: dummyB.pos.y };
    run(1.5);
    expect(runesOf(world, wiz.id)).toHaveLength(0);
    expect(dummyB.dummy!.total).toBeGreaterThan(0);
  });
});
