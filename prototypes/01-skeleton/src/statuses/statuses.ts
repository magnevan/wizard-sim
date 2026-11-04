import type { DamageType } from '../spells/elements';
import { STATUS_INTERACTIONS, statusDef, type StatusId, type StatusInteraction } from './defs';

export type { StatusId } from './defs';

export interface StatusApplication {
  id: StatusId;
  intensity: number;
  duration: number;
}

export interface StatusInstance {
  intensity: number;
  remaining: number;
  /** Time accumulated toward the next DoT tick. */
  dotTimer: number;
}

export type StatusBag = Partial<Record<StatusId, StatusInstance>>;

export interface DotTick {
  type: DamageType;
  amount: number;
}

/**
 * Apply a status, running the interaction table first. Pure over the bag;
 * returns the fx cue names triggered (for the renderer).
 */
export function applyStatus(
  bag: StatusBag,
  app: StatusApplication,
  interactions: readonly StatusInteraction[] = STATUS_INTERACTIONS,
  depth = 0,
): string[] {
  const fx: string[] = [];
  if (depth > 4 || app.intensity <= 0) return fx;

  let blocked = false;
  for (const rule of interactions) {
    if (rule.incoming !== app.id || !bag[rule.existing]) continue;
    if (rule.removeExisting) delete bag[rule.existing];
    if (rule.fx) fx.push(rule.fx);
    if (rule.add) fx.push(...applyStatus(bag, rule.add, interactions, depth + 1));
    if (rule.blockIncoming) blocked = true;
  }
  if (blocked) return fx;

  const def = statusDef(app.id);
  const cur = bag[app.id];
  const intensity = Math.min(def.maxIntensity, (cur?.intensity ?? 0) + app.intensity);
  const remaining = Math.max(cur?.remaining ?? 0, app.duration);
  bag[app.id] = { intensity, remaining, dotTimer: cur?.dotTimer ?? 0 };

  if (def.onMax && intensity >= def.maxIntensity) {
    delete bag[app.id];
    fx.push(...applyStatus(bag, def.onMax, interactions, depth + 1));
  }
  return fx;
}

/** Advance timers, expire statuses, and return any damage-over-time ticks due. */
export function tickStatuses(bag: StatusBag, dt: number): DotTick[] {
  const ticks: DotTick[] = [];
  for (const id of Object.keys(bag) as StatusId[]) {
    const s = bag[id]!;
    const dot = statusDef(id).dot;
    if (dot) {
      s.dotTimer += dt;
      while (s.dotTimer >= dot.interval) {
        s.dotTimer -= dot.interval;
        ticks.push({ type: dot.type, amount: dot.perSecondPerIntensity * s.intensity * dot.interval });
      }
    }
    s.remaining -= dt;
    if (s.remaining <= 0) delete bag[id];
  }
  return ticks;
}

export function has(bag: StatusBag | undefined, id: StatusId): boolean {
  return !!bag?.[id];
}

export function speedMultiplier(bag: StatusBag | undefined): number {
  if (!bag) return 1;
  let m = 1;
  for (const id of Object.keys(bag) as StatusId[]) {
    const def = statusDef(id);
    if (def.immobile) return 0;
    if (def.slowPerIntensity) m *= Math.max(0.15, 1 - def.slowPerIntensity * bag[id]!.intensity);
    if (def.speedMult) m *= def.speedMult;
  }
  return m;
}

/** Product of a numeric StatusDef field over the bag (1 when absent). */
function product(bag: StatusBag | undefined, field: 'castSpeed' | 'damageDealt' | 'damageTakenAll'): number {
  if (!bag) return 1;
  let m = 1;
  for (const id of Object.keys(bag) as StatusId[]) m *= statusDef(id)[field] ?? 1;
  return m;
}

/** Wind-up / recovery speed (Haste). */
export const castSpeed = (bag: StatusBag | undefined) => product(bag, 'castSpeed');
/** Outgoing damage multiplier (Glass cannon). */
export const damageDealtMultiplier = (bag: StatusBag | undefined) => product(bag, 'damageDealt');

/** Ethereal: harmful hits pass through, no offensive casts. */
export function isIntangible(bag: StatusBag | undefined): boolean {
  return !!bag && (Object.keys(bag) as StatusId[]).some((id) => statusDef(id).intangible);
}

/** Cleanse: remove every status that isn't an enchantment. Returns how many were removed. */
export function cleanse(bag: StatusBag): number {
  let n = 0;
  for (const id of Object.keys(bag) as StatusId[]) {
    if (statusDef(id).buff) continue;
    delete bag[id];
    n++;
  }
  return n;
}

export function canCast(bag: StatusBag | undefined): boolean {
  if (!bag) return true;
  return !(Object.keys(bag) as StatusId[]).some((id) => statusDef(id).noCast);
}

export function damageTakenMultiplier(bag: StatusBag | undefined, type: DamageType): number {
  if (!bag) return 1;
  let m = product(bag, 'damageTakenAll');
  for (const id of Object.keys(bag) as StatusId[]) {
    const mult = statusDef(id).damageTaken?.[type];
    if (mult !== undefined) m *= mult;
  }
  return m;
}
