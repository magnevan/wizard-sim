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
  wallsPerOwner: 30, // segments (about 36 u of drawn wall); raising more drops the oldest
  arcRadius: 2.2, arcHalf: 0.14, arcSegs: 5, ringRadius: 2.6, ringSegs: 10, drawnSeg: 1.2,
  wallThickness: 0.25,
  waveSpeed: 7, waveRange: 6, waveHalf: 1.6, waveHalfPerRune: 0.4, shove: 8,
  /** Model A: energy structures drain the Shield pool; at the reserve floor the oldest breaks. */
  idleDrain: 0.03, wardDrainMult: 2, absorbPerHp: 0.01, barrierAbsorb: 0.1, reserve: 0.5,
  wardHp: 60, wardHpPerRune: 20, wardResist: 0.4, mirrorShots: 3, mendPerSec: 2,
  turretInterval: 1.0, turretRange: 8, turretAhead: 2.5,
  /** A turret shot costs this share of its payload's runes, and fires uncharged, as your tap cast does. */
  turretShotCost: 0.5,
  /** Your turrets together spend at most this share of your regen: shots slow down to fit (and with more turrets). */
  turretShare: 0.6,
  glyphArm: 0.8, glyphRadius: 0.8,
  orbitRadius: 1.3, orbitSpeed: 0.5, orbitStrike: 1.6,
  lensRadius: 0.9, lensMult: 1.5,
  auraTime: 12, auraRadius: 2.5, hasteMult: 1.4, glassMult: 1.3,
  weaponUses: 30, motes: 3, moteRefund: 0.5,
  /** Conjured shields: what they take before breaking, their frontal arc (half, turns), and the Buckler's parry window. */
  bulwarkHp: 160, bucklerHp: 70, guardHalf: 0.2, parry: 0.2,
  /** The Double: its health, its power and rune share per repeat, and how much more enemies want it. */
  doubleHp: 60, doubleShare: 0.5, doubleTaunt: 6,
  /** Blink goes to the cursor, up to this far (the user: start generous, nerf from there). */
  blinkRange: 30,
  /** Reach of each conjured weapon, by its leading element. */
  reach: { earth: 1.6, arcane: 3.2, life: 1.2, lightning: 3.4, water: 2.2, fire: 1.8, cold: 2.8 } as Partial<Record<Element, number>>,
};
