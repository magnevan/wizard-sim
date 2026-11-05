/**
 * Every tunable gameplay number, as one flat list the debug panel and the balance harness use.
 * Entries point into the config tables (config.ts, the archetype table, the wave timings), so
 * setting one changes the game on the next tick, and `overrides()` lists what differs from the
 * defaults as a JSON-able map you can paste back into config.ts.
 *
 * Determinism: the tables are part of the rules. Two peers (or a replay) agree only if they run
 * the same overrides, so `tuningHash()` names a tuning; a replay or a lockstep session should
 * carry it. Tuning live is a local, dev-only thing until then.
 */
import { ARCHETYPES } from './archetypes';
import { ARMS, BODY, COMBAT, DAMAGE, PERKS, RHYTHM, RUNES, SHAPES, STATUS, STRUCT, SURFACE } from './config';
import { WAVE_TIMES } from './waves';

export interface Tunable {
  id: string;
  group: string;
  label: string;
  def: number;
  min: number;
  max: number;
  step: number;
  help?: string;
  get(): number;
  set(v: number): void;
}

/** One-line explanations for the numbers that matter most to feel. */
const HELP: Record<string, string> = {
  'structures.turretShotCost': 'A turret shot costs this share of its runes (0.5 = half). Shots fire uncharged, like your tap cast.',
  'structures.turretShare': 'All your turrets together spend at most this share of your rune regen; shots slow down to fit (and slow further with more turrets).',
  'body.castWalk': 'How fast you walk while holding a channel or charge, as a fraction of walk speed (1 = no slow-down, 0 = rooted). Hold LMB and RMB together to walk and cast.',
  'runes.regen': 'Runes per second, per element. The main pace knob: lower means fewer, more deliberate casts.',
  'runes.max.fire': 'How many Fire runes fit in your pool (also caps how many you can put in one spell).',
  'rhythm.windup': 'Seconds before any spell goes off. Plus windupPerRune for each rune in it.',
  'rhythm.windupPerRune': 'Extra wind-up per rune: what makes big spells feel heavy.',
  'rhythm.recovery': 'Seconds after a cast before the next can start.',
  'rhythm.naturalChannel': 'Beams and sprays are free for this long, then cost upkeep.',
  'rhythm.upkeep': 'Runes per second of the form element a channel costs past its natural duration.',
  'combat.channelRate': 'Beam / spray damage per second = per-hit damage x this.',
  'combat.healPerLife': 'Healing per Life rune for one hit (channels: per second x channelRate).',
  'status.freeze': 'Seconds a frozen body stays frozen.',
  'status.wetShockMult': 'Lightning damage multiplier on wet targets.',
  'status.shatterMult': 'Earth damage multiplier on frozen targets (and the freeze ends).',
  'structures.idleDrain': 'Shield runes per second each energy wall drains while it stands (Model A).',
  'structures.turretInterval': 'Seconds between turret shots.',
  'waves.lull': 'Seconds of preparation before each wave (after the first).',
};

const list: Tunable[] = [];

function range(def: number): [number, number, number] {
  if (def === 0) return [0, 20, 0.5];
  if (Number.isInteger(def) && def >= 2) return [0, Math.max(10, def * 4), 1];
  if (def < 0.1) return [0, def * 5, 0.001];
  if (def < 1) return [0, Math.max(1, def * 4), 0.01];
  return [0, def * 4, 0.05];
}

function add(id: string, group: string, obj: Record<string, unknown>, key: string): void {
  const def = obj[key] as number;
  const [min, max, step] = range(def);
  list.push({
    id, group, label: id.split('.').slice(1).join(' '), def, min, max, step, help: HELP[id],
    get: () => obj[key] as number,
    set: (v: number) => { obj[key] = v; },
  });
}

/** Adds every numeric leaf of `obj` (one level of nesting) under `prefix`. */
function table(prefix: string, group: string, obj: Record<string, unknown>): void {
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (typeof v === 'number') add(`${prefix}.${k}`, group, obj, k);
    else if (v && typeof v === 'object' && !Array.isArray(v)) {
      const sub = v as Record<string, unknown>;
      for (const k2 of Object.keys(sub)) if (typeof sub[k2] === 'number') add(`${prefix}.${k}.${k2}`, group, sub, k2);
    }
  }
}

table('runes', 'Runes', RUNES as unknown as Record<string, unknown>);
table('rhythm', 'Cast rhythm', RHYTHM as unknown as Record<string, unknown>);
table('damage', 'Damage per rune', DAMAGE as unknown as Record<string, unknown>);
table('combat', 'Damage per rune', COMBAT as unknown as Record<string, unknown>);
table('status', 'Statuses', STATUS as unknown as Record<string, unknown>);
table('shapes', 'Spell shapes', SHAPES as unknown as Record<string, unknown>);
table('structures', 'Shield & Sigil', STRUCT as unknown as Record<string, unknown>);
table('arms', 'Weapons & guards', ARMS as unknown as Record<string, unknown>);
table('body', 'Bodies', BODY as unknown as Record<string, unknown>);
table('surface', 'Surfaces', SURFACE as unknown as Record<string, unknown>);
table('waves', 'Waves', WAVE_TIMES as unknown as Record<string, unknown>);
table('perks', 'Survive power-ups', PERKS as unknown as Record<string, unknown>);
for (const a of ARCHETYPES) {
  if (a.id === 'none') continue;
  for (const k of ['hp', 'speed', 'damage', 'windup', 'cooldown', 'reach', 'knockback']) add(`enemy.${a.id}.${k}`, `Enemy: ${a.name}`, a as unknown as Record<string, unknown>, k);
}

export function tunables(): readonly Tunable[] { return list; }

export function findTunable(id: string): Tunable | undefined { return list.find((t) => t.id === id); }

/** Values that differ from the defaults, by id. */
export function overrides(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of list) if (t.get() !== t.def) out[t.id] = t.get();
  return out;
}

/** Applies a map of id -> value (unknown ids are ignored, and returned). */
export function applyOverrides(o: Record<string, number>): string[] {
  const unknown: string[] = [];
  for (const id of Object.keys(o)) {
    const t = findTunable(id);
    if (t && typeof o[id] === 'number' && Number.isFinite(o[id])) t.set(o[id]); else unknown.push(id);
  }
  return unknown;
}

export function resetTuning(): void { for (const t of list) t.set(t.def); }

/** FNV-1a over the sorted overrides: 0 for the defaults. Two runs agree only if this matches. */
export function tuningHash(): number {
  const o = overrides(), ids = Object.keys(o).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  if (!ids.length) return 0;
  let h = 0x811c9dc5;
  for (const ch of ids.map((id) => `${id}=${o[id]}`).join(';')) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193);
  return h >>> 0;
}
