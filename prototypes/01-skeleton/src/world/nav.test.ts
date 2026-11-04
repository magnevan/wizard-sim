import { describe, expect, it } from 'vitest';
import type { InputSnapshot } from '../core/input';
import { dist } from '../core/vec2';
import { step, type Sim } from '../game/sim';
import type { Room } from '../rooms/room';
import { ProposalAResolver } from '../spells/proposalA';
import { DefaultSpellRunner } from '../spells/runner';
import { ARCHETYPES, type ArchetypeId } from './archetypes';
import { gridClear, navGrid } from './nav';
import { spawnEnemy, spawnWizard } from './spawn';
import { spawnWall } from './structures';
import { World } from './world';

const NO_INPUT: InputSnapshot = { presses: [], keysDown: new Set(), buttonsDown: new Set(), shift: false, mouseScreen: { x: 0, y: 0 }, wheel: 0 };
const IDLE = { label: 'idle', poll: () => ({ move: { x: 0, y: 0 }, aim: null, actions: [], castHeld: false }) };

function sim(): Sim {
  const room: Room = { id: 'test', name: 'Test', width: 30, height: 30, spawnPoints: [{ x: 5, y: 15 }], build: () => {} };
  const world = new World(30, 30);
  const wiz = spawnWizard(world, { x: 5, y: 15 }, 0, '#4f8cff');
  wiz.hp = wiz.maxHp = 1e6;
  return { world, room, players: [{ index: 0, color: '#4f8cff', controller: IDLE, entityId: wiz.id, spawn: { x: 5, y: 15 } }], resolver: new ProposalAResolver(), runner: new DefaultSpellRunner() };
}

/** Seconds until the enemy is in attack reach of the wizard (or the cap). */
function timeToReach(s: Sim, archetype: ArchetypeId, cap = 20): number {
  const e = spawnEnemy(s.world, { x: 16, y: 15 }, archetype);
  const w = s.world.get(s.players[0].entityId)!;
  for (let i = 0; i < cap * 60; i++) {
    step(s, NO_INPUT, 1 / 60);
    if (dist(e.pos, w.pos) - e.radius! - w.radius! < ARCHETYPES[archetype].reach + 0.3) return i / 60;
  }
  return cap;
}

describe('enemy steering', () => {
  it('the nav grid sees level walls and conjured walls', () => {
    const s = sim();
    s.world.walls.push({ x: 10, y: 10, w: 1, h: 10 });
    expect(gridClear(navGrid(s.world), { x: 5, y: 15 }, { x: 16, y: 15 })).toBe(false);
    expect(gridClear(navGrid(s.world), { x: 5, y: 5 }, { x: 16, y: 5 })).toBe(true);
  });

  it.each(['swarmer', 'brute', 'shieldbearer'] as const)('a %s walks around a long level wall instead of pushing into it', (arch) => {
    const open = timeToReach(sim(), arch);
    const s = sim();
    s.world.walls.push({ x: 10, y: 9, w: 1, h: 12 });
    const walled = timeToReach(s, arch);
    expect(walled).toBeLessThan(20);
    // ...but the detour costs time: walls are a tactic.
    expect(walled).toBeGreaterThan(open + 1);
  });

  it('a swarmer gets around a conjured rock wall', () => {
    const s = sim();
    const w = s.world.get(s.players[0].entityId)!;
    spawnWall(s.world, { ownerId: w.id, team: 'player', a: { x: 8, y: 12 }, b: { x: 8, y: 18 }, half: 0.3, material: 'rock', duration: 99 });
    expect(timeToReach(s, 'swarmer')).toBeLessThan(10);
  });
});
