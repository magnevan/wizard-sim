import type { Vec2 } from '../core/vec2';
import type { Aabb } from '../world/geometry';
import type { World } from '../world/world';

export interface Room {
  id: string;
  name: string;
  width: number;
  height: number;
  /** One per player slot; extra players reuse the last. */
  spawnPoints: Vec2[];
  /** Populate a fresh world (walls, dummies...). Players are spawned by the game. */
  build(world: World): void;
  /** Per-tick room logic (waves, scripted events). */
  update?(world: World, dt: number): void;
  /** One-line room status for the HUD. */
  status?(world: World): string;
  /** Key 0. */
  reset?(world: World): void;
}

/** Outer walls of a room, `t` units thick, inside [0,w]x[0,h]. */
export function borderWalls(w: number, h: number, t = 1): Aabb[] {
  return [
    { x: 0, y: 0, w, h: t },
    { x: 0, y: h - t, w, h: t },
    { x: 0, y: 0, w: t, h },
    { x: w - t, y: 0, w: t, h },
  ];
}

export function pillar(cx: number, cy: number, size = 1.2): Aabb {
  return { x: cx - size / 2, y: cy - size / 2, w: size, h: size };
}
