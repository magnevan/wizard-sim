import { resetDummy } from '../world/dummy';
import { spawnDummy } from '../world/spawn';
import { spawnSurface } from '../world/surfaces';
import type { World } from '../world/world';
import { borderWalls, pillar, type Room } from './room';

/** Surfaces for the world rules: Dummy C stands in a puddle (surge it), a frozen pond, a grass patch. */
function placeSurfaces(world: World): void {
  spawnSurface(world, { x: 15.3, y: 12.8 }, 'puddle', 1.9);
  spawnSurface(world, { x: 7, y: 4.6 }, 'ice', 1.5);
  spawnSurface(world, { x: 20.5, y: 9 }, 'grass', 1.7);
}

/** Calm test room: immortal dummies with DPS readouts and an ally to test friendly fire. */
export function createSanctum(): Room {
  const W = 26;
  const H = 18;
  return {
    id: 'sanctum',
    name: 'Sanctum',
    width: W,
    height: H,
    spawnPoints: [{ x: 7, y: 9 }, { x: 7, y: 11 }],
    build(world: World) {
      world.walls.push(...borderWalls(W, H), pillar(4, 4), pillar(4, 14), pillar(21, 3.5, 1.4), { x: 19, y: 13, w: 4, h: 1 });
      spawnDummy(world, { x: 15, y: 5.5 }, 'enemy', 'Dummy A');
      spawnDummy(world, { x: 16.5, y: 9 }, 'enemy', 'Dummy B');
      spawnDummy(world, { x: 15, y: 12.5 }, 'enemy', 'Dummy C');
      spawnDummy(world, { x: 10, y: 14.5 }, 'player', 'Ally');
      placeSurfaces(world);
    },
    status: () => 'Training dummies never die. 0 resets them and the room.',
    reset(world: World) {
      for (const e of world.entities) {
        resetDummy(e);
        if (e.kind === 'surface' || e.kind === 'structure' || e.kind === 'effigy') world.remove(e);
      }
      placeSurfaces(world);
      world.cue('reset', { x: W / 2, y: H / 2 });
    },
  };
}
