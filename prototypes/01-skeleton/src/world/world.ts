import { Rng } from '../core/rng';
import type { Vec2 } from '../core/vec2';
import type { Element } from '../spells/elements';
import type { DamageMap } from '../spells/types';
import type { StatusApplication } from '../statuses/statuses';
import type { Encounter } from '../rooms/waves';
import type { Aabb } from './geometry';
import type { Entity } from './entity';

/** A pending hit, produced by effects/AI/statuses and resolved by the damage system. */
export interface HitEvent {
  targetId: number;
  sourceId: number | null;
  damage: DamageMap;
  statuses: StatusApplication[];
  impulse: Vec2;
}

/** Floating combat text (damage numbers, heals, reaction names). */
export interface Floater {
  pos: Vec2;
  text: string;
  color: string;
  age: number;
  life: number;
  big?: boolean;
}

/** One-shot visual cue for the renderer (steam puff, freeze, impact...). */
export interface FxEvent {
  name: string;
  pos: Vec2;
  color?: string;
}

/** An element touching the ground: the surface system reacts (surge, freeze, melt, burn). */
export interface Touch {
  pos: Vec2;
  radius: number;
  elements: readonly Element[];
  ownerId: number;
}

export class World {
  entities: Entity[] = [];
  walls: Aabb[] = [];
  time = 0;
  hits: HitEvent[] = [];
  touches: Touch[] = [];
  /** Ids that took damage this tick (Contingency). */
  damaged = new Set<number>();
  floaters: Floater[] = [];
  /** Drained by the renderer each frame. */
  fx: FxEvent[] = [];
  /** Sealed spells set off (runes, tripwires, orbitals, staff, loaded blows, contingencies) / sealed. */
  sealedFired = 0;
  sealedStored = 0;
  /** Wave director state (Arena only). */
  encounter?: Encounter;

  private nextId = 1;
  private byId = new Map<number, Entity>();

  constructor(
    readonly width: number,
    readonly height: number,
    readonly rng: Rng = new Rng(1),
  ) {}

  spawn(e: Omit<Entity, 'id'>): Entity {
    const ent = { ...e, id: this.nextId++ } as Entity;
    this.entities.push(ent);
    this.byId.set(ent.id, ent);
    return ent;
  }

  get(id: number | null | undefined): Entity | undefined {
    return id == null ? undefined : this.byId.get(id);
  }

  remove(e: Entity): void {
    e.removed = true;
  }

  /** Drop entities marked removed. Called by the cleanup system. */
  sweep(): void {
    if (!this.entities.some((e) => e.removed)) return;
    this.entities = this.entities.filter((e) => {
      if (e.removed) this.byId.delete(e.id);
      return !e.removed;
    });
  }

  hit(h: HitEvent): void {
    this.hits.push(h);
  }

  floater(pos: Vec2, text: string, color: string, big = false): void {
    // Stack above fresh floaters at the same spot so numbers don't overlap.
    const crowd = this.floaters.filter((f) => f.age < 0.35 && Math.abs(f.pos.x - pos.x) < 0.8 && Math.abs(f.pos.y - pos.y) < 0.8).length;
    const p = { x: pos.x, y: pos.y - crowd * 0.38 };
    this.floaters.push({ pos: p, text, color, age: 0, life: big ? 1.4 : 1.0, big });
  }

  cue(name: string, pos: Vec2, color?: string): void {
    this.fx.push({ name, pos: { ...pos }, color });
  }

  touch(pos: Vec2, radius: number, elements: readonly Element[], ownerId: number): void {
    if (elements.length) this.touches.push({ pos: { ...pos }, radius, elements, ownerId });
  }
}
