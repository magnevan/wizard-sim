import type { Vec2 } from '../core/vec2';
import type { DamageType, Element } from '../spells/elements';
import type { ElementQueue, AddOutcome } from '../spells/queue';
import type { ActiveCast, CastContext, CastMode, ConjuredWeapon, EffectState, Payload, PointTarget, SpellSpec, WallMaterial } from '../spells/types';
import type { StatusBag } from '../statuses/statuses';
import type { ArchetypeId } from './archetypes';

export type Team = 'player' | 'enemy' | 'neutral';
export type EntityKind = 'wizard' | 'enemy' | 'dummy' | 'effect' | 'structure' | 'surface' | 'effigy';

export interface CastRequest {
  mode: CastMode;
  elements: Element[];
  /** Seal was armed: store instead of fire. */
  sealed: boolean;
  /** Point casts: clamped cursor point and the body under it. */
  point: Vec2;
  targetId: number | null;
  target: PointTarget;
}

/** A sealed charge orbiting the caster (Seal + Area). */
export interface Orbital {
  elements: readonly Element[];
  release: SpellSpec;
  orbit: 'projectile' | 'heal' | 'ward';
}

/** Anything that holds an element queue and casts spells. */
export interface CasterComponent {
  queue: ElementQueue;
  aim: Vec2;
  /** Set by input/AI: a cast was requested, with the queue as it was at that instant. */
  request: CastRequest | null;
  /** The button that started the current cast is still held. */
  held: boolean;
  /** Resolved spell waiting for the caster to be free (input is never dropped). */
  pending: { spec: SpellSpec; ctx: CastContext; expiresAt: number } | null;
  /** Seal armed: the next cast goes into a vessel. */
  sealArmed: boolean;
  /** Release pressed this tick. */
  releaseRequested: boolean;
  /** Staff slot (Seal + Self). */
  staff: { elements: readonly Element[]; release: SpellSpec; contingency: SpellSpec | null } | null;
  /** Orbiting charges (Seal + Area). */
  orbitals: Orbital[];
  /** Next weapon hit unleashes this (Seal + Weapon). */
  loaded: { elements: readonly Element[]; release: SpellSpec } | null;
  /** Conjured weapon in hand. */
  conjured: { kind: ConjuredWeapon; until: number } | null;
  active: ActiveCast | null;
  /** Movement multiplier imposed by the current cast phase. */
  moveMult: number;
  /** Last queue event, for HUD feedback. */
  lastOutcome: { outcome: AddOutcome; at: number } | null;
  /** Last spell started, for HUD feedback. */
  lastCast: { name: string; at: number } | null;
}

export type EnemyState = 'approach' | 'windup' | 'dash' | 'grab' | 'cooldown';

export interface EnemyAi {
  kind: 'enemy';
  archetype: ArchetypeId;
  state: EnemyState;
  /** Time in the current state. */
  t: number;
  targetId: number | null;
  /** Locked telegraph point: slam centre, bolt / dash aim. */
  lock: Vec2 | null;
  /** Grabber: who is held, and the grabber's HP when it grabbed. */
  grabbedId: number | null;
  grabHp: number;
  /** Wave scaling of outgoing damage. */
  damageMult: number;
}

export type AiComponent = EnemyAi | { kind: 'dummy' };

export interface DummyComponent {
  home: Vec2;
  label: string;
  /** Recent damage for the DPS readout. */
  log: { at: number; amount: number }[];
  lastHit: { amount: number; type: DamageType; at: number } | null;
  total: number;
}

export interface PlayerComponent {
  index: number;
  color: string;
  respawnIn: number | null;
}

export interface Ward {
  resist: Partial<Record<DamageType, number>>;
  remaining: number;
}

/** A conjured wall: a capsule from a to b that blocks bodies, projectiles and beams. */
export interface WallState {
  a: Vec2;
  b: Vec2;
  /** Half thickness. */
  half: number;
  material: WallMaterial;
  ownerId: number;
  /** Reflects every projectile (shields). Otherwise only the owner's projectiles bounce. */
  reflectAll: boolean;
  /** Follows the owner's facing at this distance (Bulwark guard). */
  guard?: { distance: number; length: number };
  /** Elemental barrier: per-second payload pulsed onto bodies touching it. */
  payload?: Payload;
  elements: readonly Element[];
  pulseTimer: number;
}

/** Beams through a lens gain damage and width. The first beam in steers the output. */
export interface LensState {
  primaryId: number | null;
  primarySeenAt: number;
  mergedSeenAt: number;
}

/** A sealed rune on the ground (Seal + Point / Seal + Force). */
export interface RuneState {
  ownerId: number;
  shape: 'point' | 'line' | 'effigy';
  elements: readonly Element[];
  release: SpellSpec;
  armAt: number;
  createdAt: number;
  /** Trigger radius (point / effigy) or half-width (line). */
  radius: number;
  /** Line runes: the other end (pos is the start). */
  end?: Vec2;
}

/** A.1 Cage: a bubble around one body. It can't leave; nothing crosses the bubble. */
export interface CageState {
  targetId: number;
  ownerId: number;
  createdAt: number;
}

export type SurfaceType = 'puddle' | 'ice' | 'grass' | 'burning';

export interface SurfaceState {
  type: SurfaceType;
  radius: number;
  /** Seconds of lightning glow left (Surface Surge). */
  surge: number;
  /** Rate limits for surge / steam / wet application. */
  surgeCd: number;
  steamCd: number;
  wetTimer: number;
  /** Burning grass: seconds until it burns out. */
  burnLeft: number;
}

/**
 * Entities are plain objects with optional components. Systems iterate the
 * world and act on whatever components are present.
 */
export interface Entity {
  id: number;
  kind: EntityKind;
  pos: Vec2;
  /** Physical velocity: knockback and projectiles. Decays with friction. */
  vel?: Vec2;
  /** Desired walk direction (length 0..1), set by input/AI. */
  move?: Vec2;
  moveSpeed?: number;
  radius?: number;
  mass?: number;
  friction?: number;
  /** Takes part in body-vs-body and body-vs-wall collision. */
  solid?: boolean;
  team?: Team;
  hp?: number;
  maxHp?: number;
  /** Never dies (training dummies). */
  immortal?: boolean;
  statuses?: StatusBag;
  ward?: Ward;
  /** Aim / look angle in radians. */
  facing?: number;
  caster?: CasterComponent;
  ai?: AiComponent;
  effect?: EffectState;
  dummy?: DummyComponent;
  player?: PlayerComponent;
  wall?: WallState;
  lens?: LensState;
  rune?: RuneState;
  surface?: SurfaceState;
  cage?: CageState;
  /** Stoneskin: damage left that the rock armor soaks (only while the status lasts). */
  armor?: number;
  /** Last "Phased" / "Caged" floater, to rate-limit them. */
  phasedAt?: number;
  /** Structures and conjured things vanish at this world time. */
  expiresAt?: number;
  /** Can't drop below 1 HP until this world time (Lantern). */
  deathlessUntil?: number;
  /** Standing on ice this tick: slippery. */
  onIce?: boolean;
  /** Enemies prefer to attack this (Effigy). */
  taunt?: boolean;
  /** Last time a shield blocked a hit (render flash). */
  blockedAt?: number;
  /** Held by a grabber (id): can't walk. */
  grabbedBy?: number;
  /** Out of play (dead player waiting to respawn): not drawn, hit or collided. */
  downed?: boolean;
  /** Marked for removal at the end of the tick. */
  removed?: boolean;
  /** Seconds of white hit-flash left, for rendering. */
  hitFlash?: number;
}

export function isHittable(e: Entity): boolean {
  return e.hp !== undefined && !e.downed && !e.removed;
}
