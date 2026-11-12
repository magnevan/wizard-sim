/**
 * The battery's power going down, as one timeline from the moment the well runs dry (sim battery.wellT[1]). Nothing
 * switches: the far ends die first and it runs back into the well (the user, 2026-11-12: "the power down should be an
 * animation").
 *
 *   0    to 0.8 s   the defences sputter and go dark: towers fade to their burnt-out art, pilot flames choke
 *   0    to 1.4 s   the gate's fire gutters down (WELL.gutter: the sim puts it out at the end)
 *   0    to 1.1 s   the light drains back down the glyph paths into the well
 *   0.9  to 3.0 s   the well dies: the crystal stutters and darkens and sinks, the rings slow, tip and drop onto the drum
 *   3.6 s           the infusion (WELL.surge), after a quiet beat
 *
 * Before it's dry, as the well fails (beat 5), `unstable` rises from 0 to 1 with the flow running out.
 */
import { WELL, type World } from '@wizard-sim/sim';
import { clamp, rand, smooth } from './util';

export const POWER = { towers: 0.8, drain: 1.1, wellFrom: 0.9, wellTo: 3.0 } as const;

/** Seconds since the well ran dry, or 0 if it hasn't. */
export const dryTime = (w: World): number => (w.battery ? w.battery.wellT[1] / 60 : 0);

/** How overloaded the well is before it's dry: 0 while it holds; from the moment it starts failing 0.3, rising to 1 as it runs out. */
export const unstable = (w: World): number => (!w.battery || dryTime(w) > 0 || w.battery.flow[0] >= 1 ? 0 : clamp(0.3 + 0.7 * (1 - w.battery.flow[0]), 0, 1));

/** A sputter: flips on and off at `rate` a second, more often off as k falls; deterministic in t. */
function sputter(t: number, k: number, rate: number, seed: number): number {
  if (k <= 0 || k >= 1) return k;
  return rand(Math.floor(t * rate), seed, 77) < k ? Math.min(1, k + 0.35) : k * 0.25;
}

/** How lit the defences are: 1 working, 0 burnt out, sputtering between. */
export function towersLit(w: World): number {
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

/** The well's power: 1 working, 0 dead (smooth; the well's own art adds its stutter). */
export function wellPower(w: World): number {
  const t = dryTime(w);
  if (t <= 0) return 1;
  return 1 - smooth(clamp((t - POWER.wellFrom) / (POWER.wellTo - POWER.wellFrom), 0, 1));
}
