import { describe, expect, it } from 'vitest';
import { angleOf, sub } from '../core/vec2';
import type { InputSnapshot } from '../core/input';
import { BotController } from '../game/bot';
import { step, type Sim } from '../game/sim';
import { createArena } from '../rooms/arena';
import type { Room } from '../rooms/room';
import { spawnEffect } from '../spells/effects';
import { ProposalAResolver } from '../spells/proposalA';
import { DefaultSpellRunner } from '../spells/runner';
import type { ProjectileSpec } from '../spells/types';
import { ARCHETYPES } from './archetypes';
import { edgePoint } from './ai';
import { frontalHit } from './shield';
import { spawnEnemy, spawnWizard } from './spawn';
import { World } from './world';

const NO_INPUT: InputSnapshot = { presses: [], keysDown: new Set(), buttonsDown: new Set(), shift: false, mouseScreen: { x: 0, y: 0 }, wheel: 0 };
const IDLE = { label: 'idle', poll: () => ({ move: { x: 0, y: 0 }, aim: null, actions: [], castHeld: false }) };

function emptySim(): Sim {
  const room: Room = { id: 'test', name: 'Test', width: 30, height: 30, spawnPoints: [{ x: 5, y: 15 }], build: () => {} };
  const world = new World(30, 30);
  const wiz = spawnWizard(world, { x: 5, y: 15 }, 0, '#4f8cff');
  return { world, room, players: [{ index: 0, color: '#4f8cff', controller: IDLE, entityId: wiz.id, spawn: { x: 5, y: 15 } }], resolver: new ProposalAResolver(), runner: new DefaultSpellRunner() };
}
const run = (sim: Sim, seconds: number) => {
  for (let i = 0; i < Math.round(seconds * 60); i++) step(sim, NO_INPUT, 1 / 60);
};
const wizard = (sim: Sim) => sim.world.get(sim.players[0].entityId)!;

const SHARD: ProjectileSpec = { kind: 'projectile', speed: 14, radius: 0.15, range: 20, payload: { damage: { ice: 20 }, statuses: [], knockback: 0 } };

describe('shieldbearer', () => {
  it('frontalHit: hits travelling into its face are frontal, from behind are not', () => {
    expect(frontalHit(0, { x: -1, y: 0 }, 1)).toBe(true);
    expect(frontalHit(0, { x: 1, y: 0 }, 1)).toBe(false);
    expect(frontalHit(0, { x: 0, y: 1 }, 1)).toBe(false);
  });

  it('blocks a straight shot from the front but not from behind', () => {
    for (const fromFront of [true, false]) {
      const sim = emptySim();
      const sb = spawnEnemy(sim.world, { x: 15, y: 15 }, 'shieldbearer');
      if (sb.ai?.kind === 'enemy') sb.ai.state = 'cooldown';
      sb.facing = fromFront ? Math.PI : 0; // facing the wizard at x=5, or away
      sb.moveSpeed = 0;
      const shooter = wizard(sim);
      spawnEffect(sim.world, { ownerId: shooter.id, team: 'player', pos: { x: 10, y: 15 }, facing: angleOf(sub(sb.pos, { x: 10, y: 15 })), ownerRadius: 0 }, SHARD, ['ice']);
      run(sim, 0.6);
      if (fromFront) expect(sb.hp).toBe(sb.maxHp);
      else expect(sb.hp).toBeLessThan(sb.maxHp!);
    }
  });
});

describe('brute', () => {
  it('telegraphs its slam on the target, then hits it hard', () => {
    const sim = emptySim();
    spawnEnemy(sim.world, { x: 7.5, y: 15 }, 'brute');
    const w = wizard(sim);
    run(sim, ARCHETYPES.brute.windup * 0.8);
    expect(w.hp).toBe(w.maxHp);
    run(sim, 0.6);
    expect(w.hp).toBeLessThan(w.maxHp! - 20);
  });
});

describe('grabber', () => {
  it('drags toward the nearest edge', () => {
    expect(edgePoint({ x: 3, y: 10 }, 30, 20)).toEqual({ x: 1.7, y: 10 });
    expect(edgePoint({ x: 15, y: 18 }, 30, 20)).toEqual({ x: 15, y: 18.3 });
  });

  it('grabs a player and lets go when it takes enough damage', () => {
    const sim = emptySim();
    const g = spawnEnemy(sim.world, { x: 9, y: 15 }, 'grabber');
    const w = wizard(sim);
    let grabbed = false;
    for (let i = 0; i < 240 && !grabbed; i++) {
      step(sim, NO_INPUT, 1 / 60);
      grabbed = w.grabbedBy === g.id;
    }
    expect(grabbed).toBe(true);
    sim.world.hit({ targetId: g.id, sourceId: null, damage: { arcane: 30 }, statuses: [], impulse: { x: 0, y: 0 } });
    run(sim, 0.1);
    expect(w.grabbedBy).toBeUndefined();
    expect(sim.world.floaters.some((f) => f.text === 'Broke free!')).toBe(true);
  });
});

describe('fire imp', () => {
  it('ignores fire and is doused by water', () => {
    const sim = emptySim();
    const imp = spawnEnemy(sim.world, { x: 25, y: 25 }, 'imp');
    imp.moveSpeed = 0;
    sim.world.hit({ targetId: imp.id, sourceId: null, damage: { fire: 30 }, statuses: [{ id: 'burning', intensity: 1, duration: 3 }], impulse: { x: 0, y: 0 } });
    run(sim, 0.05);
    expect(imp.hp).toBe(imp.maxHp);
    expect(imp.statuses!.burning).toBeUndefined();
    sim.world.hit({ targetId: imp.id, sourceId: null, damage: {}, statuses: [{ id: 'wet', intensity: 1, duration: 3 }], impulse: { x: 0, y: 0 } });
    run(sim, 0.05);
    expect(imp.hp).toBeLessThan(imp.maxHp!);
  });
});

describe('arena death rule', () => {
  it('a downed player stays out until the wave ends, then returns in the breather', () => {
    const room = createArena();
    const world = new World(room.width, room.height);
    room.build(world);
    const wiz = spawnWizard(world, room.spawnPoints[0], 0, '#4f8cff');
    const sim: Sim = { world, room, players: [{ index: 0, color: '#4f8cff', controller: IDLE, entityId: wiz.id, spawn: room.spawnPoints[0] }], resolver: new ProposalAResolver(), runner: new DefaultSpellRunner() };
    const ally = spawnWizard(world, room.spawnPoints[1], 1, '#ff5a5a');
    sim.players.push({ index: 1, color: '#ff5a5a', controller: IDLE, entityId: ally.id, spawn: room.spawnPoints[1] });
    run(sim, 9);
    expect(world.encounter!.phase).toBe('wave');
    wiz.hp = 0;
    run(sim, 6);
    expect(wiz.downed).toBe(true);
    for (const e of world.entities) if (e.kind === 'enemy') world.remove(e);
    for (const p of world.encounter!.portals) p.left = 0;
    run(sim, 2);
    expect(world.encounter!.phase).toBe('breather');
    expect(wiz.downed).toBe(false);
  });

  it('two bots survive and clear the first waves, preparing during the lull', () => {
    const room = createArena();
    const world = new World(room.width, room.height);
    room.build(world);
    const sim: Sim = { world, room, players: [], resolver: new ProposalAResolver(), runner: new DefaultSpellRunner() };
    const a = spawnWizard(world, room.spawnPoints[0], 0, '#4f8cff');
    const b = spawnWizard(world, room.spawnPoints[1], 1, '#ff5a5a');
    sim.players.push({ index: 0, color: '#4f8cff', controller: new BotController(null), entityId: a.id, spawn: room.spawnPoints[0] });
    sim.players.push({ index: 1, color: '#ff5a5a', controller: new BotController((w) => w.get(a.id)), entityId: b.id, spawn: room.spawnPoints[1] });
    run(sim, 45);
    expect(world.sealedStored).toBeGreaterThan(0);
    expect(world.encounter!.wave).toBeGreaterThan(1);
    expect(world.encounter!.last?.sealedFired).toBeGreaterThan(0);
  });
});
