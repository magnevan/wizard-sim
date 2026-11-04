import type { World } from '../world/world';
import { tickStatuses } from './statuses';

/** Tick status timers; damage-over-time becomes ordinary hits for the damage system. */
export function statusSystem(world: World, dt: number): void {
  for (const e of world.entities) {
    if (e.removed || e.downed) continue;
    if (e.ward) {
      e.ward.remaining -= dt;
      if (e.ward.remaining <= 0) e.ward = undefined;
    }
    if (!e.statuses) continue;
    for (const tick of tickStatuses(e.statuses, dt)) {
      world.hit({ targetId: e.id, sourceId: null, damage: { [tick.type]: tick.amount }, statuses: [], impulse: { x: 0, y: 0 } });
    }
  }
}
