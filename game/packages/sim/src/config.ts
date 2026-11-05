/**
 * Every gameplay number in one place, in seconds and world units (converted to ticks where
 * used). Placeholder balance: the point of milestone 1 is that each spell does the right
 * kind of thing, not that the numbers are right.
 */
import type { Element } from '@wizard-sim/rules';

export const T = (seconds: number): number => Math.round(seconds * 60);

/** Rune pools, from the Pixel Battlefield mock-up: about 4 per element, slow regen. */
export const RUNES = {
  max: { water: 4, life: 4, shield: 4, cold: 4, lightning: 4, arcane: 4, sigil: 3, fire: 5, earth: 4 } as Record<Element, number>,
  /** Runes per second, per element. */
  regen: 0.22,
  /** Attune (plain Arcane on yourself): regen multiplier and how long it lasts. */
  attuneMult: 2.5,
  attuneTime: 6,
};

/** Cast rhythm: a property of the spell, not of the keys. */
export const RHYTHM = {
  windup: 0.12, // seconds, plus windupPerRune for each rune in the spell
  windupPerRune: 0.04,
  recovery: 0.18,
  /** Area tap vs Place hold on the Area button. */
  placeHold: 0.25,
  /** A Place drag counts once the cursor moved this far while held. */
  dragMin: 1.0,
  /** Channels (beams, sprays, arcs) are free for this long, then cost upkeep as regen debt. */
  naturalChannel: 2.5,
  upkeep: 0.4, // runes per second of the form element, past the natural duration
  /** A cast pressed while busy waits this long for the current one to finish. */
  castBuffer: 0.3,
  /** Earth Force: hold to charge, up to this long. */
  chargeMax: 1.0,
};

/** Damage per rune of an element, for one hit. Channels deal this per second times `channelRate`. */
export const DAMAGE: Record<Element, number> = {
  water: 0, life: 0, shield: 0, cold: 5, lightning: 10, arcane: 16, sigil: 0, fire: 6, earth: 22,
};
export const COMBAT = {
  healPerLife: 14,
  /** Per-second damage of a beam or spray = per-hit damage x this. */
  channelRate: 1.0,
  /** Channels build statuses (chill, wet, burn) this many times faster than per-second hits would. */
  channelStatus: 3,
  /** Sprays: share of the damage each body behind the nearest one takes (1 = everyone takes it all). */
  sprayFalloff: 0.6,
  /** Forms without their own curve (lightning, shield, sigil): each extra rune adds this share of the first rune's damage. */
  formScaling: 0.7,
  /** Sprays grow with n^sprayExp (0.5 = square root, as Magicka's); rocks with n^rockExp (1.5: going all-in pays). */
  sprayExp: 0.5,
  rockExp: 1.5,
};

/** How long floor surfaces last, in seconds. */
export const SURFACE = { water: 20, ice: 16, fire: 10 };

export const STATUS = {
  // Longer than our first pass, toward Magicka's (it burns 5 s per stack, chills 10 s, freezes 4 s).
  wet: 12, // seconds
  burn: 5, burnDps: 6,
  chillPerRune: 0.6, chillDecay: 0.25, chillMax: 3, freeze: 3.5,
  stunPerRune: 0.35,
  expose: 2, exposeMult: 1.3,
  knockdown: 0.6,
  /** Lightning on a wet target. */
  wetShockMult: 2,
  /** A heavy (earth) hit on a frozen target. */
  shatterMult: 2,
  scaldBonus: 8,
};

export const SHAPES = {
  beamRange: 12, beamWidth: 0.35,
  sprayRange: 4.5, sprayHalfAngle: 0.09, // turns (about 32 degrees)
  arcRange: 6, arcJump: 3.5, arcInterval: 0.2, arcJumps: 2, // jumps, plus one per extra lightning rune (Chain)
  missileSpeed: 12, missileLife: 1.4, missileRadius: 0.3,
  shardCount: 5, shardSpread: 0.035, // turns between shards
  novaRadius: 3, novaPerRune: 0.6,
  placeRange: 9,
  patchRadius: 1.6, patchLife: 6,
  delayedBlast: 0.6, // geyser rumble / arcane blast fuse
  swingRange: 1.6, swingHalfAngle: 0.15,
  push: 6, // u/s added per water rune (Push)
  burstRadius: 1.4,
};

export const BODY = {
  wizardHp: 100, wizardRadius: 0.45, walkSpeed: 4.2,
  /** Walking speed while you hold a channel or a charge, as a fraction of walkSpeed. */
  castWalk: 0.5,
  dummyHp: 400, dummyRadius: 0.5, dummyResetAfter: 3,
  friction: 0.25, // fraction of the gap to the wanted velocity closed per tick
};

/** The placeholder arena, in world units (a wizard is about 0.9 u wide). */
export const ARENA = { w: 24, h: 16 } as const;
/** Surface grid cell size. */
export const CELL = 0.5;

/** Shield and Sigil structures. */
export const STRUCT = {
  rockHp: 120, rockHpPerRune: 40, energyHp: 80, energyHpPerRune: 20,
  wallsPerOwner: 40, // a technical ceiling: rock times out (rockLife) and energy drains your pool, so play rarely meets it
  arcRadius: 2.2, arcHalf: 0.14, arcSegs: 5, ringRadius: 1.5, ringSegs: 8, drawnSeg: 1.2,
  /** Rock walls stand this long (s), plus rockLifePerEarth per extra Earth, crumbling over the last rockCrumble s. */
  rockLife: 25, rockLifePerEarth: 5, rockCrumble: 3,
  wallThickness: 0.25,
  waveSpeed: 7, waveRange: 6, waveHalf: 1.6, waveHalfPerRune: 0.4, shove: 8,
  /** Model A: energy structures drain the Shield pool; at the reserve floor the oldest breaks. */
  idleDrain: 0.03, wardDrainMult: 2, absorbPerHp: 0.01, barrierAbsorb: 0.1, reserve: 0.5,
  wardHp: 60, wardHpPerRune: 20, wardResist: 0.4, mirrorShots: 3, mendPerSec: 2,
  turretInterval: 1.0, turretRange: 8, turretAhead: 2.5,
  /** Your hands (hands.ts): a Heavy's power and reach against a Strike, a Sweep's power, the Retreat hop. */
  heavyScale: 1.8, heavyReach: 1.3, sweepScale: 0.8, retreatPush: 11,
  /** A turret shot costs this share of its payload's runes, and fires uncharged, as your tap cast does. */
  turretShotCost: 0.5,
  /** Your turrets together spend at most this share of your regen: shots slow down to fit (and with more turrets). */
  turretShare: 0.6,
  glyphArm: 0.8, glyphRadius: 0.8,
  orbitRadius: 1.3, orbitSpeed: 0.5, orbitStrike: 1.6,
  lensRadius: 0.9, lensMult: 1.5,
  auraTime: 12, auraRadius: 2.5, hasteMult: 1.4, glassMult: 1.3,
  weaponUses: 30, motes: 3, moteRefund: 0.5,
  /** The Double: its health, its power and rune share per repeat, and how much more enemies want it. */
  doubleHp: 60, doubleShare: 0.5, doubleTaunt: 6,
  /** Blink goes to the cursor, up to this far (the user: start generous, nerf from there). */
  blinkRange: 30,
  /** Reach of each conjured weapon, by its leading element. */
  reach: { earth: 1.6, arcane: 3.2, life: 1.2, lightning: 3.4, water: 2.2, fire: 1.8, cold: 2.8 } as Partial<Record<Element, number>>,
};

/**
 * Weapons and guards, round 2 (docs/explorations/2026-11-05-guards.md): the weapon-specific Heavies
 * and Specials, the Echo focus, and the eight guards' Defend, Retreat and passives. Built on the
 * doc's recommendations, pending the user's round-2 ratings. Distances in world units.
 */
export const ARMS = {
  // ---- Heavies (2 uses unless noted) ----
  /** Weapon waves (trident slash, fire wave, earth fissure): their power, half-width and how far they roll. */
  waveScale: 1.4,
  tideHalf: 1.0, tideRange: 5,
  fireHalf: 1.5, fireRange: 6,
  quakeHalf: 0.45, quakeRange: 7.5,
  /** Healing link (Life): picks the ally within linkPick of the cursor, holds to linkRange (or a wall), heals linkHeal hp/s, costs linkUses uses a second. */
  linkRange: 8, linkPick: 1.5, linkHeal: 12, linkUses: 1,
  /** Charged bolt (Arcane wand): its power at full charge, and how fast it flies. */
  chargedBolt: 1.1, boltSpeed: 14,
  /** Impaling dash (Cold): this many times the spear's reach; frozen targets on the way shatter. */
  dashMult: 2.5,
  /** Chain lash (Lightning): jumps after the first target, and how far each jump reaches. */
  lashJumps: 3, lashJump: 3.5,
  // ---- Specials ----
  /** The spear's javelin: uses, speed, how long it pins (roots) the target, and the frost it leaves. */
  javelinUses: 2, javelinSpeed: 16, pin: 1.5, frostRadius: 1.0,
  /** Arcane wand: the Strike bolt's power; Siphon (held Special, rooted) multiplies your rune regen, for siphonUses a second. */
  boltScale: 0.45, siphonMult: 4, siphonUses: 1,
  /** Mend (Healing hands' held Special): heals allies within auraRange (not you) auraHeal hp/s, auraUses a second; you walk at auraWalk. */
  auraRange: 3.5, auraHeal: 7, auraUses: 1, auraWalk: 0.5,
  /** Carrying a guard, or a weapon, costs this much walking speed each (the user: carrying should slow you a little). */
  carryWalk: 0.95,
  // ---- Guards ----
  /** Retreat and Defend share this fixed recovery after a Retreat (pillar 4: a rhythm, not a hidden cooldown). */
  retreatRecovery: 0.5,
  /** Parry windows (s): the Mirror buckler's is the widest. */
  parryMirror: 0.2, parry: 0.12,
  /** Frontal block arcs (half, turns). */
  blockMirror: 0.09, blockBulwark: 0.2, block: 0.13,
  /** Walking while blocking (x walk speed): the Mirror is Light (1); the Bulwark slows you most; and the Bulwark's always-on slow. */
  blockWalk: 0.7, bulwarkBlockWalk: 0.4, bulwarkWalk: 0.85,
  /** Retreat distances: Backstep, Shove step, Flame step, Ice slide, Blink, Surge, Phase, Seed step. */
  backstep: 3, shoveStep: 1.5, flameStep: 3, iceSlide: 5, blink: 3, surge: 3, phase: 2.5, seedStep: 2.5,
  /** Shove step (Bulwark): the slab's reach, its knockback and the stun it leaves. */
  shoveRange: 2.6, shoveKnock: 14, shoveStun: 0.6,
  /** Phase (through bodies), the Flame step's fire line, the Blink spark, and the Seed step's healing bloom, in seconds; the bloom's radius. */
  phaseTime: 0.5, flameLine: 1, spark: 4, seedLife: 4, seedRadius: 1.2,
  /** Heals: Leaf regrowth (hp/s), a Leaf block to allies around you (hp/s), a Leaf parry (you too), and how far "around" reaches. */
  regrowth: 1, leafBlockHeal: 8, leafParryHeal: 20, leafRange: 3.5,
  /** A Rime block chills a melee attacker by this much (chill stacks). */
  rimeChill: 1,
  /** Guard damage multipliers: the Spark ring is the weakest block; Water douses the Ember targe. */
  sparkBlock: 1.5, emberWater: 2,
  /** Mixing (explorations/2026-11-05-guards-round-2.md): a mixed-in element brings this share of its resistance row per rune (2 runes: all of it), and its coat bites at this power. */
  mixShare: 0.5, coatScale: 0.5,
  /** Each rune in a guard past the first adds this much guard HP and Retreat distance. */
  runeSize: 0.15,
  /** A guard resistance this high (an own-element guard's) also wards off that element's status: no stun, burn or chill. */
  resStatus: 3,
  /** What each guard takes before it breaks. */
  hp: { mirror: 90, bulwark: 160, ember: 90, rime: 90, spark: 45, tide: 90, prism: 90, leaf: 90 },
};
