/**
 * Switching named parts of the spell effects off, live, for debugging one suspect at a time (?fxoff=, Tune › URL options
 * › Effect parts off): a comma list such as `floor.gas,wave.sparks`. A name turns off everything named that or under it
 * (`floor` is the whole fire floor, `floor.gas` only its flames).
 *
 * Two ways for an effect to take part:
 * - **Whole meshes and groups:** give the object a `name` (`mesh.name = 'wave.sparks'`). Spells3D.frame hides every
 *   named object that is off, and all under it, after the effects have updated (by its layers, so the effects' own
 *   `visible` is left alone and a part comes back when it's switched on again). Named today: the effects' groups
 *   (floor, wave, cold, arcane, earth, statuses, windup, standins, spray), and `floor.bed`, `floor.gas`, `floor.embers`,
 *   `wave.ground`, `wave.smoke`, `wave.gas`, `wave.flash`, `wave.sparks`, `wave.embers`. `lights` drops the spell lights.
 * - **Inside a shader:** read `fxOn('floor.licks')` in the effect's update and pass it as a uniform (`uLicks: 1 or 0`),
 *   multiplying the part's contribution by it, so the toggle costs one uniform and no recompile. Add the name to the list
 *   above when you do.
 *
 * The scripts use it through cast3d.html: `npm run fx-sheet -- ... --off floor.gas`, or `window.__fxoff('floor.gas')`
 * in the page (then `__seek(t)` again to redraw a frozen frame).
 */
import type * as THREE from 'three';
import { onOption, opt } from '../dev-options';

let cache: string[] | null = null;
onOption('fxoff', () => { cache = null; });

/** The names switched off (?fxoff=). */
export function fxOffList(): readonly string[] {
  return (cache ??= (opt('fxoff') ?? '').split(',').map((s) => s.trim()).filter(Boolean));
}

/** Whether `name` is switched off: named itself, or a part of something named (`floor` covers `floor.gas`). */
export function fxOff(name: string): boolean {
  if (!name) return false;
  for (const o of fxOffList()) if (name === o || name.startsWith(o + '.')) return true;
  return false;
}

/** The opposite, for a uniform: 1 while `name` is drawn, 0 while it's off. */
export const fxOn = (name: string): number => (fxOff(name) ? 0 : 1);

/** Whether anything is hidden (so a pass with nothing off and nothing to restore can be skipped). */
let anyHidden = false;

/** Hide (by layers) every object under `roots` that is off by its own name or an ancestor's; restore the rest. */
export function applyFxOff(roots: readonly THREE.Object3D[]): void {
  const off = fxOffList().length > 0;
  if (!off && !anyHidden) return;
  anyHidden = false;
  const walk = (o: THREE.Object3D, inherited: boolean): void => {
    const hit = inherited || fxOff(o.name);
    const ud = o.userData as { fxMask?: number };
    if (hit) {
      if (ud.fxMask === undefined) { ud.fxMask = o.layers.mask; o.layers.mask = 0; }
      anyHidden = true;
    } else if (ud.fxMask !== undefined) { o.layers.mask = ud.fxMask; delete ud.fxMask; }
    for (const c of o.children) walk(c, hit);
  };
  for (const r of roots) walk(r, false);
}
