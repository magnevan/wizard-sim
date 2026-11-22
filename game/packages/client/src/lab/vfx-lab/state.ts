/**
 * The VFX Lab's setup: everything the URL can say, read from it once at boot and written back to it (history.replaceState)
 * whenever the panel changes it, so the page in the address bar is always this setup and stays linkable.
 *
 * Keys are read as q.get('key') literally: the dev-options test collects a lab's keys that way.
 */
import { rules, type Element } from '@wizard-sim/rules';

/** How it's cast (demo.ts): with runes queued. */
export const FORMS = ['force', 'area', 'place', 'self', 'weapon', 'drag', 'hold', 'holddrag', 'guard'] as const;
/** With nothing queued: the hands. */
export const HANDS = ['strike', 'heavy', 'special', 'channel', 'retreat', 'block'] as const;
export const isHands = (form: string): boolean => (HANDS as readonly string[]).includes(form);
/** The speeds the panel offers. */
export const SPEEDS = [0.25, 0.5, 1] as const;

export interface LabState {
  /** The rune keys pressed, in order (base elements; 'ice' in a URL is pressed as Water then Cold). */
  presses: Element[];
  form: string;
  scene: string;
  /** A lighting mood instead of the scene's, or null. */
  mood: string | null;
  seed: number;
  /** Wizard 0's aim: [degrees, units] from the caster on the ground, 0 to the right of the screen, clockwise; null: the scene's target. */
  aim: [number, number] | null;
  /** Paused at t s from the cast, or null: playing. */
  t: number | null;
  speed: number;
  loop: number;
  grid: boolean;
  ns: number[];
  /** Rows of other spells (recipes as ?spell= takes them, `els/form`), each drawn like the main one; null: just the main one. */
  spells: string[] | null;
  /** Columns at these moments (s after the cast, added to t), instead of one; null: one. */
  times: number[] | null;
  /** The sim's hit shapes dotted over the stage. */
  hit: boolean;
  /** Wizard 1's aim swings back and forth (as a player sweeping a crowd). */
  sweep: boolean;
  /** Wizard 1 walks to the right of the screen from the moment the spell goes off. */
  move: boolean;
  /** A hands move (HANDS) wizard 1 makes over and over after the spell (a conjured weapon, then swung), or null. */
  then: string | null;
  /** Each panel shows only a box this many art px wide round wizard 1, scaled up; null: the whole panel. */
  focus: number | null;
  /** Kept from the URL; the panel doesn't change these. */
  scale: number;
  size: [number, number] | null;
  zoom: [number, number, number, number] | null;
  others: string | null;
  bar: boolean;
}

/** The queue the game would make of these presses (cancels and Ice included), and whether the last press did nothing (full). */
export function queueOf(presses: readonly Element[]): Element[] {
  let q: Element[] = [];
  for (const p of presses) q = rules.addElement(q, p).queue;
  return q;
}
/** Would pressing `el` now do anything? (A full queue ignores a press that neither cancels nor combines.) */
export const canPress = (presses: readonly Element[], el: Element): boolean => rules.addElement(queueOf(presses), el).kind !== 'full';

/** The presses at n runes: as written, then more of the first, or cut short. */
export function atRunes(els: readonly Element[], n: number): Element[] {
  const out = els.slice(0, n);
  while (out.length < n && els.length) out.push(els[0]);
  return out;
}

/** The rune keys a recipe's elements are pressed as ('ice' is Water then Cold). */
export const pressesOf = (s: string): Element[] =>
  s.split(/[+ ,]/).filter((e) => (rules.ALL as readonly string[]).includes(e)).flatMap((e) => rules.runesOf(e as Element));

export function readState(search: string): LabState {
  const q = new URLSearchParams(search);
  const [elsQ, formThen] = (q.get('spell') ?? 'fire,fire,fire').split('/');
  // `els/weapon>strike`: the form, then a hands move (as &then=)
  const [formInSpell, thenInSpell] = formThen?.split('>') ?? [];
  let presses = pressesOf(elsQ);
  const runes = q.has('runes') ? Number(q.get('runes')) : NaN;
  if (runes >= 0 && runes <= 5) presses = atRunes(presses, runes);
  const grid = q.get('grid') === 'runes';
  const nums = (s: string | null) => s?.split(',').map(Number);
  const aim = nums(q.get('aim')), zoom = nums(q.get('zoom')), size = q.get('size')?.split('x').map(Number);
  return {
    presses,
    form: q.get('form') ?? formInSpell ?? 'force',
    scene: q.get('scene') ?? 'empty',
    mood: q.get('mood'),
    seed: Number(q.get('seed') ?? 7) | 0,
    aim: aim && aim.length === 2 && aim.every(Number.isFinite) ? [aim[0], aim[1]] : null,
    t: q.has('t') && Number.isFinite(Number(q.get('t'))) ? Number(q.get('t')) : null,
    speed: Number(q.get('speed') ?? 1) || 1,
    loop: Number(q.get('loop') ?? 3) || 3,
    grid,
    ns: (q.get('ns') ?? '1,2,3,4,5').split(',').map(Number).filter((n) => n >= 1 && n <= 5),
    spells: q.get('spells')?.split(';').map((x) => x.trim()).filter(Boolean) || null,
    times: q.get('times')?.split(',').map(Number).filter(Number.isFinite) || null,
    hit: q.get('hit') === '1',
    sweep: q.get('sweep') === '1',
    move: q.get('move') === '1',
    then: [q.get('then'), thenInSpell].find((x) => x && isHands(x)) ?? null,
    focus: q.get('focus') && q.get('focus') !== '0' ? (Number(q.get('focus')) > 1 ? Number(q.get('focus')) : 64) : null,
    scale: Math.max(1, Math.floor(Number(q.get('scale') ?? 2))),
    size: size && size.length === 2 && size.every((v) => v > 0) ? [size[0], size[1]] : null,
    zoom: zoom && zoom.length === 4 && zoom.every(Number.isFinite) ? [zoom[0], zoom[1], zoom[2], zoom[3]] : null,
    others: q.get('others'),
    bar: q.get('bar') !== '0',
  };
}

const r3 = (v: number) => String(Math.round(v * 1000) / 1000);

/** The URL for this state: the page's other options (?lights=0, ...) kept, the lab's own rewritten. */
export function writeState(s: LabState): void {
  const p = new URLSearchParams(location.search);
  const set = (k: string, v: string | null) => { if (v === null || v === '') p.delete(k); else p.set(k, v); };
  set('spell', s.presses.join(','));
  set('runes', null);
  set('form', s.form);
  set('scene', s.scene === 'empty' ? null : s.scene);
  set('mood', s.mood);
  set('seed', s.seed === 7 ? null : String(s.seed));
  set('aim', s.aim ? `${r3(s.aim[0])},${r3(s.aim[1])}` : null);
  set('t', s.t === null ? null : r3(s.t));
  set('speed', s.speed === 1 ? null : String(s.speed));
  set('loop', s.loop === 3 ? null : String(s.loop));
  set('grid', s.grid ? 'runes' : null);
  set('ns', s.grid && s.ns.join(',') !== '1,2,3,4,5' ? s.ns.join(',') : null);
  set('spells', s.spells?.length ? s.spells.join(';') : null);
  set('times', s.times?.length ? s.times.map(r3).join(',') : null);
  set('hit', s.hit ? '1' : null);
  set('sweep', s.sweep ? '1' : null);
  set('move', s.move ? '1' : null);
  set('then', s.then);
  try { history.replaceState(null, '', `${location.pathname}?${p.toString().replace(/%2C/g, ',').replace(/%3B/g, ';').replace(/%2F/g, '/')}${location.hash}`); } catch { /* sandboxed */ }
}
