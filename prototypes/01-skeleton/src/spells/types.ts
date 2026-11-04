// The spell contract. The resolver turns a queue snapshot into a SpellSpec
// (pure data); the runner plays a SpellSpec out over time by spawning
// generic effect entities. Replace the resolver to change what spells ARE;
// add effect kinds to change what spells can DO.

import type { Vec2 } from '../core/vec2';
import type { StatusApplication } from '../statuses/statuses';
import type { Entity } from '../world/entity';
import type { World } from '../world/world';
import type { DamageType, Element } from './elements';

export type CastMode = 'force' | 'area' | 'self' | 'weapon' | 'point';

export const CAST_MODES: readonly CastMode[] = ['force', 'area', 'self', 'weapon', 'point'];

/** What a Point cast is aimed at (the entity under the cursor, if any). */
export type PointTarget = 'ground' | 'ally' | 'enemy';

export type ConjuredWeapon = 'iceblade' | 'whip';

/** Extra inputs to the resolver beyond elements + mode. */
export interface ResolveContext {
  /** Seal is armed: store the spell in a vessel instead of firing it. */
  seal?: boolean;
  target?: PointTarget;
  /** A conjured weapon in hand changes the plain (empty-queue) swing. */
  conjured?: ConjuredWeapon | null;
}

/** Where a cast lands, captured at the moment of the press. */
export interface CastContext {
  /** Cursor point, clamped to point-cast range. */
  point: Vec2;
  /** Entity under the cursor (point casts), followed until the spell fires. */
  targetId: number | null;
  /** 0..1 hold-to-charge level, set by the runner when the charge ends. */
  charge: number;
}

/** Amount per damage type. `life` is healing; everything else hurts. */
export type DamageMap = Partial<Record<DamageType, number>>;

/**
 * What one hit delivers. For sustained effects (beam, spray, zone, arc) the
 * numbers are PER SECOND and are delivered in pulses scaled by the pulse length.
 */
export interface Payload {
  damage: DamageMap;
  statuses: StatusApplication[];
  /** Impulse magnitude, pushed away from the effect's origin / along its direction. */
  knockback: number;
  /** Whether the caster itself can be hit. Other allies always can (friendly fire). */
  hitsCaster?: boolean;
  /** Attuned (Life + damage): allies get `allyHeal` instead of the payload. */
  attuned?: boolean;
  allyHeal?: number;
  /** Only allies are affected (healing line). */
  alliesOnly?: boolean;
  /** Allies inside can't drop below 1 HP for a moment (Lantern). */
  grant?: 'deathless';
  /** Passes through bodies of the owner's team (enemy bolts fired from behind the front line). */
  sparesTeam?: boolean;
}

/** Where an effect is anchored: the caster, the cursor point, or the entity under the cursor. */
export type Anchor = 'caster' | 'point' | 'target';

interface EffectBase {
  payload: Payload;
  /** Elements used for visuals; defaults to the spell's elements. */
  tint?: readonly Element[];
  /** Default 'caster'. Point casts anchor at 'point' or 'target'. */
  at?: Anchor;
  /** Visual variant for the renderer ('geyser', 'strike', 'wave'...). */
  style?: string;
}

export interface ProjectileSpec extends EffectBase {
  kind: 'projectile';
  speed: number;
  radius: number;
  range: number;
  /** Fired in a fan: count projectiles across `spread` radians. */
  count?: number;
  spread?: number;
  /** Bounces off any wall this many times (Ricochet). */
  bounces?: number;
  /** Scales with hold-to-charge; a full charge pierces and carries the first enemy. */
  chargeable?: boolean;
  /** Spawned where the projectile stops (wall, target or max range). */
  onImpact?: EffectSpec;
}

export interface BeamSpec extends EffectBase {
  kind: 'beam';
  length: number;
  width: number;
  pulse: number;
}

export interface SpraySpec extends EffectBase {
  kind: 'spray';
  range: number;
  halfAngle: number;
  pulse: number;
}

/** Expanding ring that hits each target once as it passes. */
export interface BurstSpec extends EffectBase {
  kind: 'burst';
  radius: number;
  duration: number;
  /** Telegraph time before it goes off (Geyser rumble). */
  delay?: number;
}

/** Persistent area that pulses on everything inside. */
export interface ZoneSpec extends EffectBase {
  kind: 'zone';
  radius: number;
  duration: number;
  pulse: number;
  /** Stays centered on the caster (sustained circles, heal over time). */
  follow?: boolean;
  /** Only the caster is affected. */
  selfOnly?: boolean;
}

/** Instant melee cone in front of the caster. */
export interface SwingSpec extends EffectBase {
  kind: 'swing';
  range: number;
  halfAngle: number;
}

/** A front that travels along the ground and hits each target once (lines, waves). */
export interface FrontSpec extends EffectBase {
  kind: 'front';
  width: number;
  speed: number;
  range: number;
  /** Knockback direction: along the travel, or out to the sides. */
  push: 'forward' | 'aside';
  /** Leave a rock ridge along the path for this many seconds (Fault line). */
  ridge?: number;
}

/** Lightning that jumps between nearby targets. Wet targets conduct further. */
export interface ArcSpec extends EffectBase {
  kind: 'arc';
  range: number;
  jumps: number;
  jumpRange: number;
  pulse: number;
}

/** Pulls the target entity to the caster over `duration` (Yank). */
export interface TetherSpec extends EffectBase {
  kind: 'tether';
  duration: number;
}

/** Applied straight to the recipient: the caster, or the point target (heal, Mend). */
export interface SelfSpec extends EffectBase {
  kind: 'self';
}

/** Damage resistance for a while: on the recipient, or on every ally within `radius`. */
export interface WardSpec {
  kind: 'ward';
  resist: Partial<Record<DamageType, number>>; // 0.5 = take 50% less
  duration: number;
  at?: Anchor;
  radius?: number;
}

export type WallMaterial = 'rock' | 'ice' | 'shield' | 'elemental' | 'ridge';

/** Raises wall structures: across the aim, in a ring, or as a held guard (Bulwark). */
export interface WallSpec extends EffectBase {
  kind: 'wall';
  material: WallMaterial;
  layout: 'across' | 'ring' | 'guard';
  length: number;
  thickness: number;
  /** Distance from the anchor (ring radius for 'ring'). */
  distance: number;
  duration: number;
  /** Reflects every projectile, not just the owner's. */
  reflectAll?: boolean;
}

/** Creates a floor surface (Flood). */
export interface SurfaceSpec {
  kind: 'surface';
  surface: 'puddle';
  radius: number;
  at?: Anchor;
}

/** A floating lens that amplifies beams passing through it. */
export interface LensSpec {
  kind: 'lens';
  radius: number;
  duration: number;
  at?: Anchor;
}

/** Puts a weapon in the caster's hand for a while. */
export interface ConjureSpec {
  kind: 'conjure';
  weapon: ConjuredWeapon;
  duration: number;
}

/** Rule set A.1 Self enchantments (statuses with `buff`, except Cleanse which removes statuses). */
export type EnchantId = 'ethereal' | 'haste' | 'glass' | 'stoneskin' | 'cleanse';

/** Applied to the caster, or to the Point target (A.1: Point on an ally casts your Self spell). */
export interface EnchantSpec {
  kind: 'enchant';
  enchant: EnchantId;
  duration: number;
  /** Stoneskin: damage the rock armor soaks. */
  amount?: number;
  at?: Anchor;
}

/** A bubble that traps the target: it can't leave, nothing crosses the bubble (A.1 Cage). */
export interface CageSpec {
  kind: 'cage';
  /** Added to the target's radius. */
  margin: number;
  duration: number;
  at?: Anchor;
}

export type Vessel = 'staff' | 'rune' | 'line' | 'orbit' | 'loaded';

/** Seal: store `release` in a vessel instead of firing it. */
export interface SealSpec {
  kind: 'seal';
  vessel: Vessel;
  /** What fires when the vessel triggers (Area cast at a rune, Force cast from the staff...). */
  release: SpellSpec;
  /** Staff only: fires as an Area cast the moment the caster is hurt. */
  contingency?: SpellSpec;
  /** Rune only: stands up as a decoy enemies attack; fires when broken. */
  effigy?: boolean;
  /** Orbitals: charges added. */
  charges?: number;
  /** Orbitals: what a charge does when flung. */
  orbit?: 'projectile' | 'heal' | 'ward';
}

export type EffectSpec =
  | ProjectileSpec
  | BeamSpec
  | SpraySpec
  | BurstSpec
  | ZoneSpec
  | SwingSpec
  | FrontSpec
  | ArcSpec
  | TetherSpec
  | SelfSpec
  | WardSpec
  | WallSpec
  | SurfaceSpec
  | LensSpec
  | ConjureSpec
  | SealSpec
  | EnchantSpec
  | CageSpec;

export type EffectKind = EffectSpec['kind'];

/** Effects that live as effect entities (the rest act instantly when fired). */
export type SpawnableSpec = Extract<EffectSpec, { kind: 'projectile' | 'beam' | 'spray' | 'burst' | 'zone' | 'swing' | 'front' | 'arc' | 'tether' }>;

export interface SpellSpec {
  name: string;
  mode: CastMode;
  elements: readonly Element[];
  /** Spell-tree form and named leaf (from the resolver), for HUD and tests. */
  form?: string;
  leaf?: string | null;
  attuned?: boolean;
  /** Wind-up before effects spawn. A property of the spell, never of key timing. */
  castTime: number;
  /** Optional hold-to-charge after the wind-up; firing on release. Tapping fires at 0 charge. */
  charge?: { maxTime: number; moveMult: number };
  /** If set, effects persist while the cast button is held, up to maxDuration. */
  channel?: { maxDuration: number; minDuration: number; moveMult: number };
  /** Lock-out after the spell ends. */
  recovery: number;
  /** Movement multiplier during wind-up and recovery. */
  moveMult: number;
  effects: EffectSpec[];
}

export interface SpellResolver {
  /** Active rule set, if the resolver has several (Proposal A / A.1, toggled with F2). */
  rules?: 'a' | 'a1';
  /** Returns null when the combination does nothing (e.g. empty queue). */
  resolve(elements: readonly Element[], mode: CastMode, ctx?: ResolveContext): SpellSpec | null;
}

export type CastPhase = 'windup' | 'charge' | 'channel' | 'recovery';

export interface ActiveCast {
  spec: SpellSpec;
  ctx: CastContext;
  phase: CastPhase;
  /** Time spent in the current phase. */
  t: number;
  /** Entities owned by this cast that end with it (beams, sprays, guards, sustained zones). */
  channelEffectIds: number[];
}

export interface SpellRunner {
  /** Start playing a spec. The caller guarantees the caster is free to cast. */
  begin(world: World, caster: Entity, spec: SpellSpec, ctx: CastContext): void;
  /** Advance the caster's active cast; `held` is whether the cast button is still down. */
  update(world: World, caster: Entity, dt: number, held: boolean): void;
  /** End the active cast immediately (stun, death, interrupt). */
  cancel(world: World, caster: Entity): void;
}

/** Runtime state of a spawned effect entity. */
export interface EffectState {
  spec: SpawnableSpec;
  /** Per-instance payload (scaled by charge, lens...). */
  payload: Payload;
  ownerId: number;
  elements: readonly Element[];
  age: number;
  /** Unit direction (projectile flight, beam/spray/swing aim, front travel). */
  dir: Vec2;
  /** Follows the owner's position (and aim) each tick (beams, sprays, swings, arcs, follow zones). */
  attached: boolean;
  /** Ids already hit, for once-per-target effects. */
  hit: Set<number>;
  pulseTimer: number;
  /** Current reach, for rendering beams / bursts / fronts. */
  reach: number;
  traveled: number;
  /** Where it started (fronts). */
  start: Vec2;
  /** Tether target. */
  targetId?: number;
  /** Projectile: pierces bodies (full-charge rock) and carries the first one. */
  pierce?: boolean;
  carriedId?: number;
  bounces: number;
  reflects: number;
  /** Polyline for beams (through lenses) and arcs (through targets). */
  path?: Vec2[];
  /** Width multiplier of the last beam segment (after a lens). */
  boost?: number;
  /** One-shot latch (burst went off, ridge raised...). */
  fired?: boolean;
}
