/**
 * Every gameplay number in one place, in seconds and world units (converted to ticks where
 * used). Placeholder balance: the point of milestone 1 is that each spell does the right
 * kind of thing, not that the numbers are right.
 */
import type { Element } from '@wizard-sim/rules';

export const T = (seconds: number): number => Math.round(seconds * 60);

/**
 * Rune pools, from the Pixel Battlefield mock-up: about 4 per element. Regen is one shared budget
 * (docs/decisions 2026-11-05, "The rune economy"): `regen` runes a second in total, split among the
 * pools that aren't full, weighted by their max; `floor` of it always reaches every pool that isn't
 * full. Per pool: floor·R·max/Σmax_all + (1-floor)·R·max/Σmax_notfull (world.ts regenRate).
 */
export const RUNES = {
  // Ice (Water + Cold combined) has no pool of its own: its runes come from Water's and Cold's.
  max: { water: 4, life: 4, shield: 4, cold: 4, lightning: 4, arcane: 4, sigil: 3, fire: 5, earth: 4, ice: 0 } as Record<Element, number>,
  /** R: runes per second in total, shared among the pools that aren't full. */
  regen: 1.0,
  /** An empty pool (under a whole rune) takes this many shares of R; every other pool that isn't full takes one (world.ts regenRate). */
  emptyShare: 2,
  /** Survive starts weak: this many runes per element, Sigil surviveSigil. */
  surviveStart: 2,
  surviveSigil: 1,
  /** Attune (plain Arcane on yourself): regen multiplier and how long it lasts. */
  /**
   * Attune (Arcane on yourself, spell audit 2026-11-11): regen x attuneMult for attuneTime s a rune of Arcane, a sting of
   * attuneSting HP a rune, and while it lasts you take attuneVuln x the damage. One Arcane nets about 2 runes for 16 HP and
   * 3 s of vulnerability; it was 2.5x for 6 s and 3 HP, about 9 runes for one: the best spell in the game.
   */
  attuneMult: 2,
  attuneTime: 3,
  attuneSting: 16,
  attuneVuln: 1.25,
};

/** Cast rhythm: a property of the spell, not of the keys. */
export const RHYTHM = {
  /** Two Sigil presses with no free Sigil rune within this many seconds are a double-tap: dismiss what's under the cursor, or recall your oldest. */
  dryTap: 0.4,
  windup: 0.12, // seconds, plus windupPerRune for each rune in the spell
  windupPerRune: 0.04,
  recovery: 0.18,
  /** Area tap vs Place hold on the Area button. */
  placeHold: 0.18, // was 0.25: the user found the wait from Area to Place a little long (2026-11-11)
  /** A Place drag counts once the cursor moved this far while held. */
  dragMin: 1.0,
  /** Channels (beams, sprays, arcs) are free for this long, then cost upkeep as regen debt. */
  naturalChannel: 2.5,
  upkeep: 0.4, // runes per second for each rune in the spell, from that rune's element, past the natural duration
  /** A cast pressed while busy waits this long for the current one to finish. */
  castBuffer: 0.3,
  /** Earth Force: hold to charge, up to this long. */
  chargeMax: 1.0,
};

/** Damage per rune of an element, for one hit. Channels deal this per second times `channelRate`. */
export const DAMAGE: Record<Element, number> = {
  water: 4, life: 0, shield: 0, cold: 5, lightning: 10, arcane: 16, sigil: 0, fire: 6, earth: 28,
  ice: 16, // Water and Cold shaped into a sharp one (its identity is damage, quick flight, spikiness): one Ice is two runes, so it hits like two (spell audit, 2026-11-11; was 9)
};
export const COMBAT = {
  healPerLife: 14,
  /** Per-second damage of a beam or spray = per-hit damage x this. */
  channelRate: 1.0,
  /** Channels build statuses (chill, wet, burn) this many times faster than per-second hits would. */
  channelStatus: 3,
  /** Sprays: share of the damage each body behind the nearest one takes (1 = everyone takes it all). */
  sprayFalloff: 0.6,
  /** Forms without their own curve (lightning, arcane, shield, sigil): each extra rune adds this share of the first rune's damage. Beams too: a channel's runes are paid for every second (rhythm.upkeep), so they buy power, not time. */
  formScaling: 0.7,
  /** Sprays grow with n^sprayExp (0.5 = square root, as Magicka's); rocks with n^rockExp (1.5: going all-in pays). */
  sprayExp: 0.5,
  rockExp: 1.3, // with earth 28 (spell audit, 2026-11-11: was 22 on n^1.5): a 1-rune rock is worth casting, the top end about the same
};

/** How long floor surfaces last, in seconds. */
export const SURFACE = { water: 20, ice: 16, fire: 12, /** frost damage a second that ice does to whoever stands on it (chill only) */ iceChill: 8 };

export const STATUS = {
  // Longer than our first pass, toward Magicka's (it burns 5 s per stack, chills 10 s, freezes 4 s).
  /** The least any soaking hit leaves a body wet for (a spray's ticks are too weak to soak for long on their own). */
  /**
   * Soak (spell audit, 2026-11-11): how wet a body is, 0..1, filled by Water runes like chill by Cold. The pool holds
   * soakPool x sqrt(max HP); each Water rune in a hit adds soakPerRune times the hit's scale; it drains soakDecay of the
   * pool a second. Lightning's bonus, its chains' reach and a freeze's length scale with it; each Fire rune dries
   * dryPerRune of it. A puddle or rain soaks you through.
   */
  soakPool: 2.5, soakPerRune: 12, soakDecay: 0.04, dryPerRune: 12,
  /**
   * Burning is a pool of damage on the body, spent evenly over `burn` seconds (refreshed by each new hit), up to burnCap.
   * It grows with the Fire in what lit it (spell audit, 2026-11-11: more Fire burns hotter; any touch of Fire is no
   * longer worth a flat 12): a small base to light, most of a hit's Fire damage, a little of the rest.
   */
  burn: 4, burnBase: 4, burnShareFire: 1.5, burnShareRest: 0.15, burnCap: 80,
  /**
   * Burn-only sources, per Fire rune in them. A fire floor lights you for burnFloorTouch on contact, then adds burnFloorRate
   * a second while you stand in it (the user, 2026-11-11: a brush is forgivable, standing in fire isn't). A fire aura adds
   * burnAura each half second. A thorn's contact is flat.
   */
  burnFloorTouch: 6, burnFloorRate: 4, burnAura: 3, burnContact: 30,
  /**
   * Chill is how full a body's frost pool is, 0..1. The pool holds chillPool x sqrt(max HP) frost damage, so big
   * bodies take more but never become unfreezable. It drains chillDecay of the whole pool a second, even under fire,
   * so a weak source plateaus or fails on a tough body. Full chill slows by chillSlow.
   * It fills by rune, not by damage (spell audit, 2026-11-11: a frost-heavy spell is a slow-heavy spell): each Cold rune
   * in a hit adds chillPerRune frost, times the hit's scale (a channel's per-tick share, a shard's 0.75).
   */
  chillPool: 2.5, chillPerRune: 8, chillDecay: 0.1, chillSlow: 0.6,
  /** An Ice rune chills this share of a Cold rune: some chill comes with it, but its identity is damage. */
  iceChill: 0.6, // enough that one Ice on a wet goblin still freezes it (the special case of frost)
  /** Cold on a wet body freezes it from this much chill up: freezeShort s at that chill, up to `freeze` s when full. */
  freezeMin: 0.3, freezeShort: 1.5, freeze: 4,
  /**
   * Shock is a chance, not a meter (the user, 2026-11-11: electricity is instant). Each hit with Lightning stuns for
   * stunTime with chance x / (1 + x), x = shockRate x Lightning runes x the hit's scale x sqrt(shockRef / max HP). So one
   * Lightning stuns a goblin most times and a brute less than half; a channel's ticks add up to about shockRate
   * stuns a second per rune on a wizard-sized body, rather than a lock.
   */
  shockRate: 0.85, shockRef: 100, stunTime: 0.4,
  expose: 2, exposeMult: 1.3,
  knockdown: 0.6,
  /** Lightning on a wet target. */
  wetShockMult: 2,
  /** A heavy (earth) hit on a frozen target. */
  shatterMult: 2,
  /** Steam (Water + Fire in one spell): it never soaks and its water doesn't douse its own fire; its hits deal steamDamage of what they would, and the burn it lights steamBurn. Fire stays the damage element. */
  steamDamage: 0.8, steamBurn: 0.75,
};

export const SHAPES = {
  beamRange: 30, beamWidth: 0.35, // past the edge of the view: a beam runs until it hits something
  sprayRange: 4.5, sprayHalfAngle: 0.09, // turns (about 32 degrees)
  /**
   * Spell audit, 2026-11-11. Each zap of a held arc (it aims itself and chains, so it gives up damage to the aimed beam),
   * a Discharge's zap and a Strike's hit, as shares of the payload; and the close casts' edge over the placed ones
   * (Earthquake over Geyser, Arcane nova over blast).
   */
  arcPower: 0.35, dischargePower: 1.6, strikePower: 1.9, closePower: 1.3,
  /** The Geyser's eruption: below the Earthquake's closePower, as it's at range, but its delay and small aimed circle earn some back (the user chose B, 2026-11-11). */
  geyserPower: 1.15,
  /** Heals (spell audit, 2026-11-11, judged by effective healing): the Life beam (hard to aim at allies, blockable) 1.5x; the Healing ring 1.8x (about 25 a Life); the Healing palm 2.1x (about 30: strictly close, so above the self-heal's 21); each Chain heal zap 0.25 (the easy, auto-aimed version, halved). */
  lifeBeamPower: 1.5, healRingPower: 1.8, palmPower: 2.1, chainHealPower: 0.25,
  arcRange: 6, arcJump: 3.5, arcInterval: 0.2, arcJumps: 2, // jumps, plus one per extra lightning rune (Chain)
  /**
   * Every missile flies at this speed (a quick rock at 60 % of it): the user, 2026-11-10, found 12 and then 16 sluggish
   * and asked for one speed for all projectiles unless one has a reason to differ. Ice shards keep their short reach.
   */
  missileSpeed: 20, missileLife: 1.4, missileRadius: 0.3,
  /** How far an ice shard flies before it melts, u: the shotgun's reach. */
  shardRange: 7.2,
  /** Earth + Water + Cold's three ice shards fly this fast, u/s: faster than other missiles, for their shape. */
  iceShardSpeed: 32,
  /** Each ice shard's share of the rock: three of them hit 1.7 rocks, the +70 % a third rune pays elsewhere. */
  iceShardShare: 0.57,
  /** Ticks between the ice shards leaving, and how far apart they fan, turns. */
  iceShardGap: 4, iceShardFan: 0.006,
  /** Radius of the frost puff a Cold-carrying missile leaves where it ends, u (+0.3 a Cold rune past the first). */
  frostPuff: 1.4,
  shardCount: 5, shardSpread: 0.035, // turns between shards
  /**
   * Healing shards (Life + Ice) seek hurt allies (spell audit, 2026-11-11: their text promised it; the user agreed). Each
   * shard turns toward the hurt ally nearest its heading, within healSeekCone turns of it and healSeekRange u, at up to
   * healTurn turns a second. They reach farther than Ice's shards (healShardRange u), and heal at healShardPower each.
   */
  healShardRange: 10, healSeekCone: 0.16, healSeekRange: 10, healTurn: 1.2, healShardPower: 0.75,
  /**
   * Caltrops (Ice Place, spell audit 2026-11-11): ice spikes on the ground for caltropLife s (+ lingerPerRune a rune), no hit
   * when they land. Whoever walks through is stabbed by the distance walked: caltropPerU of the payload a unit, so crossing
   * a 4 u field is about one Ice hit, and standing still is safe.
   */
  caltropLife: 10, caltropPerU: 0.25,
  /** Ice shards fly this much faster than other missiles (Ice: damage and quick flight). */
  iceFlight: 1.5,
  /** Each ice shard's share of the payload: 0.75, so a full 6-shard volley lands the 4.5x it did before every shard hit alike. */
  shardPower: 0.75,
  novaRadius: 3, novaPerRune: 0.6,
  placeRange: 9,
  patchRadius: 2, patchLife: 8, // were 1.6 and 6: the user asked for bigger, longer Place effects (2026-11-11)
  /** Each extra rune of a Place patch's lead: steam and the floors it leaves last this share of their life longer. */
  lingerPerRune: 0.2,
  /** Rain (Water Place): it keeps falling this long, plus rainPerRune per extra Water, soaking and dousing whoever is under it. */
  rainLife: 7, rainPerRune: 1,
  delayedBlast: 0.6, // geyser rumble / arcane blast fuse
  swingRange: 1.6, swingHalfAngle: 0.15,
  /** The imbued burst (Weapon cast with elements, no Sigil or Shield): a cone in front of you, a little longer per extra rune. */
  imbueRange: 2.5, imbuePerRune: 0.6, imbueHalf: 0.17, // per rune was 0.25: the user wanted it to grow like the nova (2026-11-11)
  /**
   * An Earth-led burst is a line, a tremor through the ground (the user, 2026-11-11: "very small radius, longer range"),
   * whatever else is infused: whoever stands within lineHalf of it (u, plus their own radius) is hit.
   */
  imbueLineRange: 4.5, imbueLinePerRune: 0.9, imbueLineHalf: 0.45,
  /**
   * A Lightning-led burst forks: bolts from the staff to the nearest targets in the cone, each jumping on to one more.
   * Against the channelled arc it is all up front (the user: more damage at once, a little less rune-efficient, no channel).
   */
  forkRange: 4, forkTargets: 3, forkPower: 1.6, forkJump: 0.6,
  /** The burst's power against the ring's. It's 1 because the cone already earns its place: it spares allies beside and behind you. */
  imbuePower: 1,
  /** A Fire ring's or burst's direct hit, times Fire's table damage (which is set for a spray's per-second rate). */
  fireBlast: 2,
  /** Ice's ring and burst, so the close cast beats the shards (spell audit, 2026-11-11: it was 16 for its two runes). */
  iceBlast: 2,
  /** Arcane's one-shot casts (nova, blast, burst): a flat bonus, as its table damage is the beam's per-second rate (the cross-cut, 2026-11-11). */
  arcaneBlast: 1.6,
  /** The same for Cold, kept below Fire's: Cold's job is the slow, and it has no burn on top. */
  coldBlast: 1.6,
  push: 6, // u/s added per water rune (Push)
  /** The rings are a spray element's strongest instant hit on its axis: the Frost ring chills this many times as hard, the Splash ring pushes this many times as far. */
  ringChill: 2, ringPush: 2,
  burstRadius: 1.4,
};

export const BODY = {
  wizardHp: 100, wizardRadius: 0.45, walkSpeed: 4.2,
  /** Walking speed while you hold a channel or a charge, as a fraction of walkSpeed. */
  castWalk: 0.5,
  dummyHp: 400, dummyRadius: 0.5, dummyResetAfter: 3,
  friction: 0.25, // fraction of the gap to the wanted velocity closed per tick
};

/** Survive's power-ups that carry numbers of their own, and Rally, which every wizard has there (survive.ts). */
export const PERKS = {
  /** Rally: seconds standing by a downed ally to bring them back. Casting, a weapon move, blocking or being held starts it over; a hit drains some. */
  rallyTime: 3,
  /** A hit on the rescuer drains this many seconds of the ring (at most once every rallyDrainGap s; burning counts), instead of emptying it. */
  rallyDrain: 1, rallyDrainGap: 0.5,
  /** Rally: how close you must stand, centre to centre (two wizards touching are 0.9 apart). */
  rallyRange: 1.6,
  /** Rally: the share of max health the ally comes back with (the breather gives half). */
  rallyHp: 0.4,
  /** Echo: seconds after a spell before its free echo goes off (from where you stand then, along your aim then); a channel's echo trails your aim by as much. */
  echoDelay: 0.4,
  /** Echo is this many times as likely to be on an altar before a key wave (survive.ts keyWave: the 5th and 8th of every eight). */
  echoKeyWeight: 3,
  /** Lingering: what you place or leave lingering lasts this many times as long, and is this many times as wide. */
  lingerLife: 1.5, lingerSize: 1.25,
  /** Quickstep, per stack: the share faster you walk, wind up and recover (a permanent, weaker Haste; the Haste aura is STRUCT.hasteMult). */
  quickstep: 0.15,
  /** Glass heart, per stack: the share more damage you deal, and the share of max health you lose (additive: two stacks are +50% / -50%). */
  glassDmg: 0.25, glassHp: 0.25,
  /** Wellspring, per stack: the share more total regen R (additive). */
  wellspring: 0.15,
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
  /** Ice walls (Shield + Ice): a spike barrier, weaker and shorter-lived than rock, that stabs whoever presses against it
   * (spikeScale of its payload each half second). Fire melts it: iceMelt times the damage. */
  iceHp: 70, iceHpPerRune: 25, iceLife: 15, iceLifePerRune: 3, iceMeltAway: 2, spikeScale: 0.6, iceMelt: 2.5,
  /** The Spike aura (Sigil + Ice on yourself): each half second, an Ice hit at this scale per Ice rune on enemies close by. */
  spikeAura: 0.2, // was 0.4, twice the Fire aura's damage (spell audit, 2026-11-11)
  wallThickness: 0.25,
  /** Enemies path through a barrier as if it were this many units of extra walking a cell (nav.ts), so a pack breaks through when going round is longer. */
  barrierDetour: 4,
  /** A coated force field bites the enemies pressing on it or battering it with its elements, each half second, at this scale (the old curtain's 0.4: on the strong side, the user likes defence strong). */
  fieldBite: 0.5,
  waveSpeed: 7, waveRange: 6, waveHalf: 1.6, waveHalfPerRune: 0.4, shove: 8,
  /** Model A: energy structures drain the Shield pool; at the reserve floor the oldest breaks. */
  idleDrain: 0.03, wardDrainMult: 2, absorbPerHp: 0.01, reserve: 0.5,
  /**
   * Wards (spell audit, 2026-11-11, the user: "the shield rune should be a battery that can wear out if overloaded"). An
   * elemental ward gives wardPerRune resistance points a rune of each element, on the guards' and the imbue's hyperbolic
   * scale and added to them (1 / 2 / 3 runes: 40 / 57 / 67 % less), and never decays. It has no HP of its own: what it
   * absorbs drains its caster's Shield pool, wardAbsorb a point, on top of the idle drain, and at the reserve floor it
   * breaks. Stone armour (with Earth) is stuff, paid once: what it absorbs comes off its own wardHp.
   */
  wardHp: 60, wardHpPerRune: 20, wardPerRune: 0.67, wardAbsorb: 0.015, mirrorShots: 3, mendPerSec: 2,
  turretInterval: 1.0, turretRange: 8,
  /** A turret shot costs this share of its payload's runes, and fires uncharged, as your tap cast does. */
  turretShotCost: 0.5,
  /** Your turrets together spend at most this share of your total regen R from their main element: shots slow down to fit (and with more turrets). 0.13 keeps the pace they had under the flat 0.22/s regen (60% of it). */
  turretShare: 0.13,
  glyphArm: 0.8, glyphRadius: 0.8,
  /** A glyph goes off as its Place spell at this power: the trap earns a little for its delay and the Sigil rune it binds until then. */
  glyphPower: 1.25,
  /** Orbitals: ring radius, turns a second, and how far from an orb (to the enemy's edge) it strikes: 1.6 u, so a foe is struck as it closes to about 3 u of you, not when it walks into the orb. */
  orbitRadius: 1.3, orbitSpeed: 0.5, orbitStrike: 1.6,
  /** All the orbs one orbital cast makes strike this many times its spell between them (Discharge's 1.6); your ring holds at most orbitMax orbs, and binds one Sigil rune. */
  orbitPower: 1.6, orbitMax: 4, // what one full cast (Sigil + 4) makes: feeding the ring refills it, it never banks more than a cast could (8 let the quiet before a wave bank twice a full cast)
  /** The lens: its radius; what passes through it is multiplied by lensMult, and a shot through it grows lensGrow times wider. */
  lensRadius: 0.9, lensMult: 1.5, lensGrow: 1.3,
  auraTime: 12, auraRadius: 2.5,
  /** Regeneration (Sigil + Life on yourself): health each half second a Life rune (4 a second; was 6). */
  regenAura: 2, hasteMult: 1.4, glassMult: 1.3,
  weaponUses: 30, motes: 3, moteRefund: 0.5,
  /** The Double: its health, its power and rune share per repeat, and how much more enemies want it. */
  doubleHp: 60, doubleShare: 0.5, doubleTaunt: 6,
  /** Blink goes to the cursor, up to this far (the user: start generous, nerf from there). */
  blinkRange: 30,
  /** A Shield + elements Blink leaves the elements' Area spell where you stood, at this share of its power (the blink is the rest of its worth). */
  partingPower: 0.8,
  /** Reach of each conjured weapon, by its leading element. */
  reach: { earth: 1.6, arcane: 3.2, life: 1.2, lightning: 3.4, water: 2.2, fire: 1.8, cold: 2.8 } as Partial<Record<Element, number>>,
};

/**
 * Weapons and guards, round 2 (docs/explorations/2026-11-05-guards.md): the weapon-specific Heavies
 * and Specials, the Arcane wand, and the eight guards' Defend, Retreat and passives. Built on the
 * doc's recommendations, revised by the user's round-2 ratings. Distances in world units.
 */
export const ARMS = {
  /** Your hands (hands.ts): a Heavy's power and reach against a Strike, a Sweep's power, the Retreat hop without a guard. */
  heavyScale: 1.8, heavyReach: 1.3, sweepScale: 0.8, retreatPush: 11,
  /**
   * Every blow (Strike, Sweep, the staff's shove) is a physical hit as well as the weapon's elements,
   * so an element that deals no damage (Water) still lands. Per weapon (staff = none held): the
   * physical damage, the knockback (u/s), the Strike's cone half-angle (turns) and its reach as a
   * multiple of the weapon's (STRUCT.reach). The hands heal, so they deal no physical hit.
   */
  blowDmg: { staff: 4, water: 5, life: 0, cold: 4, lightning: 3, fire: 2, earth: 2 }, // the maul's Earth is already the weight: 2 on top of its 11
  /**
   * Strike rhythm (s): the recovery after a Strike or a Sweep with each weapon, drawn as the weapon's
   * follow-through (pillar 4: a visible rhythm, not a hidden cooldown). It keeps a spammed Strike near
   * half the DPS of the same element's committed spell (docs/explorations/2026-11-05-weapon-dps.md):
   * a weapon is the cheap, always-ready option, not the strongest. Light weapons recover fast, the maul slowly.
   */
  strikeRecovery: { staff: 0.6, water: 0.65, life: 0.35, cold: 0.9, lightning: 0.9, fire: 0.8, earth: 1.4, arcane: 0.62, ice: 0.45 }, // the bow nocks fastest
  blowKnock: { staff: 3, water: 12, life: 0, cold: 4, lightning: 3, fire: 4, earth: 9 },
  blowHalf: { staff: 0.15, water: 0.11, life: 0.12, cold: 0.07, lightning: 0.1, fire: 0.15, earth: 0.15 },
  blowReach: { staff: 1, water: 1.2, life: 1.5, cold: 1, lightning: 1, fire: 1, earth: 1 },
  /** A blow's elements land at this share of a spell's power (a Sweep at sweepScale of that again). */
  blowPayload: 0.5,
  // ---- Heavies (2 uses unless noted) ----
  /** Weapon waves (trident slash, fire wave, earth fissure): their power, half-width and how far they roll. */
  waveScale: 0.8,
  tideHalf: 1.0, tideRange: 5,
  fireHalf: 1.5, fireRange: 6,
  quakeHalf: 0.45, quakeRange: 7.5,
  /** Healing link (Life): picks the ally within linkPick of the cursor, holds to linkRange (or a wall), heals linkHeal hp/s, costs linkUses uses a second. */
  linkRange: 8, linkPick: 1.5, linkHeal: 12, linkUses: 1,
  /** Charged bolt (Arcane wand): its power at full charge, and how fast it flies. */
  chargedBolt: 0.75, boltSpeed: 14,
  /** Impaling dash (Cold): this many times the spear's reach; frozen targets on the way shatter. */
  dashMult: 2.5,
  /** Chain lash (Lightning): jumps after the first target, and how far each jump reaches. */
  lashJumps: 3, lashJump: 3.5,
  // ---- Specials ----
  /** The spear's javelin: uses, speed, how long it pins (roots) the target, and the frost it leaves. */
  javelinUses: 2, javelinSpeed: 16, pin: 1.5, frostRadius: 1.0,
  /** Arcane wand: the Strike bolt's power; Siphon (held Special, rooted) multiplies your rune regen, for siphonUses a second. */
  boltScale: 0.3, siphonMult: 4, siphonUses: 1,
  /** Ice bow: the Strike icicle's power, speed (u/s, the wand's bolt flies 14) and life (s); the Heavy's fan of icicles
   * (each at fanScale, fanSpread turns apart, piercing from fanPierceAt of a full draw); the Special's splinter shot. */
  arrowScale: 0.45, arrowSpeed: 22, arrowLife: 0.8, fanCount: 3, fanScale: 0.6, fanSpread: 0.035, fanPierceAt: 0.8, splinterScale: 0.8,
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
  phaseTime: 0.5, flameLine: 1, spark: 4, seedHeal: 15,
  /** Heals: Leaf regrowth (hp/s), a Leaf block to allies around you (hp/s), a Leaf parry (you too), and how far "around" reaches. */
  regrowth: 1, leafBlockHeal: 8, leafParryHeal: 20, leafRange: 3.5,
  /** A Rime block chills a melee attacker by this much (chill stacks). */
  rimeChill: 8,
  /** Guard damage multipliers: the Spark ring is the weakest block; Water douses the Ember targe. */
  sparkBlock: 1.5, emberWater: 2,
  /** A Water shot blocked by the Ember targe counts as at least this much damage (before emberWater). */
  emberDouseMin: 10,
  /** A Tide shield's block shoves a melee attacker back this hard. */
  tideShove: 8,
  // ---- Parry effects ----
  /** Bulwark: bashes down an attacker within bashRange, knocking it back at bashKnock. */
  bashRange: 3, bashKnock: 9,
  /** Ember: a burst of flame in a cone this long and this wide (half, turns). */
  flameBurstRange: 2.5, flameBurstHalf: 0.16,
  /** Rime: freezes a melee attacker this long (s). */
  rimeFreeze: 1.5,
  /** Spark: a discharge that jumps to this many enemies within dischargeRange, at this power each. */
  dischargeJumps: 3, dischargeRange: 4, dischargePower: 0.8,
  /** Tide: a wave in a cone this long and wide (half, turns) that shoves at tideWaveKnock. */
  tideWaveRange: 3.2, tideWaveHalf: 0.2, tideWaveKnock: 10,
  // ---- Retreat effects ----
  /** Surge (Tide): the wave left in front, its cone (half, turns) and its shove. */
  surgeReach: 3, surgeHalf: 0.18, surgeKnock: 9,
  /** Ice slide (Rime): push per unit of slide (ice barely slows you, so it needs far less than plain floor). */
  iceSlidePush: 1.8,
  /** Blink (Spark): the radius of the spark it leaves where you stood. */
  sparkRadius: 0.75,
  /** Mixing (explorations/2026-11-05-guards-round-2.md): a mixed-in element brings this share of its resistance row per rune (2 runes: all of it), and its coat bites at this power. */
  mixShare: 0.5, coatScale: 0.5,
  /** Each rune in a guard past the first adds this much guard HP and Retreat distance. */
  runeSize: 0.15,
  /** A guard resistance this high (an own-element guard's) also wards off that element's status: no stun, burn or chill. */
  resStatus: 3,
  /**
   * Prism (Arcane): what its raised block takes is stored as charge (up to chargeMax; it fades chargeFade
   * a second once lowered). Lowering the block with at least lanceMin stored fires the Lance: an arcane
   * line lanceRange long that deals lanceBase + the charge to everything on it, carrying the coat.
   */
  chargeMax: 60, chargeFade: 6, lanceMin: 10, lanceBase: 8, lanceRange: 7, lanceWidth: 0.45,
  /** Weapon Specials scale with every rune too: each weapon rune past the first adds this much Mend healing; each rune of an element in a Siphon wand refills that element siphonFocus times faster again. */
  specialRune: 0.25, siphonFocus: 1,
  /**
   * The imbue: each non-Life rune in a heal adds blessRate resistance (times the hit's scale: a second of a heal channel
   * adds it once) to its guard's strengths, and it decays blessDecay of itself a second (half-life ~7 s: it lingers).
   * Measured (tools/probe-imbue.txt): against 10 damage a second, one Fire in a ring beats a second Life from about 40 %
   * fire damage up, and is worth ~2.7 Life runes against all-fire; under heavy pressure from ~25 %, light from ~65 %.
   */
  blessRate: 0.75, blessDecay: 0.1,
  /** What each guard takes before it breaks. */
  hp: { mirror: 90, bulwark: 160, ember: 90, rime: 90, spark: 45, tide: 90, prism: 90, leaf: 90 },
};
