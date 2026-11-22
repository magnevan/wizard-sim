/**
 * The modes (mode.ts) and which room runs which. Each hook is a small wrapper rather than the function itself, so
 * the import cycles between the modes and world.ts never matter at load time: nothing here is read until a world steps.
 *
 * The room → mode table is the scenario registry's stand-in until rooms say their mode themselves (the campaign's
 * chapters will).
 */
import { BODY, CAMPAIGN, PERKS, RUNES, WELL } from './config';
import { WALL } from './compile';
import { EL, N_EL } from './elements';
import { tickWaves } from './waves';
import { survivePress, tickSurvive } from './survive';
import { BATTERY, batteryPress, driveButtons, driveSpray, driveTarget, driving } from './battery';
import { BATTERY_CHECKPOINTS, BWAVES, batteryReached, batteryStandoff, holdSpot, laneTarget, repairPress, tickBatteryWaves } from './battery-waves';
import { ARCHETYPES, ATTACK } from './archetypes';
import { beginTutorialTick, tickTutorial } from './tutorial';
import { tutPool, TUT_ORDER } from './tutorial-data';
import { courtLeaveTo } from './court';
import { infirmaryLeaveTo } from './infirmary';
import { YARD_CHECKPOINTS, YS, lateYard, newYard, sparRest, sparStandoff, sparTarget, tickYard, yardPress, yardReached, yardRuneMax } from './yard';
import type { Mode, ModeId, WorldOpts } from './mode';
import {
  KIND, MAX_BODIES, MAX_SEATS, N_PU, PHASE_ENC, PU, TEAM, TERRAIN, infused, newRun, newTutorial, spawnBody, type Room, type World,
} from './world';

const dummies = (w: World, opts: WorldOpts) => {
  if (opts.dummies !== false) for (const [x, y] of w.def.dummies) spawnBody(w, -1, KIND.dummy, TEAM.enemies, x, y, BODY.dummyHp, BODY.dummyRadius);
};
/** The encounter waits in its lull, wave 1 next. */
const lull = (w: World) => { w.enc.state[0] = PHASE_ENC.lull; w.enc.state[1] = 1; w.enc.state[2] = 0; };

/** The Sanctum and the Academy: free play with dummies; waves only when the dev panel starts one. */
const SANDBOX: Mode = {
  id: 'sandbox',
  setup: (w, opts) => dummies(w, opts),
  director: (w) => tickWaves(w),
};

/** The Arena: wave after wave from its portals. */
const ARENA_MODE: Mode = {
  id: 'arena',
  setup: (w) => lull(w),
  director: (w) => tickWaves(w),
};

/** Survive: a run of waves, power-ups at the altars between them (survive.ts). */
const SURVIVE: Mode = {
  id: 'survive',
  state: (w) => { w.run = newRun(); },
  setup: (w) => lull(w),
  press: (w, inputs) => { survivePress(w, inputs); },
  director: (w) => tickSurvive(w),
  runeMax: (w, i, id) => (id === EL.sigil ? RUNES.surviveSigil : RUNES.surviveStart) + w.run!.maxBonus[i * N_EL + id - 1],
  regen: (w, i) => {
    const k = i >= 0 && i < MAX_SEATS ? w.run!.stacks[i * N_PU + PU.wellspring] : 0;
    return k ? RUNES.regen * (1 + PERKS.wellspring * k) : undefined;
  },
  pools: (w) => [w.run!],
};

/** The battery: drive a defence from its possession circle, the well that feeds them (battery.ts, battery-waves.ts). */
const BATTERY_MODE: Mode = {
  id: 'battery',
  campaign: true,
  // a defence: possessed from its circle, Fire only, a flamethrower that lands where you aim, a half-ring (battery.ts)
  possession: {
    of: (w, i) => w.battery!.drive[i],
    buttons: driveButtons,
    face: (w, i) => driveSpray(w, i).face,
    target: driveTarget,
    spray: driveSpray,
    splash: BATTERY.splash,
    ring: BATTERY.ringRadius,
  },
  // one lane per defence: harmless, they batter its wall until someone's there; archers stand off past the flamethrower
  enemies: {
    holdAt: (w, i) => {
      if (w.battery!.lane[i] < 0) return undefined;
      const lt = laneTarget(w, i);
      return lt < 0 || ARCHETYPES[w.bodies.arch[i]].attack !== ATTACK.bolt ? holdSpot(w, i, lt) : undefined;
    },
    target: laneTarget,
    standoff: (w, i, t) => (driving(w, t) ? batteryStandoff(w, i, t) : undefined),
    shotRange: () => BWAVES.archerStandoff + 1.5,
  },
  state: (w) => {
    w.battery = {
      drive: new Int8Array(MAX_SEATS).fill(-1), homeX: new Float64Array(MAX_SEATS), homeY: new Float64Array(MAX_SEATS),
      lane: new Int8Array(MAX_BODIES).fill(-1), flow: new Float64Array([1]), wellT: new Int32Array(3),
    };
  },
  setup: (w, opts) => { dummies(w, opts); raiseGateFire(w); },
  press: (w, inputs) => { batteryPress(w, inputs); repairPress(w, inputs); },
  director: (w) => tickBatteryWaves(w),
  // a defence's pool is Fire only; your own is the Life you brought from the infirmary, and once the well has infused
  // you, a little Fire too
  runeMax: (w, i, id) => (w.battery!.drive[i] >= 0 ? (id === EL.fire ? RUNES.max.fire : 0)
    : id === EL.life ? CAMPAIGN.life : id === EL.fire && infused(w) ? WELL.own : 0),
  // a defence's pool fills as fast as the well still gives; your own as slowly as the campaign's early going
  regen: (w, i) => (i < 0 || i >= MAX_SEATS ? undefined : w.battery!.drive[i] >= 0 ? RUNES.regen * w.battery!.flow[0] : CAMPAIGN.regen),
  wizardHp: () => BODY.wizardHp * CAMPAIGN.hardy,
  pools: (w) => [w.battery!],
  onSpawn: (w, i) => { w.battery!.lane[i] = -1; }, // no lane until the battery sends it at a defence
  checkpoints: BATTERY_CHECKPOINTS,
  reached: batteryReached,
};

/** The tutorial prototype: beats, each with its own pools and checks (tutorial.ts). */
const TUTORIAL: Mode = {
  id: 'tutorial',
  state: (w, opts) => { w.tut = newTutorial(opts.tutorialBeat ?? TUT_ORDER[0]); },
  setup: () => {},
  press: (w) => beginTutorialTick(w),
  director: (w) => tickWaves(w),
  late: (w) => tickTutorial(w), // last, so its checks see every event of the tick (casts, parries, faints, deaths)
  runeMax: (w, _i, id) => tutPool(w.tut!.state[0], id),
  pools: (w) => [w.tut!],
  onSpawn: (w, i) => { w.tut!.tag[i] = 0; }, // a reused slot is nobody's target until the tutorial tags it again
};

/**
 * The drill yard: the opening's crash course, stations along a path (yard.ts). A campaign area, so the party carries on
 * back into the courtyard through its gate; it teaches no element of its own, the focus's charge is the academy's.
 */
const YARD_MODE: Mode = {
  id: 'yard',
  campaign: true,
  enemies: { restAt: sparRest, target: sparTarget, standoff: sparStandoff, shotRange: () => 24 },
  state: (w) => { w.yard = newYard(); },
  setup: () => {},
  press: (w, inputs) => yardPress(w, inputs),
  director: (w) => tickYard(w),
  late: (w) => lateYard(w),
  runeMax: yardRuneMax,
  regen: (w, i) => (i >= 0 && i < MAX_SEATS ? 0 : undefined), // a focus holds a charge; it doesn't refill
  pools: (w) => [w.yard!],
  onSpawn: (w, i) => { w.yard!.tag[i] = 0; },
  leaveTo: (w) => (w.yard!.state[YS.leave] ? 'court' : undefined),
  checkpoints: YARD_CHECKPOINTS,
  reached: yardReached,
};

/** The courtyard: the academy's central court and the opening's hub; for now only its gates out (court.ts). */
const COURT_MODE: Mode = {
  id: 'court',
  campaign: true,
  setup: () => {},
  director: () => {},
  runeMax: () => 0,
  leaveTo: courtLeaveTo,
};

/** The infirmary: outside the main gate on the battery road; for now only its gates (infirmary.ts). */
const INFIRMARY_MODE: Mode = {
  id: 'infirmary',
  campaign: true,
  setup: () => {},
  director: () => {},
  runeMax: () => 0,
  leaveTo: infirmaryLeaveTo,
};

export const MODES: Readonly<Record<ModeId, Mode>> = { sandbox: SANDBOX, arena: ARENA_MODE, survive: SURVIVE, battery: BATTERY_MODE, tutorial: TUTORIAL, yard: YARD_MODE, court: COURT_MODE, infirmary: INFIRMARY_MODE };

const ROOM_MODE: Readonly<Record<Room, ModeId>> = {
  sanctum: 'sandbox', academy: 'sandbox', terraces: 'sandbox', arena: 'arena', survive: 'survive', battery: 'battery', tutorial: 'tutorial', yard: 'yard', court: 'court', infirmary: 'infirmary',
};

export const modeOf = (room: Room): Mode => MODES[ROOM_MODE[room]];

/**
 * The battery's gate is closed by a standing wall of fire: Shield + Fire + Fire, the same curtain a wizard casts, so it
 * burns whoever crosses it and stops nothing. It belongs to the place, so it never drains anyone or breaks. The span is
 * the gate's opening (tools/segments/01-opening/battery-level.py: GATE and WALL_Y).
 */
function raiseGateFire(w: World): void {
  const wl = w.walls, k = 0;
  wl.type[k] = WALL.curtain; wl.owner[k] = TERRAIN;
  wl.x1[k] = -3; wl.y1[k] = -1; wl.x2[k] = 3; wl.y2[k] = -1;
  wl.hp[k] = wl.maxHp[k] = 100;
  wl.els[k * N_EL + EL.shield - 1] = 1;
  wl.els[k * N_EL + EL.fire - 1] = 2;
}
