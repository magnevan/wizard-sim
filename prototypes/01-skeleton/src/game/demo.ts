// ?demo=1: a scripted controller so headless screenshots show real action.
// It drives the wizard through the same PlayerIntent seam as a human.
// The script tours Proposal A: Point casts, a wall, Seal (rune + orbitals),
// Release (which also shatters the wall), a tidal wave, a lens-boosted beam.

import { dist, normalize, sub, type Vec2 } from '../core/vec2';
import type { Element } from '../spells/elements';
import type { RuleSet } from '../spells/tree';
import type { CastMode } from '../spells/types';
import type { Entity } from '../world/entity';
import type { World } from '../world/world';
import type { PlayerAction, PlayerController, PlayerIntent } from './controllers';

interface DemoStep {
  at: number;
  /** Walk toward this point (stops on arrival); null stops now. */
  walk?: Vec2 | null;
  /** Aim at the body with this dummy label, or at a fixed point. */
  target?: string | Vec2;
  /** Arm Seal before this step's cast. */
  seal?: boolean;
  elements?: Element[];
  cast?: CastMode;
  release?: boolean;
  /** Keep the cast button held this long (beams, sprays). */
  hold?: number;
}

const HOME = { x: 10.5, y: 9 };

const SCRIPT: DemoStep[] = [
  { at: 0.0, walk: HOME, target: 'Dummy B' },
  // Point: Geyser on the ground next to Dummy A (on the body itself, Arcane would Yank it).
  { at: 1.2, target: { x: 14.6, y: 6.6 }, elements: ['earth', 'arcane'], cast: 'point' },
  // Point on an ally: Ward toss (fire ward) onto the ally dummy.
  { at: 2.2, target: 'Ally', elements: ['shield', 'fire'], cast: 'point' },
  // Force: rock wall across the aim.
  { at: 3.0, target: 'Dummy B', elements: ['shield', 'earth'], cast: 'force' },
  // Point: lightning strike on Dummy C, who stands in a puddle -> Surface Surge.
  { at: 4.1, target: 'Dummy C', elements: ['lightning'], cast: 'point' },
  // Seal + Point: a fire/earth rune on the floor (arms after 0.8 s).
  { at: 4.8, target: { x: 13, y: 5.6 }, seal: true, elements: ['fire', 'earth'], cast: 'point' },
  // Seal + Area twice: 2 earth orbitals, then 2 arcane/fire more (Spell Quiver).
  { at: 5.8, target: 'Dummy B', seal: true, elements: ['earth', 'earth'], cast: 'area' },
  { at: 6.7, seal: true, elements: ['arcane', 'fire'], cast: 'area' },
  // Release: rune bursts, orbitals fly at the cursor, the rock wall shatters.
  { at: 8.0, target: 'Dummy B', release: true },
  // Weapon + Water: Tidal wave.
  { at: 9.3, target: 'Dummy B', elements: ['water', 'water'], cast: 'weapon' },
  // Point: Lens, then an arcane beam through it (+50% damage and width).
  { at: 10.8, target: { x: 13.3, y: 9 }, elements: ['shield', 'arcane'], cast: 'point' },
  { at: 11.6, target: 'Dummy B', elements: ['arcane', 'arcane'], cast: 'force', hold: 2.0 },
  // Weapon + Earth: Fault line toward Dummy A, leaving a ridge.
  { at: 14.0, target: 'Dummy A', elements: ['earth', 'earth'], cast: 'weapon' },
  // Point on the ally: Lantern (can't drop below 1 HP).
  { at: 15.0, target: 'Ally', elements: ['shield', 'life'], cast: 'point' },
];
const PERIOD = 17;

// ?demo=1&rules=a1: a tour of the A.1 additions instead.
const SCRIPT_A1: DemoStep[] = [
  { at: 0.0, walk: HOME, target: 'Dummy B' },
  // Self + Lightning x2: Haste (6 s).
  { at: 1.2, target: 'Dummy B', elements: ['lightning', 'lightning'], cast: 'self' },
  // Point on the ally: your Self spell on them (Earth x2 = Stoneskin).
  { at: 2.2, target: 'Ally', elements: ['earth', 'earth'], cast: 'point' },
  // Point + Shield on an enemy: Cage. Then a fire spray at it is stopped by the bubble.
  { at: 3.2, target: 'Dummy B', elements: ['shield'], cast: 'point' },
  { at: 4.1, target: 'Dummy B', elements: ['fire', 'fire'], cast: 'force', hold: 1.0 },
  // Self + Arcane + Fire: Glass cannon, then a lightning strike on Dummy C's puddle hits 50% harder.
  { at: 5.8, target: 'Dummy C', elements: ['arcane', 'fire'], cast: 'self' },
  { at: 6.8, target: 'Dummy C', elements: ['lightning'], cast: 'point' },
  // Point on the ally: Haste on them.
  { at: 7.8, target: 'Ally', elements: ['lightning'], cast: 'point' },
  // Self + Shield + Arcane: Ethereal (3 s); trying to attack fizzles.
  { at: 8.8, target: 'Dummy B', elements: ['shield', 'arcane'], cast: 'self' },
  { at: 9.9, target: 'Dummy B', elements: ['fire'], cast: 'force' },
  // Self + Earth x3: Stoneskin.
  { at: 12.3, target: 'Dummy A', elements: ['earth', 'earth', 'earth'], cast: 'self' },
  // Arcane alone on a body: Yank. Earth + Arcane on a body: Geyser under it (A.1).
  { at: 13.3, target: 'Dummy A', elements: ['arcane'], cast: 'point' },
  { at: 14.3, target: 'Dummy A', elements: ['earth', 'arcane'], cast: 'point' },
  // Soak the ally with a Tidal wave (friendly fire), then Cleanse them with Point + Water.
  { at: 15.3, target: 'Ally', elements: ['water', 'water'], cast: 'weapon' },
  { at: 16.6, target: 'Ally', elements: ['water'], cast: 'point' },
];
const PERIOD_A1 = 18;
/** Elements (and Seal) are typed this long before the cast, so the HUD shows the queue and names. */
const LEAD = 0.5;

const eventsOf = (script: DemoStep[]): DemoStep[] =>
  script.flatMap((s): DemoStep[] =>
    s.cast && (s.elements?.length || s.seal)
      ? [{ at: s.at - LEAD, target: s.target, seal: s.seal, elements: s.elements }, { ...s, seal: undefined, elements: undefined }]
      : [s],
  ).sort((a, b) => a.at - b.at);

export class DemoController implements PlayerController {
  readonly label = 'Demo script';
  private loopStart = 0;
  private next = 0;
  private walkTo: Vec2 | null = null;
  private target: string | Vec2 = '';
  private holdUntil = 0;
  private readonly events: DemoStep[];
  private readonly period: number;

  constructor(rules: RuleSet = 'a') {
    this.events = eventsOf(rules === 'a1' ? SCRIPT_A1 : SCRIPT);
    this.period = rules === 'a1' ? PERIOD_A1 : PERIOD;
  }

  poll(_input: unknown, self: Entity, world: World): PlayerIntent {
    if (world.time - this.loopStart >= this.period) {
      this.loopStart = world.time;
      this.next = 0;
    }
    const t = world.time - this.loopStart;
    const actions: PlayerAction[] = [];
    while (this.next < this.events.length && this.events[this.next].at <= t) {
      const s = this.events[this.next++];
      if (s.walk !== undefined) this.walkTo = s.walk;
      if (s.target) this.target = s.target;
      if (s.seal) actions.push({ type: 'seal' });
      for (const el of s.elements ?? []) actions.push({ type: 'element', element: el });
      if (s.release) actions.push({ type: 'release' });
      if (s.cast) {
        actions.push({ type: 'cast', mode: s.cast });
        this.holdUntil = world.time + (s.hold ?? 0);
      }
    }

    const walking = !!this.walkTo && dist(this.walkTo, self.pos) > 0.2;
    const move = walking ? normalize(sub(this.walkTo!, self.pos)) : { x: 0, y: 0 };
    // Face where we walk, otherwise face the target.
    const aim = walking ? this.walkTo : this.aimPoint(world, self);
    return { move, aim, actions, castHeld: world.time < this.holdUntil };
  }

  private aimPoint(world: World, self: Entity): Vec2 | null {
    if (typeof this.target !== 'string') return this.target;
    const byLabel = world.entities.find((e) => e.dummy?.label === this.target);
    if (byLabel) return byLabel.pos;
    let best: Entity | undefined;
    for (const e of world.entities) {
      if (e.team !== 'enemy' || e.removed) continue;
      if (!best || dist(e.pos, self.pos) < dist(best.pos, self.pos)) best = e;
    }
    return best?.pos ?? null;
  }
}
