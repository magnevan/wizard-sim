import type { InputSnapshot } from '../core/input';
import { pointAim } from '../spells/targeting';
import type { Vec2 } from '../core/vec2';
import { respawnBlocked } from '../rooms/waves';
import type { World } from '../world/world';
import type { PlayerController } from './controllers';

/** A local player seat: who controls it and which wizard entity it drives. */
export interface PlayerSlot {
  index: number;
  color: string;
  controller: PlayerController;
  entityId: number;
  spawn: Vec2;
}

/** The "input" system: apply each player's intent to their wizard; handle respawn. */
export function playerSystem(world: World, players: readonly PlayerSlot[], input: InputSnapshot, dt: number): void {
  for (const slot of players) {
    const e = world.get(slot.entityId);
    if (!e?.caster || !e.player) continue;

    if (e.downed) {
      // In the Arena a downed player is out until the wave ends.
      if (!respawnBlocked(world.encounter)) e.player.respawnIn = (e.player.respawnIn ?? 0) - dt;
      if ((e.player.respawnIn ?? 0) <= 0) {
        e.downed = false;
        e.player.respawnIn = null;
        e.hp = e.maxHp;
        e.pos = { ...slot.spawn };
        e.vel = { x: 0, y: 0 };
        e.caster.queue.clear();
        e.grabbedBy = undefined;
        world.cue('respawn', e.pos, slot.color);
      }
      e.move = { x: 0, y: 0 };
      continue;
    }

    const intent = slot.controller.poll(input, e, world);
    const c = e.caster;
    if (intent.aim) c.aim = intent.aim;
    for (const a of intent.actions) {
      if (a.type === 'element') c.lastOutcome = { outcome: c.queue.add(a.element), at: world.time };
      else if (a.type === 'clear') c.queue.clear();
      else if (a.type === 'seal') c.sealArmed = !c.sealArmed;
      else if (a.type === 'release') c.releaseRequested = true;
      else c.request = { mode: a.mode, elements: c.queue.take(), sealed: c.sealArmed, ...pointAim(e, c.aim, world.entities) };
    }
    c.held = intent.castHeld;
    const holder = world.get(e.grabbedBy);
    if (e.grabbedBy !== undefined && (!holder || holder.removed)) e.grabbedBy = undefined;
    e.move = e.grabbedBy !== undefined ? { x: 0, y: 0 } : intent.move;
  }
}
