import type { InputSnapshot } from '../core/input';
import type { Room } from '../rooms/room';
import { castSystem } from '../spells/castSystem';
import type { SpellResolver, SpellRunner } from '../spells/types';
import { vesselSystem } from '../spells/vessels';
import { statusSystem } from '../statuses/system';
import { aiSystem } from '../world/ai';
import { damageSystem } from '../world/damage';
import { pruneDummyLog } from '../world/dummy';
import { collisionSystem, movementSystem } from '../world/physics';
import { structureSystem } from '../world/structures';
import { surfaceSystem } from '../world/surfaces';
import type { World } from '../world/world';
import { playerSystem, type PlayerSlot } from './players';

export interface Sim {
  world: World;
  room: Room;
  players: PlayerSlot[];
  resolver: SpellResolver;
  runner: SpellRunner;
}

/** One fixed simulation step. The system order is the contract; keep it explicit. */
export function step(sim: Sim, input: InputSnapshot, dt: number): void {
  const { world } = sim;
  world.time += dt;
  playerSystem(world, sim.players, input, dt); // 1. input
  aiSystem(world, dt); //                         2. ai
  castSystem(world, sim.resolver, sim.runner, dt); // 3. spells (release, casts, effects)
  structureSystem(world, dt); //                  4. structures (expire, guards, barriers)
  movementSystem(world, dt); //                   5. movement
  collisionSystem(world); //                      6. collisions (bodies, level + conjured walls)
  surfaceSystem(world, dt); //                    7. surfaces (wet, ice, burning, touches -> surge/freeze/melt)
  statusSystem(world, dt); //                     8. statuses
  damageSystem(world); //                         9. damage / death
  vesselSystem(world); //                         10. vessels (contingency, runes, effigies)
  cleanupSystem(world, dt); //                    11. cleanup
  sim.room.update?.(world, dt); //                room director (waves)
}

function cleanupSystem(world: World, dt: number): void {
  world.sweep();
  for (const f of world.floaters) {
    f.age += dt;
    f.pos.y -= dt * 1.1;
  }
  world.floaters = world.floaters.filter((f) => f.age < f.life);
  for (const e of world.entities) {
    if (e.hitFlash) e.hitFlash = Math.max(0, e.hitFlash - dt);
    if (e.dummy) pruneDummyLog(world, e.dummy);
  }
}
