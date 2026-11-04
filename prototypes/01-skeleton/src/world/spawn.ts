import { PLAYER } from '../config';
import type { Vec2 } from '../core/vec2';
import { ElementQueue } from '../spells/queue';
import { ARCHETYPES, type ArchetypeId } from './archetypes';
import type { CasterComponent, Entity, Team } from './entity';
import type { World } from './world';

export function newCaster(aim: Vec2): CasterComponent {
  return {
    queue: new ElementQueue(),
    aim: { ...aim },
    request: null,
    held: false,
    pending: null,
    active: null,
    moveMult: 1,
    lastOutcome: null,
    lastCast: null,
    sealArmed: false,
    releaseRequested: false,
    staff: null,
    orbitals: [],
    loaded: null,
    conjured: null,
  };
}

export function spawnWizard(world: World, pos: Vec2, index: number, color: string): Entity {
  return world.spawn({
    kind: 'wizard',
    pos: { ...pos },
    vel: { x: 0, y: 0 },
    move: { x: 0, y: 0 },
    moveSpeed: PLAYER.speed,
    radius: PLAYER.radius,
    mass: 1,
    friction: 7,
    solid: true,
    team: 'player',
    hp: PLAYER.hp,
    maxHp: PLAYER.hp,
    statuses: {},
    facing: 0,
    caster: newCaster({ x: pos.x + 1, y: pos.y }),
    player: { index, color, respawnIn: null },
  });
}

export function spawnDummy(world: World, pos: Vec2, team: Team, label: string): Entity {
  return world.spawn({
    kind: 'dummy',
    pos: { ...pos },
    vel: { x: 0, y: 0 },
    move: { x: 0, y: 0 },
    moveSpeed: 1.5,
    radius: 0.5,
    mass: 4,
    friction: 6,
    solid: true,
    team,
    hp: 300,
    maxHp: 300,
    immortal: true,
    statuses: {},
    facing: Math.PI,
    ai: { kind: 'dummy' },
    dummy: { home: { ...pos }, label, log: [], lastHit: null, total: 0 },
  });
}

/** Wave scaling for an enemy (loops get tougher). */
export interface EnemyScale {
  hp: number;
  speed: number;
  damage: number;
}

export function spawnEnemy(world: World, pos: Vec2, archetype: ArchetypeId, k: EnemyScale = { hp: 1, speed: 1, damage: 1 }): Entity {
  const def = ARCHETYPES[archetype];
  const hp = Math.round(def.hp * k.hp);
  return world.spawn({
    kind: 'enemy',
    pos: { ...pos },
    vel: { x: 0, y: 0 },
    move: { x: 0, y: 0 },
    moveSpeed: def.speed * k.speed,
    radius: def.radius,
    mass: def.mass,
    friction: 6,
    solid: true,
    team: 'enemy',
    hp,
    maxHp: hp,
    statuses: {},
    facing: 0,
    ai: { kind: 'enemy', archetype, state: 'approach', t: 0, targetId: null, lock: null, grabbedId: null, grabHp: 0, damageMult: k.damage },
  });
}
