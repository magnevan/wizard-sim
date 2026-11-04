import { describe, expect, it } from 'vitest';
import type { InputSnapshot } from '../core/input';
import { step, type Sim } from '../game/sim';
import type { Room } from '../rooms/room';
import type { Entity } from '../world/entity';
import { spawnDummy, spawnEnemy, spawnWizard } from '../world/spawn';
import { World } from '../world/world';
import { isOffensive } from './castSystem';
import { originOf, spawnEffect } from './effects';
import type { Element } from './elements';
import { ctxAt, fireSpell } from './fire';
import { ProposalAResolver } from './proposalA';
import { DefaultSpellRunner } from './runner';
import type { CastMode, PointTarget, ProjectileSpec } from './types';

const NO_INPUT: InputSnapshot = { presses: [], keysDown: new Set(), buttonsDown: new Set(), shift: false, mouseScreen: { x: 0, y: 0 }, wheel: 0 };
const IDLE = { label: 'idle', poll: () => ({ move: { x: 0, y: 0 }, aim: null, actions: [], castHeld: false }) };
const a1 = new ProposalAResolver('a1');

function sim(): Sim {
  const room: Room = { id: 'test', name: 'Test', width: 30, height: 30, spawnPoints: [{ x: 5, y: 15 }], build: () => {} };
  const world = new World(30, 30);
  const wiz = spawnWizard(world, { x: 5, y: 15 }, 0, '#4f8cff');
  return { world, room, players: [{ index: 0, color: '#4f8cff', controller: IDLE, entityId: wiz.id, spawn: { x: 5, y: 15 } }], resolver: a1, runner: new DefaultSpellRunner() };
}
const run = (s: Sim, seconds: number) => {
  for (let i = 0; i < Math.round(seconds * 60); i++) step(s, NO_INPUT, 1 / 60);
};
const wizard = (s: Sim) => s.world.get(s.players[0].entityId)!;
/** Fire an A.1 spell from `caster`, optionally at a target body. */
function cast(s: Sim, caster: Entity, els: Element[], mode: CastMode, target?: Entity, kind: PointTarget = 'ground') {
  const spec = a1.resolve(els, mode, { target: target ? kind : undefined })!;
  fireSpell(s.world, originOf(caster), spec, ctxAt(target?.pos ?? caster.pos, target?.id ?? null));
  return spec;
}
const BOLT: ProjectileSpec = { kind: 'projectile', speed: 12, radius: 0.2, range: 20, payload: { damage: { arcane: 20 }, statuses: [], knockback: 3 } };

describe('A.1 enchantments', () => {
  it('Haste: faster walking, longer with more lightning', () => {
    const s = sim();
    const w = wizard(s);
    cast(s, w, ['lightning', 'lightning'], 'self');
    expect(w.statuses!.haste!.remaining).toBeCloseTo(6);
    s.players[0].controller = { label: 'walk', poll: () => ({ move: { x: 1, y: 0 }, aim: null, actions: [], castHeld: false }) };
    const x0 = w.pos.x;
    run(s, 0.5);
    expect(w.pos.x - x0).toBeGreaterThan(4.2 * 0.5 * 1.3);
  });

  it('Glass cannon: +50% dealt and taken', () => {
    const s = sim();
    const w = wizard(s);
    const enemy = spawnEnemy(s.world, { x: 9, y: 15 }, 'brute');
    enemy.moveSpeed = 0;
    cast(s, w, ['arcane', 'fire'], 'self');
    s.world.hit({ targetId: enemy.id, sourceId: w.id, damage: { physical: 10 }, statuses: [], impulse: { x: 0, y: 0 } });
    s.world.hit({ targetId: w.id, sourceId: enemy.id, damage: { physical: 10 }, statuses: [], impulse: { x: 0, y: 0 } });
    run(s, 1 / 60);
    expect(enemy.maxHp! - enemy.hp!).toBeCloseTo(15);
    expect(w.maxHp! - w.hp!).toBeCloseTo(15);
  });

  it('Stoneskin soaks damage until the armor breaks', () => {
    const s = sim();
    const w = wizard(s);
    cast(s, w, ['earth'], 'self');
    expect(w.armor).toBe(40);
    s.world.hit({ targetId: w.id, sourceId: null, damage: { physical: 30 }, statuses: [], impulse: { x: 0, y: 0 } });
    run(s, 1 / 60);
    expect(w.hp).toBe(w.maxHp);
    s.world.hit({ targetId: w.id, sourceId: null, damage: { physical: 30 }, statuses: [], impulse: { x: 0, y: 0 } });
    run(s, 1 / 60);
    expect(w.maxHp! - w.hp!).toBeCloseTo(20);
    expect(w.statuses!.stoneskin).toBeUndefined();
  });

  it('Cleanse (Point + Water on an ally) removes burning / frozen but keeps enchants', () => {
    const s = sim();
    const w = wizard(s);
    const ally = spawnDummy(s.world, { x: 8, y: 15 }, 'player', 'Ally');
    ally.statuses = { frozen: { intensity: 1, remaining: 3, dotTimer: 0 }, haste: { intensity: 1, remaining: 3, dotTimer: 0 } };
    const spec = cast(s, w, ['water'], 'point', ally, 'ally');
    expect(spec.name).toBe('Cleanse (on ally)');
    expect(Object.keys(ally.statuses)).toEqual(['haste']);
  });

  it('Ethereal: harmful hits and projectiles pass through, heals land, offensive casts are refused', () => {
    const s = sim();
    const w = wizard(s);
    w.hp = 100;
    cast(s, w, ['shield', 'arcane'], 'self');
    spawnEffect(s.world, { ownerId: -1, team: 'enemy', pos: { x: 9, y: 15 }, facing: Math.PI, ownerRadius: 0 }, BOLT, ['arcane']);
    s.world.hit({ targetId: w.id, sourceId: null, damage: { physical: 10, life: 5 }, statuses: [{ id: 'burning', intensity: 1, duration: 3 }], impulse: { x: 5, y: 0 } });
    run(s, 0.6);
    expect(w.hp).toBe(105);
    expect(w.statuses!.burning).toBeUndefined();
    expect(isOffensive(a1.resolve(['fire'], 'force')!)).toBe(true);
    expect(isOffensive(a1.resolve(['life'], 'self')!)).toBe(false);
    expect(isOffensive(a1.resolve(['lightning'], 'point', { target: 'ally' })!, 'ally')).toBe(false);
    expect(isOffensive(a1.resolve(['shield'], 'point', { target: 'enemy' })!, 'enemy')).toBe(true);
  });
});

describe('A.1 Cage', () => {
  it('traps the enemy, blocks its shots and shots at it', () => {
    const s = sim();
    const w = wizard(s);
    const enemy = spawnEnemy(s.world, { x: 12, y: 15 }, 'caster');
    cast(s, w, ['shield'], 'point', enemy, 'enemy');
    const cage = s.world.entities.find((e) => e.cage)!;
    expect(cage).toBeDefined();
    // It can't walk out.
    enemy.vel = { x: 30, y: 0 };
    run(s, 0.5);
    expect(Math.hypot(enemy.pos.x - cage.pos.x, enemy.pos.y - cage.pos.y) + enemy.radius!).toBeLessThanOrEqual(cage.radius! + 1e-6);
    // A shot at it stops at the bubble; a shot from inside stays inside.
    spawnEffect(s.world, originOf(w), { ...BOLT }, ['arcane']);
    spawnEffect(s.world, { ownerId: enemy.id, team: 'enemy', pos: enemy.pos, facing: Math.PI, ownerRadius: enemy.radius! }, BOLT, ['arcane']);
    run(s, 1.0);
    expect(enemy.hp).toBe(enemy.maxHp);
    expect(w.hp).toBe(w.maxHp);
    // After ~3 s the bubble is gone.
    run(s, 2.5);
    expect(s.world.entities.some((e) => e.cage)).toBe(false);
  });
});
