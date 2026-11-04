// Floor surfaces and the world rules on them (no new inputs):
//   puddle: soaks whoever stands in it; lightning surges through all of it (Surface Surge)
//   cold on a puddle freezes it into ice (slippery); fire on ice melts it back
//   fire on a puddle hisses into steam; fire on grass sets it burning

import { dist, type Vec2 } from '../core/vec2';
import type { Element } from '../spells/elements';
import { isHittable, type Entity, type SurfaceType } from './entity';
import type { Touch, World } from './world';

const SURGE_DAMAGE = 11;
const SURGE_COOLDOWN = 0.3;
const WET_INTERVAL = 0.6;
const BURN_TIME = 6;
const BURN_DPS = 8;

export function spawnSurface(world: World, pos: Vec2, type: SurfaceType, radius: number): Entity {
  return world.spawn({
    kind: 'surface',
    pos: { ...pos },
    radius,
    surface: { type, radius, surge: 0, surgeCd: 0, steamCd: 0, wetTimer: 0, burnLeft: type === 'burning' ? BURN_TIME : 0 },
  });
}

const touches = (t: Touch, s: Entity) => dist(t.pos, s.pos) < s.surface!.radius + t.radius;
const hasAny = (els: readonly Element[], ...want: Element[]) => els.some((e) => want.includes(e));

export function surfaceSystem(world: World, dt: number): void {
  const surfaces = world.entities.filter((e) => e.surface && !e.removed);
  const bodies = world.entities.filter((e) => isHittable(e) && e.kind !== 'effect' && e.kind !== 'structure');
  for (const b of bodies) b.onIce = false;

  for (const s of surfaces) {
    const st = s.surface!;
    st.surge = Math.max(0, st.surge - dt);
    st.surgeCd -= dt;
    st.steamCd -= dt;
    const inside = bodies.filter((b) => dist(b.pos, s.pos) < st.radius);
    if (st.type === 'ice') for (const b of inside) b.onIce = true;
    if (st.type === 'puddle' || st.type === 'burning') {
      st.wetTimer += dt;
      if (st.wetTimer >= WET_INTERVAL) {
        st.wetTimer -= WET_INTERVAL;
        for (const b of inside) {
          world.hit(
            st.type === 'puddle'
              ? { targetId: b.id, sourceId: null, damage: {}, statuses: [{ id: 'wet', intensity: 1, duration: 1.5 }], impulse: { x: 0, y: 0 } }
              : { targetId: b.id, sourceId: null, damage: { fire: BURN_DPS * WET_INTERVAL }, statuses: [{ id: 'burning', intensity: 1, duration: 2 }], impulse: { x: 0, y: 0 } },
          );
        }
      }
    }
    if (st.type === 'burning') {
      st.burnLeft -= dt;
      // Fire spreads to grass it touches.
      for (const o of surfaces) {
        if (o.surface!.type === 'grass' && dist(o.pos, s.pos) < st.radius + o.surface!.radius) ignite(o);
      }
      if (st.burnLeft <= 0) world.remove(s);
    }
  }

  for (const t of world.touches) {
    for (const s of surfaces) {
      if (s.removed || !touches(t, s)) continue;
      react(world, s, t, bodies);
    }
  }
  world.touches = [];
}

function ignite(s: Entity): void {
  s.surface!.type = 'burning';
  s.surface!.burnLeft = BURN_TIME;
}

function react(world: World, s: Entity, t: Touch, bodies: Entity[]): void {
  const st = s.surface!;
  const els = t.elements;
  if (st.type === 'puddle') {
    if (els.includes('lightning') && st.surgeCd <= 0) {
      surge(world, s, t, bodies);
    } else if (hasAny(els, 'cold', 'ice')) {
      st.type = 'ice';
      world.cue('freeze', s.pos);
      world.floater({ x: s.pos.x, y: s.pos.y - 0.4 }, 'Frozen over', '#bff0ff');
    } else if (els.includes('fire') && st.steamCd <= 0) {
      st.steamCd = 1.2;
      world.cue('steam', s.pos);
      for (const b of bodies) {
        if (dist(b.pos, s.pos) < st.radius) world.hit({ targetId: b.id, sourceId: t.ownerId, damage: { steam: 6 }, statuses: [], impulse: { x: 0, y: 0 } });
      }
    }
  } else if (st.type === 'ice' && hasAny(els, 'fire', 'steam')) {
    st.type = 'puddle';
    world.cue('thaw', s.pos);
  } else if (st.type === 'grass' && els.includes('fire')) {
    ignite(s);
    world.cue('impact', s.pos, '#ff7a1a');
  }
}

/** Lightning on water: everyone standing in the puddle is struck. */
function surge(world: World, s: Entity, t: Touch, bodies: Entity[]): void {
  const st = s.surface!;
  st.surgeCd = SURGE_COOLDOWN;
  st.surge = 0.45;
  const n = Math.max(1, t.elements.filter((e) => e === 'lightning').length);
  world.cue('surge', s.pos);
  world.floater({ x: s.pos.x, y: s.pos.y - st.radius * 0.5 }, 'Surge!', '#d9c4ff', true);
  for (const b of bodies) {
    if (dist(b.pos, s.pos) >= st.radius) continue;
    world.hit({ targetId: b.id, sourceId: t.ownerId, damage: { lightning: SURGE_DAMAGE * n }, statuses: [], impulse: { x: 0, y: 0 } });
  }
}
