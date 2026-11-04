// A simple AI wizard seat: the K "dev ally" (follows player 1) and the
// ?autoplay=1 pilot. It drives the same PlayerIntent seam as a human, so it
// is subject to the same queue, cast times and friendly fire.

import { add, dist, len, normalize, scale, sub, type Vec2 } from '../core/vec2';
import type { Element } from '../spells/elements';
import type { CastMode } from '../spells/types';
import { runesOf } from '../spells/vessels';
import { isHittable, type Entity } from '../world/entity';
import type { World } from '../world/world';
import type { PlayerAction, PlayerController, PlayerIntent } from './controllers';

const FOLLOW_NEAR = 2.5;
const FOLLOW_FAR = 4.5;
const KITE = 3;
const RANGE = 8.5;
/** Keep spells this far from the leader (friendly fire is on). */
const SAFE = 2.2;

export class BotController implements PlayerController {
  readonly label: string;
  private nextAt = 0;
  private turn = 0;

  /** `leader`: who to follow and protect; null = hold the room centre. */
  constructor(private readonly leader: ((world: World) => Entity | undefined) | null, label = 'Dev ally (bot)') {
    this.label = label;
  }

  poll(_input: unknown, self: Entity, world: World): PlayerIntent {
    const lead = this.leader?.(world);
    const leader = lead && isHittable(lead) ? lead : undefined;
    const anchor = leader?.pos ?? { x: world.width / 2, y: world.height / 2 };
    // Anything hostile with a body: Arena enemies, Sanctum target dummies.
    const enemies = world.entities.filter((e) => e.team === 'enemy' && e.kind !== 'effect' && isHittable(e)).sort((a, b) => dist(a.pos, self.pos) - dist(b.pos, self.pos));
    const nearest = enemies[0];

    // Movement: stay near the anchor, back off from anything in melee range.
    let move: Vec2 = { x: 0, y: 0 };
    const toAnchor = sub(anchor, self.pos);
    if (len(toAnchor) > FOLLOW_FAR) move = normalize(toAnchor);
    // Without a leader, close in on enemies that are out of reach.
    if (!this.leader && nearest && dist(nearest.pos, self.pos) > RANGE - 1) move = normalize(sub(nearest.pos, self.pos));
    else if (len(toAnchor) < FOLLOW_NEAR && leader) move = scale(normalize(toAnchor), -0.5);
    if (nearest && dist(nearest.pos, self.pos) < KITE) move = normalize(add(normalize(sub(self.pos, nearest.pos)), scale(normalize(toAnchor), 0.4)));

    const idle = { move, aim: nearest?.pos ?? null, actions: [], castHeld: false };
    if (world.time < this.nextAt || self.caster?.active) return idle;
    const plan = this.choose(world, self, leader, enemies);
    if (!plan) return idle;
    this.nextAt = world.time + plan.wait;
    const actions: PlayerAction[] = [];
    if (plan.seal && !self.caster!.sealArmed) actions.push({ type: 'seal' });
    for (const el of plan.elements ?? []) actions.push({ type: 'element', element: el });
    actions.push(plan.mode === 'release' ? { type: 'release' } : { type: 'cast', mode: plan.mode });
    return { move, aim: plan.at, actions, castHeld: false };
  }

  private choose(world: World, self: Entity, leader: Entity | undefined, enemies: Entity[]): Plan | null {
    const c = self.caster!;
    const hp = (e: Entity) => (e.hp ?? 0) / (e.maxHp ?? 1);
    if (hp(self) < 0.4) return { mode: 'self', elements: ['life', 'life'], at: self.pos, wait: 1.4 };
    if (leader && dist(leader.pos, self.pos) < RANGE) {
      // Rescue a grabbed leader with a Yank; patch them up when they're hurt.
      if (leader.grabbedBy !== undefined) return { mode: 'point', elements: ['arcane'], at: leader.pos, wait: 1 };
      if (hp(leader) < 0.5) return { mode: 'point', elements: ['life'], at: leader.pos, wait: 1.2 };
    }

    const enc = world.encounter;
    if (enc?.phase === 'lull' && enemies.length === 0) {
      // Prepare: runes on the portals, then a few orbitals.
      const portal = enc.portals.find((p) => dist(p.pos, self.pos) < RANGE && !runesOf(world, self.id).some((r) => dist(r.pos, p.pos) < 2));
      if (portal && runesOf(world, self.id).length < 2 && enc.timer > 1) return { mode: 'point', seal: true, elements: ['fire', 'earth'], at: portal.pos, wait: 1.2 };
      if (c.orbitals.length < 4 && enc.timer > 1) return { mode: 'area', seal: true, elements: ['earth', 'earth'], at: self.pos, wait: 1.2 };
      return null;
    }

    const safe = enemies.filter((e) => dist(e.pos, self.pos) < RANGE && (!leader || dist(e.pos, leader.pos) > SAFE));
    const target = safe[0];
    if (!target) return null;
    if (c.orbitals.length > 0 && dist(target.pos, self.pos) < 7) return { mode: 'release', at: target.pos, wait: 0.6 };
    this.turn++;
    if (this.turn % 3 === 0) {
      // Geyser just beside the target (on the body itself, Arcane would Yank it).
      const beside = add(target.pos, scale(normalize(sub(self.pos, target.pos)), (target.radius ?? 0.4) + 0.5));
      return { mode: 'point', elements: ['earth', 'arcane'], at: beside, wait: 1.5 };
    }
    return { mode: 'point', elements: ['lightning', 'lightning'], at: target.pos, wait: 1.1 };
  }
}

interface Plan {
  mode: CastMode | 'release';
  elements?: Element[];
  seal?: boolean;
  at: Vec2;
  wait: number;
}
