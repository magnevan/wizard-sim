import { PLAYER } from '../config';
import { damageColor, type DamageType, ELEMENTS } from '../spells/elements';
import { scale } from '../core/vec2';
import { applyStatus, damageDealtMultiplier, damageTakenMultiplier, isIntangible } from '../statuses/statuses';
import { cageBlocksHit } from './cage';
import { isHittable, type Entity } from './entity';
import { applyImpulse } from './physics';
import { archetypeOf } from './shield';
import type { HitEvent, World } from './world';

const CUE_TEXT: Record<string, string> = { freeze: 'Frozen!', steam: 'Hiss', thaw: 'Thaw' };

/** Resolve all queued hits, then handle death. */
export function damageSystem(world: World): void {
  const hits = world.hits;
  world.hits = [];
  for (const h of hits) {
    const t = world.get(h.targetId);
    if (t && isHittable(t)) resolveHit(world, t, h);
  }
  for (const e of world.entities) {
    if (isHittable(e) && e.hp! <= 0) handleDeath(world, e);
  }
}

/** "Phased" / "Caged" text, at most every 0.6 s per body. */
function passNote(world: World, t: Entity, label: string): void {
  if (world.time - (t.phasedAt ?? -9) < 0.6) return;
  t.phasedAt = world.time;
  world.floater({ x: t.pos.x, y: t.pos.y - 1.1 }, label, '#b9f3ff');
}

function resolveHit(world: World, t: Entity, h: HitEvent): void {
  // Cage: nothing crosses the bubble, in or out.
  if (cageBlocksHit(world, t.id, h.sourceId)) return passNote(world, t, 'Caged');
  const harmful = Object.entries(h.damage).some(([type, v]) => type !== 'life' && v) || h.statuses.length > 0;
  // Ethereal: harmful hits pass through (heals still land).
  if (harmful && isIntangible(t.statuses)) {
    passNote(world, t, 'Phased');
    h = { ...h, damage: h.damage.life ? { life: h.damage.life } : {}, statuses: [], impulse: { x: 0, y: 0 } };
  }
  const above = { x: t.pos.x + world.rng.range(-0.25, 0.25), y: t.pos.y - (t.radius ?? 0.5) - 0.35 };
  let dealt = 0;
  let heal = 0;
  let amplified = false;
  let topType: DamageType = 'physical';
  let topAmount = 0;
  const arch = archetypeOf(t);
  // Glass cannon on the source: it deals more.
  const dealtMult = damageDealtMultiplier(world.get(h.sourceId)?.statuses);

  for (const [type, raw] of Object.entries(h.damage) as [DamageType, number][]) {
    if (!raw) continue;
    if (type === 'life') {
      heal += raw;
      continue;
    }
    const mult = dealtMult * damageTakenMultiplier(t.statuses, type) * (1 - (t.ward?.resist[type] ?? 0)) * (arch?.damageTaken?.[type] ?? 1);
    if (mult > 1) amplified = true;
    const amount = raw * mult;
    dealt += amount;
    if (amount > topAmount) {
      topAmount = amount;
      topType = type;
    }
  }

  if (heal > 0 && t.maxHp !== undefined) {
    t.hp = Math.min(t.maxHp, t.hp! + heal);
    world.floater(above, `+${Math.round(heal)}`, ELEMENTS.life.color);
  }
  // Stoneskin: the rock armor soaks damage first and halves knockback.
  const stone = !!t.statuses?.stoneskin;
  if (dealt > 0 && stone && (t.armor ?? 0) > 0) {
    const soaked = Math.min(t.armor!, dealt);
    t.armor! -= soaked;
    dealt -= soaked;
    world.floater({ x: above.x, y: above.y - 0.2 }, `(${Math.round(soaked)})`, '#c9955f');
    if (t.armor! <= 0.01) {
      delete t.statuses!.stoneskin;
      t.armor = 0;
      world.cue('shatter', t.pos, '#b07a45');
      world.floater({ x: t.pos.x, y: t.pos.y - 1.3 }, 'Stoneskin broke', '#c9955f', true);
    }
  }
  if (dealt > 0) {
    t.hp! -= dealt;
    world.damaged.add(t.id);
    // Lantern (Stay of Death): can't drop below 1 HP while it shines on you.
    if ((t.deathlessUntil ?? 0) > world.time && t.hp! < 1) {
      t.hp = 1;
      world.floater({ x: t.pos.x, y: t.pos.y - 1.4 }, 'Spared', '#ffe08a');
    }
    t.hitFlash = 0.12;
    const text = `${Math.max(1, Math.round(dealt))}${amplified ? '!' : ''}`;
    world.floater(above, text, damageColor(topType), amplified);
    if (t.dummy) {
      t.dummy.log.push({ at: world.time, amount: dealt });
      t.dummy.lastHit = { amount: dealt, type: topType, at: world.time };
      t.dummy.total += dealt;
    }
  }

  if (h.impulse.x !== 0 || h.impulse.y !== 0) applyImpulse(t, stone ? scale(h.impulse, 0.5) : h.impulse);

  if (h.statuses.length > 0) {
    t.statuses ??= {};
    for (const s of h.statuses) {
      if (arch?.immune?.includes(s.id)) continue;
      if (arch?.soakedBy?.status === s.id && !t.statuses[s.id]) {
        t.hp! -= arch.soakedBy.damage;
        t.hitFlash = 0.12;
        world.floater({ x: t.pos.x, y: t.pos.y - 1.2 }, `Doused ${arch.soakedBy.damage}!`, '#4fb4ff', true);
      }
      for (const cue of applyStatus(t.statuses, s)) {
        world.cue(cue, t.pos);
        if (CUE_TEXT[cue]) world.floater({ x: t.pos.x, y: t.pos.y - 1.2 }, CUE_TEXT[cue], '#ffffff');
      }
    }
  }
}

function handleDeath(world: World, e: Entity): void {
  if (e.immortal) {
    e.hp = e.maxHp;
    world.cue('refill', e.pos);
    return;
  }
  world.cue('poof', e.pos, e.player?.color ?? archetypeOf(e)?.color);
  if (e.ai?.kind === 'enemy') {
    const held = world.get(e.ai.grabbedId);
    if (held) held.grabbedBy = undefined;
  }
  e.grabbedBy = undefined;
  if (e.player) {
    e.downed = true;
    e.statuses = {};
    e.ward = undefined;
    e.vel = { x: 0, y: 0 };
    e.player.respawnIn = PLAYER.respawnDelay;
    return;
  }
  world.remove(e);
}
