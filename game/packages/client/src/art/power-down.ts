/**
 * The battery's power going down, as one timeline from the moment the well runs dry (sim battery.wellT[1]). Nothing
 * switches: the far ends die first and it runs back into the well (the user, 2026-11-12: "the power down should be an
 * animation").
 *
 *   0    to 0.8 s   the defences sputter and go dark: towers fade to their burnt-out art, pilot flames choke
 *   0    to 1.4 s   the gate's fire gutters down (WELL.gutter: the sim puts it out at the end)
 *   0    to 1.1 s   the light drains back down the glyph paths into the well
 *   0.9  to 3.0 s   the well dies: the flare, then the rings fall onto the drum and the light goes out
 *   3.6 s           the infusion (WELL.surge), after a quiet beat
 *
 * Until it's dry the well is overloaded (`unstable` 1): it has been from the start, holding four defences up under
 * siege (the user, 2026-11-13; the opening's repair: "Unstable, then Drained, then Stable").
 *
 * And the repair, from the press of X at the well (sim battery.wellT[2], battery-waves.ts repairPress), as `REPAIR`:
 *
 *   0    to 0.6 s   the screen fades to black
 *   0.6  to 1.4 s   black: the work done unseen
 *   1.4  to 2.2 s   back from black, on the drained well
 *   2.0  to 5.0 s   the well rises: the rings lift off the drum as the fall played back, the light returns, then the
 *                   steady spin (art/well-anim.ts `repair`)
 *   3.0  to 4.2 s   the light runs back out along the paths
 *   3.8  to 4.6 s   the defences relight as it reaches them (WELL.relit: from then they can be possessed again)
 */
import { WELL, type World } from '@wizard-sim/sim';
import { clamp, rand, smooth } from './util';

export const POWER = { towers: 0.8, drain: 1.1, wellFrom: 0.9, wellTo: 3.0 } as const;
export const REPAIR = { out: 0.6, black: 1.4, back: 2.2, riseFrom: 2.0, riseTo: 5.0, linesFrom: 3.0, lines: 1.2, towersFrom: WELL.relit - 0.8 } as const;

/** Seconds since the well ran dry, or 0 if it hasn't. */
export const dryTime = (w: World): number => (w.battery ? w.battery.wellT[1] / 60 : 0);
/** Seconds since the repair began, or 0 if it hasn't. */
export const repairTime = (w: World): number => (w.battery ? w.battery.wellT[2] / 60 : 0);

/** How overloaded the well is: 1 until it runs dry (then the power-down and the repair take over). */
export const unstable = (w: World): number => (!w.battery || dryTime(w) > 0 ? 0 : 1);

/** A sputter: flips on and off at `rate` a second, more often off as k falls; deterministic in t. */
function sputter(t: number, k: number, rate: number, seed: number): number {
  if (k <= 0 || k >= 1) return k;
  return rand(Math.floor(t * rate), seed, 77) < k ? Math.min(1, k + 0.35) : k * 0.25;
}

/** How lit the defences are: 1 working, 0 burnt out, sputtering between (going out, and coming back with the repair). */
export function towersLit(w: World): number {
  const r = repairTime(w);
  if (r > REPAIR.towersFrom) return sputter(r, smooth(clamp((r - REPAIR.towersFrom) / (WELL.relit - REPAIR.towersFrom), 0, 1)), 16, 4);
  const t = dryTime(w);
  if (t <= 0) return 1;
  return sputter(t, 1 - smooth(clamp(t / POWER.towers, 0, 1)), 16, 3);
}

/** How tall the gate's fire stands: 1, guttering down to 0 over WELL.gutter. */
export function gateLit(w: World): number {
  const t = dryTime(w);
  if (t <= 0) return 1;
  return sputter(t, 1 - smooth(clamp(t / WELL.gutter, 0, 1)), 11, 5);
}

/** The well's power: 1 working, 0 dead (smooth; the well's own art adds its stutter). The repair is `wellRepair`. */
export function wellPower(w: World): number {
  const t = dryTime(w);
  if (t <= 0) return 1;
  return 1 - smooth(clamp((t - POWER.wellFrom) / (POWER.wellTo - POWER.wellFrom), 0, 1));
}

/** The well's repair, 0 till it starts rising, to 1 once it spins steady again (and 1 from then on). */
export const wellRepair = (w: World): number => clamp((repairTime(w) - REPAIR.riseFrom) / (REPAIR.riseTo - REPAIR.riseFrom), 0, 1);

/** How dark the screen is for the repair: fading to black, black, and back. */
export function blackout(w: World): number {
  const r = repairTime(w);
  if (r <= 0) return 0;
  if (r < REPAIR.out) return smooth(r / REPAIR.out);
  if (r < REPAIR.black) return 1;
  return 1 - smooth(clamp((r - REPAIR.black) / (REPAIR.back - REPAIR.black), 0, 1));
}

/**
 * The glyph paths' light: how much the well gives (its flow; full again with the repair), and how far out from the well
 * the light reaches, as a share of the way (1 all of it; draining back once dry; running out again with the repair).
 */
export function lineLight(w: World): { flow: number; reach: number } {
  const r = repairTime(w);
  if (r > 0) { const k = clamp((r - REPAIR.linesFrom) / REPAIR.lines, 0, 1); return { flow: k, reach: k }; }
  const t = dryTime(w);
  return { flow: w.battery ? w.battery.flow[0] : 1, reach: t > 0 ? Math.max(0, 1 - t / POWER.drain) : 1 };
}
