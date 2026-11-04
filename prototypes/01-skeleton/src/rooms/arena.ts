import { dist, type Vec2 } from '../core/vec2';
import { ARCHETYPES } from '../world/archetypes';
import { spawnEnemy } from '../world/spawn';
import { spawnSurface } from '../world/surfaces';
import type { World } from '../world/world';
import { borderWalls, pillar, type Room } from './room';
import { advance, LULL_SECONDS, newEncounter, SPAWN_INTERVAL, wavePlan, type Encounter } from './waves';

const W = 36;
const H = 26;

/** Where portals can open: corners and side midpoints, inside the border. */
const PORTAL_SITES: Vec2[] = [
  { x: 3.5, y: 3.5 }, { x: 18, y: 3 }, { x: 32.5, y: 3.5 }, { x: 33, y: 13 },
  { x: 32.5, y: 22.5 }, { x: 18, y: 23 }, { x: 3.5, y: 22.5 }, { x: 3, y: 13 },
];

const alive = (world: World) => world.entities.filter((e) => e.kind === 'enemy' && !e.removed).length;

/** Each group of the coming wave gets its own portal, as far from the players as possible. */
function openPortals(world: World, enc: Encounter): void {
  const players = world.entities.filter((e) => e.player && !e.downed);
  const far = (p: Vec2) => Math.min(99, ...players.map((pl) => dist(pl.pos, p)));
  const sites = [...PORTAL_SITES].sort((a, b) => far(b) - far(a) + world.rng.range(-3, 3));
  enc.portals = wavePlan(enc.wave).groups.map((g, i) => ({ pos: { ...sites[i % sites.length] }, archetype: g.archetype, left: g.count, total: g.count, next: i * 0.2 }));
  enc.firedAtLull = world.sealedFired;
  enc.storedAtLull = world.sealedStored;
  world.cue('portal', { x: W / 2, y: H / 2 });
}

function spill(world: World, enc: Encounter, dt: number): void {
  const plan = wavePlan(enc.wave);
  for (const p of enc.portals) {
    if (p.left <= 0) continue;
    p.next -= dt;
    if (p.next > 0) continue;
    p.next = SPAWN_INTERVAL;
    p.left--;
    const jitter = { x: p.pos.x + world.rng.range(-0.6, 0.6), y: p.pos.y + world.rng.range(-0.6, 0.6) };
    spawnEnemy(world, jitter, p.archetype, plan);
    world.cue('emerge', jitter, ARCHETYPES[p.archetype].color);
  }
}

function report(world: World, enc: Encounter, wiped: boolean): void {
  enc.last = {
    wave: enc.wave,
    sealedFired: world.sealedFired - enc.firedAtLull,
    sealedInLull: enc.storedAtWave - enc.storedAtLull,
    wiped,
  };
}

/** Lull (portals telegraph the next wave) -> wave (2-3 archetypes) -> breather (respawns). */
export function createArena(): Room {
  return {
    id: 'arena',
    name: 'Arena',
    width: W,
    height: H,
    spawnPoints: [{ x: W / 2, y: H / 2 }, { x: W / 2 + 1.5, y: H / 2 }, { x: W / 2 - 1.5, y: H / 2 }, { x: W / 2, y: H / 2 + 1.5 }],
    build(world: World) {
      world.walls.push(...borderWalls(W, H), pillar(10, 8, 2), pillar(26, 8, 2), pillar(10, 18, 2), pillar(26, 18, 2));
      spawnSurface(world, { x: 18, y: 7.5 }, 'puddle', 1.8);
      spawnSurface(world, { x: 18, y: 19 }, 'grass', 2);
      world.encounter = newEncounter();
    },
    update(world: World, dt: number) {
      const enc = world.encounter!;
      const playersUp = world.entities.filter((e) => e.player && !e.downed).length;
      if (enc.phase === 'wave') spill(world, enc, dt);
      switch (advance(enc, dt, alive(world), playersUp)) {
        case 'openPortals':
          openPortals(world, enc);
          break;
        case 'startWave':
          enc.storedAtWave = world.sealedStored;
          world.cue('horn', { x: W / 2, y: H / 2 });
          break;
        case 'cleared':
          report(world, enc, false);
          // The wave is over: downed players come back during the breather.
          for (const e of world.entities) if (e.downed && e.player) e.player.respawnIn = Math.min(e.player.respawnIn ?? 0, 1);
          break;
        case 'wiped':
          // Everyone is down: clear the field and retry the same wave after a lull.
          report(world, enc, true);
          for (const e of world.entities) if (e.kind === 'enemy') world.remove(e);
          for (const e of world.entities) if (e.downed && e.player) e.player.respawnIn = 1;
          enc.phase = 'lull';
          enc.timer = LULL_SECONDS;
          enc.portals = [];
          break;
      }
    },
    status: (world: World) => {
      const enc = world.encounter!;
      if (enc.phase === 'lull') return `Wave ${enc.wave} in ${Math.max(0, enc.timer).toFixed(1)}s`;
      if (enc.phase === 'wave') return `Wave ${enc.wave}: ${alive(world) + enc.portals.reduce((n, p) => n + p.left, 0)} left`;
      return `Wave ${enc.wave} cleared`;
    },
  };
}
