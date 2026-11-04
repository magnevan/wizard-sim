import type { DummyComponent, Entity } from './entity';
import type { World } from './world';

/** Seconds of damage history used for the DPS readout. */
export const DPS_WINDOW = 3;

export function dummyDps(world: World, d: DummyComponent): number {
  if (d.log.length === 0) return 0;
  const sum = d.log.reduce((s, l) => s + l.amount, 0);
  // Divide by time since the first hit in the window (min 1s) so one big hit doesn't read as huge DPS.
  return sum / Math.max(1, Math.min(DPS_WINDOW, world.time - d.log[0].at));
}

export function pruneDummyLog(world: World, d: DummyComponent): void {
  d.log = d.log.filter((l) => world.time - l.at <= DPS_WINDOW);
}

/** Reset a dummy to pristine state (key 0 in the Sanctum). */
export function resetDummy(e: Entity): void {
  if (!e.dummy) return;
  e.pos = { ...e.dummy.home };
  e.vel = { x: 0, y: 0 };
  e.hp = e.maxHp;
  e.statuses = {};
  e.dummy.log = [];
  e.dummy.lastHit = null;
  e.dummy.total = 0;
}
