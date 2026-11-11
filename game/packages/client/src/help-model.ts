/**
 * The help panel's data model (F1, help-panel.ts): what the queued runes will do, one row per cast
 * gesture, or with nothing queued, what your hands do with the weapon and guard you hold.
 *
 * Pure: the rules, the sim's compile() and its config numbers in, plain rows out. No DOM and no
 * Pixi, so it is tested in node (test/help-model.test.ts). The spell text is the rules' own
 * (tools/spell-atlas/rules-c.js), shortened to a line or two; the hands' moves are written here from
 * the sim's tables (hands.ts, guards.ts), because the rules don't describe them.
 */
import { rules, type Cast, type Element, type SpellDescriptor } from '@wizard-sim/rules';
import {
  ARMS, COMBAT, DAMAGE, GUARD_NAME, QUEUE_MAX, RHYTHM, RUNES, SHAPES, STATUS, STRUCT, SURFACE,
  compile, elementName, formCurve, imbueReach, type SpellSpec,
} from '@wizard-sim/sim';
import type { Demo } from './demo';

/** How a row is cast: the mouse button, Shift, tap or hold, or Space; and the gamepad's buttons. */
export interface KeyGlyph { mouse: 'L' | 'R' | null; shift: boolean; note: '' | 'TAP' | 'HOLD'; space: boolean; pad: string }
/** A coloured word after the description: an extra element's trait (Chill, Burn) or a mix (Scald). */
export interface Tag { text: string; el: Element | null }

export interface HelpRow {
  /** The gesture: a spell's cast, or a hands move. */
  slot: Cast | 'strike' | 'heavy' | 'special' | 'defend' | 'retreat';
  keys: KeyGlyph;
  title: string;
  /** One or two sentences: the rules' text, shortened. */
  text: string;
  tags: Tag[];
  /** Compact numbers, shown only with stats on. */
  stats: string[];
  /** What one more rune would change (scaleLine), shown with the stats; '' for none. */
  scale: string;
  /** The element the row is drawn in (the spell's look), or null for plain. */
  look: Element | null;
  /** What the row's preview wizard does over and over (demo.ts). */
  demo: Demo;
  /** Nothing to show (a Defend with no guard): the preview stays idle. */
  idle?: boolean;
}

export interface HandsState {
  /** Element id of the conjured weapon (0: none, the bare staff). */
  weapon: number;
  /** Uses left on it. */
  uses: number;
  /** Guard index (GUARD in the sim; 0: none). */
  guard: number;
  /** Holding the sculpting wand (pure Sigil Weapon). */
  wand: boolean;
}

export interface HelpModel {
  mode: 'spell' | 'hands';
  queue: Element[];
  /** A line under the title: what the rows are for. */
  header: string;
  rows: HelpRow[];
  /** Changes whenever anything shown changes: the panel redraws and the previews restart on it. */
  key: string;
}

const K = (mouse: KeyGlyph['mouse'], shift: boolean, note: KeyGlyph['note'], pad: string, space = false): KeyGlyph => ({ mouse, shift, note, space, pad });

/** The five casts, in the order the rows show them, with their keys. */
export const CAST_ROWS: { cast: Cast; keys: KeyGlyph; demo: string }[] = [
  { cast: 'force', keys: K('R', false, '', 'RT'), demo: 'force' },
  { cast: 'area', keys: K('R', true, 'TAP', 'LT'), demo: 'area' },
  { cast: 'place', keys: K('R', true, 'HOLD', 'LT HOLD'), demo: 'place' },
  { cast: 'self', keys: K(null, false, '', 'RB', true), demo: 'self' },
  { cast: 'conjure', keys: K('L', true, '', 'LB+RT'), demo: 'weapon' },
];

const ELS = rules.ALL as readonly Element[]; // the nine keyed elements, then Ice
const EL_ID = (e: Element): number => ELS.indexOf(e) + 1;
const name = (e: Element): string => rules.ELEMENTS[e].name;
const n1 = (v: number): string => (Math.round(v * 10) / 10).toString();
const plural = (n: number, w: string): string => `${n} ${w}${n === 1 ? '' : 'S'}`;
/** Runes a queue costs: an Ice is a Water and a Cold. */
const runeCount = (q: readonly Element[]): number => q.reduce((n, e) => n + rules.runesOf(e).length, 0);

// ---- text ---------------------------------------------------------------------------------

/** Sentences of a text (a full stop, ! or ? followed by a space). */
const sentences = (t: string): string[] => t.split(/(?<=[.!?])\s+/).filter(Boolean);

/**
 * A spell's text, one or two sentences: the first, and the second too while both stay short. The
 * rules' own text otherwise (the water mixes' Area and Place, the imbued burst and the conjured
 * weapons and guards are described there since 2026-11-06); only Self on yourself is put together here.
 */
export function shortText(d: SpellDescriptor): string {
  if (d.id === 'elements/self') {
    // the elements simply hit you: each trait says what it does to you
    return d.payload.map((p) => `${p.trait}: ${lower1(p.text)}`).join(' ') || sentences(d.text)[0];
  }
  const s = sentences(d.text);
  let out = s[0] ?? '';
  if (s[1] && out.length + s[1].length < 120) out += ' ' + s[1];
  return out;
}
const lower1 = (t: string): string => t.charAt(0).toLowerCase() + t.slice(1);

/** Splits text into lines of at most `cols` characters, at spaces (a longer word is cut). */
export function wrap(text: string, cols: number): string[] {
  cols = Math.max(1, Math.floor(cols));
  const out: string[] = [];
  let line = '';
  for (let word of text.split(/\s+/).filter(Boolean)) {
    while (word.length > cols) { if (line) { out.push(line); line = ''; } out.push(word.slice(0, cols)); word = word.slice(cols); }
    if (!line) line = word;
    else if (line.length + 1 + word.length <= cols) line += ' ' + word;
    else { out.push(line); line = word; }
  }
  if (line) out.push(line);
  return out;
}

/** At most `max` lines; a cut last line ends with an ellipsis. */
export function clip(lines: string[], max: number, cols: number): string[] {
  if (lines.length <= max) return lines;
  const out = lines.slice(0, Math.max(0, max));
  if (out.length) out[out.length - 1] = out[out.length - 1].slice(0, cols - 3).replace(/[ ,.:;]+$/, '') + '...';
  return out;
}

// ---- spell stats --------------------------------------------------------------------------

/**
 * How hard one hit lands, against the per-rune table (the scales in fireSpell, channelTick and the
 * zones). Channels are per second: beams and sprays hit every tick at channelRate, an arc zaps at
 * 0.5 every arcInterval, a spring heals at 0.35 every half second.
 */
const SHAPE_SCALE: Partial<Record<SpellSpec['shape'], number>> = {
  patch: 0.5, strike: 1.2, discharge: 0.8, palm: 1.2, geyser: 1.3, spring: 0.7,
  beam: COMBAT.channelRate, spray: COMBAT.channelRate, arc: 0.5 / SHAPES.arcInterval,
};
const PER_SECOND = new Set<SpellSpec['shape']>(['beam', 'spray', 'arc', 'spring']);
/** Shapes that hit with their own payload when cast. Devices and structures are handled one by one. */
const HITS = new Set<SpellSpec['shape']>(['beam', 'spray', 'arc', 'missile', 'shards', 'nova', 'quake', 'discharge', 'patch', 'blast', 'geyser', 'strike', 'spring', 'palm', 'imbue', 'wave']);

/** One number about a spell: shown in the stats line (unless hidden) and compared by the +1 rune line. */
export interface Metric {
  key: string;
  label: string;
  v: number;
  unit: string;
  /** Not in the stats line (the +1 line still compares it). */
  hidden?: boolean;
}

/** Everything the panel knows about a spell's numbers. */
export interface SpellNumbers {
  /** Damage by element (key dmg:<el>) or healing (key heal), then the rest. */
  metrics: Metric[];
  /** Said after the damage: CHARGED, ALL SHARDS. */
  note: string;
}

const count = (spec: SpellSpec, e: Element): number => spec.counts[EL_ID(e) - 1];

/**
 * The payload's damage by element at scale k (hit.ts: the form element on its curve, the rest linear),
 * or its healing.
 */
function payload(spec: SpellSpec, k: number, unit: string, out: Metric[]): void {
  if (spec.heal) { out.push({ key: 'heal', label: 'HEALS', v: COMBAT.healPerLife * count(spec, 'life') * k, unit }); return; }
  for (const e of ELS) {
    const c = count(spec, e);
    if (!c || !DAMAGE[e]) continue;
    const id = EL_ID(e), mult = id === spec.form && c > 1 ? (formCurve(spec.form, c, COMBAT.sprayExp, COMBAT.rockExp, COMBAT.formScaling)) : c;
    out.push({ key: 'dmg:' + e, label: name(e).toUpperCase(), v: DAMAGE[e] * mult * k, unit });
  }
}

/** The statuses one hit leaves: Burn starts small and grows with the Fire in the hit; Chill grows with each Cold rune; Stun is a chance. */
function statuses(spec: SpellSpec, out: Metric[]): void {
  if (spec.heal) return;
  if (count(spec, 'fire') && !spec.scald) out.push({ key: 'burn', label: 'BURN FROM', v: STATUS.burnBase, unit: '' });
  const frost = STATUS.chillPerRune * (count(spec, 'cold') + STATUS.iceChill * count(spec, 'ice')); // by rune (hit.ts)
  if (frost) out.push({ key: 'chill', label: 'FROST', v: frost, unit: '', hidden: spec.channel });
  // the chance one hit stuns a wizard-sized body (shockRef): x / (1 + x)
  const x = STATUS.shockRate * count(spec, 'lightning');
  if (x) out.push({ key: 'stun', label: 'STUN CHANCE', v: Math.round((100 * x) / (1 + x)), unit: '%', hidden: spec.channel });
}

/** The queue without its Sigil runes (what a device or a conjured weapon carries). */
const rest = (queue: readonly Element[]): Element[] => queue.filter((e) => e !== 'sigil');

/**
 * A spell's numbers, from the same formulas the sim uses (effects.ts, structures.ts, cast.ts). The
 * stats line prints them; scaleLine compares them with one more rune. Statuses and floors that tick
 * later (burn, a burning floor) aren't in the damage.
 */
export function spellNumbers(queue: readonly Element[], cast: Cast, spec: SpellSpec = compile(queue, cast)): SpellNumbers {
  const m: Metric[] = [];
  const n = spec.formN, sh = spec.shape;
  let note = '';
  if (HITS.has(sh)) {
    const unit = PER_SECOND.has(sh) ? '/S' : '';
    let k = SHAPE_SCALE[sh] ?? 1;
    if (sh === 'shards') {
      // the whole volley, if every shard hits
      const shards = SHAPES.shardCount + spec.sizeN;
      k = SHAPES.shardPower * shards;
      note = 'ALL SHARDS';
      m.push({ key: 'shards', label: 'SHARDS', v: shards, unit: '', hidden: true });
    }
    if (sh === 'missile') note = 'CHARGED';
    payload(spec, k, unit, m);
    statuses(spec, m);
    if (spec.mod === 'push') m.push({ key: 'push', label: 'PUSH', v: SHAPES.push * count(spec, 'water') * (spec.channel ? COMBAT.channelStatus : 1), unit: spec.channel ? 'U/S A SECOND' : 'U/S' });
  }
  const reach = (label: string, v: number, hidden = false) => m.push({ key: 'reach', label, v, unit: 'U', hidden });
  const lasts = (v: number, label = 'LASTS') => m.push({ key: 'lasts', label, v, unit: 'S' });
  const longer = 1 + SHAPES.lingerPerRune * (n - 1);
  switch (sh) {
    case 'beam': reach('RANGE', SHAPES.beamRange); break;
    case 'spray':
      reach('RANGE', SHAPES.sprayRange + 0.5 * (spec.sizeN - 1));
      m.push({ key: 'cone', label: 'CONE', v: 100 * (1 + 0.25 * (spec.sizeN - 1)), unit: '%', hidden: true });
      break;
    case 'arc':
      reach('RANGE', SHAPES.arcRange);
      m.push({ key: 'jumps', label: 'JUMPS', v: SHAPES.arcJumps + Math.max(0, count(spec, 'lightning') - 1) + (spec.mod === 'chain' ? 1 : 0), unit: '' });
      break;
    case 'missile': m.push({ key: 'size', label: 'SIZE', v: 0.22 + 0.08 * n, unit: 'U', hidden: true }); break;
    case 'nova': reach('RADIUS', SHAPES.novaRadius + SHAPES.novaPerRune * (n - 1)); break;
    case 'quake': reach('RADIUS', SHAPES.novaRadius + 1 + SHAPES.novaPerRune * (n - 1)); break;
    case 'discharge': reach('RADIUS', 4 + n); break;
    case 'patch': {
      reach('RADIUS', SHAPES.patchRadius + 0.4 * (n - 1));
      const water = spec.form === EL_ID('water');
      lasts(spec.scald ? SHAPES.patchLife * longer : spec.freeze || count(spec, 'cold') || count(spec, 'ice') ? SURFACE.ice * longer : water ? SHAPES.rainLife + SHAPES.rainPerRune * (n - 1) : SURFACE.fire * longer);
      break;
    }
    case 'blast': reach('RADIUS', 2 + 0.4 * n); m.push({ key: 'fuse', label: 'FUSE', v: SHAPES.delayedBlast, unit: 'S' }); break;
    case 'geyser': reach('RADIUS', 0.9 + 0.4 * n); m.push({ key: 'fuse', label: 'FUSE', v: SHAPES.delayedBlast, unit: 'S' }); break;
    case 'spring': reach('RADIUS', 1.4 + 0.4 * n); lasts(4 + 2 * n); break;
    case 'strike': reach('RADIUS', 0.9); break;
    case 'imbue': reach('REACH', imbueReach(spec)); break;
    case 'blink': reach('UP TO', STRUCT.blinkRange); break;
    case 'wave': m.push({ key: 'width', label: 'WIDTH', v: 2 * (STRUCT.waveHalf + STRUCT.waveHalfPerRune * (spec.formN - 1)), unit: 'U' }); break;
    case 'arcwall': case 'drawnwall': case 'ring': {
      const earth = count(spec, 'earth');
      m.push({ key: 'hp', label: 'HP', v: spec.wall === 1 ? STRUCT.rockHp + STRUCT.rockHpPerRune * (earth - 1) : STRUCT.energyHp + STRUCT.energyHpPerRune * (spec.power - 1), unit: ' A PIECE' });
      if (spec.wall === 1) lasts(STRUCT.rockLife + STRUCT.rockLifePerEarth * (earth - 1), 'STANDS');
      break;
    }
    case 'ward': {
      if (count(spec, 'earth')) { m.push({ key: 'hp', label: 'ARMOUR HP', v: STRUCT.wardHp + STRUCT.wardHpPerRune * (spec.power - 1), unit: '' }); break; }
      const most = Math.max(0, ...rest(queue).filter((e) => e !== 'life' && e !== 'shield').map((e) => count(spec, e)));
      if (most) m.push({ key: 'resist', label: 'RESIST', v: Math.round(100 * (1 - 1 / (1 + STRUCT.wardPerRune * most))), unit: '%' });
      break;
    }
    case 'guard': m.push({ key: 'size', label: 'GUARD HP AND RETREAT', v: 100 * (1 + ARMS.runeSize * (Math.max(1, spec.power - 1) - 1)), unit: '%' }); break;
    case 'turret': case 'glyph': case 'lineglyph': {
      // the device casts its elements' own spell: a turret their Force (a tap: uncharged), a glyph their Place
      const inner = rest(queue);
      if (inner.length) {
        const ic: Cast = sh === 'turret' ? 'force' : 'place', is = compile(inner, ic);
        const sub = spellNumbers(inner, ic, sh === 'turret' ? { ...is, charge: false } : is);
        const k = sh === 'turret' && is.shape === 'missile' ? 0.5 : 1; // a tap: half a charged rock
        for (const x of sub.metrics) if (x.key !== 'windup') m.push({ ...x, v: x.key.startsWith('dmg:') || x.key === 'heal' ? x.v * k : x.v });
        note = sub.note === 'CHARGED' ? '' : sub.note;
      }
      if (sh === 'turret') {
        m.push({ key: 'range', label: 'TURRET RANGE', v: STRUCT.turretRange, unit: 'U' });
        m.push({ key: 'shot', label: 'A SHOT COSTS', v: STRUCT.turretShotCost * runeCount(inner), unit: ' RUNES' });
      }
      break;
    }
    case 'orbitals': {
      const inner = rest(queue), orbs = Math.max(1, inner.length);
      if (inner.length) payload(compile(inner, 'force'), 1.2 / Math.max(1, orbs * 0.5), '', m);
      m.push({ key: 'orbs', label: 'ORBS', v: orbs, unit: '' });
      note = 'AN ORB';
      break;
    }
    case 'weapon': {
      const inner = rest(queue);
      if (inner.length) payload(compile(inner, 'force'), ARMS.blowPayload, '', m);
      note = 'A BLOW';
      m.push({ key: 'uses', label: 'USES', v: STRUCT.weaponUses, unit: '' });
      break;
    }
    case 'aura': {
      // every half second (structures.ts): Life regenerates the wearer, Cold chills, Earth shoves; Fire, Haste and Glass don't grow
      const life = count(spec, 'life'), cold = count(spec, 'cold'), earth = count(spec, 'earth'), ice = count(spec, 'ice');
      if (ice) m.push({ key: 'spike', label: 'SPIKES', v: 2 * DAMAGE.ice * STRUCT.spikeAura * ice, unit: '/S' }); // the Spike aura stabs twice a second
      if (life) m.push({ key: 'regen', label: 'REGEN', v: 6 * life, unit: '/S' });
      if (cold) m.push({ key: 'chill', label: 'FROST', v: 5 * cold, unit: '/S' });
      if (earth) m.push({ key: 'shove', label: 'SHOVE', v: 6 * earth, unit: 'U/S' });
      lasts(STRUCT.auraTime); reach('RADIUS', STRUCT.auraRadius);
      break;
    }
    default: break;
  }
  // every channel is free this long, then each of its runes costs upkeep (cast.ts)
  if (spec.channel) m.push({ key: 'free', label: 'FREE FOR', v: RHYTHM.naturalChannel, unit: 'S', hidden: true });
  if (sh !== 'blink') m.push({ key: 'windup', label: 'WIND-UP', v: RHYTHM.windup + RHYTHM.windupPerRune * queue.length, unit: 'S', hidden: true });
  return { metrics: m, note };
}

const isDmg = (x: Metric) => x.key.startsWith('dmg:');
const fmt = (x: Metric) => `${x.label} ${n1(x.v)}${x.unit}`;

/** The numbers worth a glance: cost, damage (or healing) by element, statuses, reach, how long it lasts, hold. */
export function spellStats(queue: readonly Element[], cast: Cast, d: SpellDescriptor, spec: SpellSpec): string[] {
  const out: string[] = [];
  const kind = d.cost?.kind;
  out.push(plural(runeCount(queue), 'RUNE') + (kind === 'bind' ? ', BINDS 1 SIGIL' : kind === 'stuff' ? ', STANDS' : ''));
  const { metrics, note } = spellNumbers(queue, cast, spec);
  const dmg = metrics.filter(isDmg);
  if (dmg.length) out.push(dmg.map(fmt).join(' ') + (note ? ' ' + note : ''));
  const heal = metrics.find((x) => x.key === 'heal');
  if (heal) out.push(fmt(heal) + (note && !dmg.length ? ' ' + note : ''));
  for (const x of metrics) if (!isDmg(x) && x.key !== 'heal' && !x.hidden) out.push(fmt(x));
  const free = metrics.find((x) => x.key === 'free');
  if (spec.channel && free) out.push(`HOLD: CHANNEL, FREE ${n1(free.v)}S THEN ${RHYTHM.upkeep}/S`);
  if (spec.charge) out.push(`HOLD: CHARGE UP TO ${RHYTHM.chargeMax}S`);
  return out;
}

/**
 * The element a +1 rune adds: the form's, or for Shield and Sigil spells the element they carry (most
 * runes, the earliest on a tie), since another Shield or Sigil only changes the spell's kind.
 */
export function leadOf(queue: readonly Element[], spec: SpellSpec): Element | null {
  if (!queue.length) return null;
  const form = spec.form ? (elementName(spec.form) as Element) : null;
  if (form === 'shield' || form === 'sigil') {
    let best: Element | null = null, bn = 0;
    for (const e of queue) { const c = count(spec, e); if (e !== form && c > bn) { best = e; bn = c; } }
    return best ?? form;
  }
  return form ?? queue[0];
}

/**
 * What one more rune of the lead element would change: DMG X1.4, RANGE +0.5U, JUMPS +1, ... Damage and
 * healing as a ratio (the whole spell's, before statuses), the rest as differences. Says so when the
 * queue is full, when the rune would cancel, or when it makes another spell.
 */
export function scaleLine(queue: readonly Element[], cast: Cast): string {
  const spec = compile(queue, cast), lead = leadOf(queue, spec);
  if (!lead || spec.shape === 'self' || spec.shape === 'double') return '';
  const L = name(lead).toUpperCase();
  if (queue.length >= QUEUE_MAX) return `QUEUE FULL: ${QUEUE_MAX} RUNES IS THE MOST`;
  const next = rules.addElement(queue, lead);
  if (next.event) return `+1 ${L}: ${next.event.toUpperCase()}`;
  const spec2 = compile(next.queue, cast);
  if (spec2.shape !== spec.shape || spec2.title !== spec.title) return `+1 ${L}: BECOMES ${spec2.title.toUpperCase()}`;
  const a = spellNumbers(queue, cast, spec).metrics, b = spellNumbers(next.queue, cast, spec2).metrics;
  const parts: string[] = [];
  const total = (ms: Metric[], f: (x: Metric) => boolean) => ms.filter(f).reduce((s, x) => s + x.v, 0);
  for (const [f, label] of [[isDmg, 'DMG'], [(x: Metric) => x.key === 'heal', 'HEAL']] as const) {
    const t0 = total(a, f), t1 = total(b, f);
    if (t0 > 0 && Math.abs(t1 / t0 - 1) > 0.005) parts.push(`${label} ×${(Math.round((t1 / t0) * 100) / 100).toString()}`);
  }
  for (const y of b) {
    if (isDmg(y) || y.key === 'heal') continue;
    const x = a.find((z) => z.key === y.key);
    if (!x) { parts.push(fmt(y)); continue; }
    const dv = y.v - x.v;
    if (Math.abs(dv) < 1e-6) continue;
    const v = Math.abs(dv) < 0.1 ? (Math.round(dv * 100) / 100).toString() : n1(dv);
    parts.push(`${y.label} ${dv > 0 ? '+' : ''}${v}${y.unit === '%' ? '%' : y.unit.startsWith('/') && y.unit !== '/S' ? '' : y.unit}`);
  }
  const pool = RUNES.max[lead], have = next.queue.filter((e) => e === lead).length;
  const full = have > pool ? ` (A ${L} POOL HOLDS ${pool})` : '';
  const only = parts.length === 1 && parts[0].startsWith('WIND-UP') ? `NOTHING MORE, ${parts[0]}` : parts.join(', ') || 'NO CHANGE';
  return `+1 ${L}: ${only}${full}`;
}

// ---- spell rows ---------------------------------------------------------------------------

/** One row per cast for this queue. */
export function spellRows(queue: readonly Element[]): HelpRow[] {
  const els = queue.map(EL_ID);
  return CAST_ROWS.map(({ cast, keys, demo }) => {
    const d = rules.resolve(queue, cast);
    const spec = compile(queue, cast);
    const tags: Tag[] = [];
    if (d.id !== 'elements/self') for (const p of d.payload) tags.push({ text: p.trait, el: p.el });
    for (const m of (d.mix as { trait: string; els: Element[] }[] | undefined) ?? []) tags.push({ text: m.trait, el: m.els[0] ?? null });
    // the preview: conjured weapons get used on the next cycle, guards held up to block
    let dm: Demo = { els, cast: demo };
    if (cast === 'conjure' && spec.shape === 'weapon') dm = { els, cast: 'weapon', seq: [{ els, cast: 'weapon' }, { els: [], cast: 'strike' }] };
    if (cast === 'conjure' && spec.shape === 'guard') dm = { els, cast: 'weapon', seq: [{ els, cast: 'weapon' }, { els: [], cast: 'block' }] };
    const look = (spec.look ? elementName(spec.look) : queue[0] ?? null) as Element | null;
    return { slot: cast, keys, title: d.title, text: shortText(d), tags, stats: spellStats(queue, cast, d, spec), scale: scaleLine(queue, cast), look, demo: dm };
  });
}

// ---- your hands ---------------------------------------------------------------------------

interface WeaponInfo { name: string; strike: string; heavy: string; special: string; specialName: string; held?: boolean }
/** By the weapon's element (hands.ts); 'staff' when you hold none. */
export const WEAPONS: Record<string, WeaponInfo> = {
  staff: { name: 'Bare staff', strike: 'A shove with your staff: a light hit that pushes.', heavy: 'Hold, then let go: a big shove.', specialName: 'Sweep', special: 'A full circle around you.' },
  water: { name: 'Tide trident', strike: 'A narrow, long thrust that shoves hard.', heavy: 'A wave slash that rolls along the floor: it shoves and soaks.', specialName: 'Sweep', special: 'A full circle around you.' },
  life: { name: 'Healing hands', strike: 'A healing touch on whoever is in front of you.', heavy: 'Healing link: hold to heal the ally under the cursor.', specialName: 'Mend', special: 'Hold: heals the allies around you while you walk slowly.', held: true },
  cold: { name: 'Frost spear', strike: 'A long, narrow thrust that chills.', heavy: 'An impaling dash; frozen targets on the way shatter.', specialName: 'Javelin', special: 'Throw the spear: it pins and frosts what it hits.' },
  lightning: { name: 'Lightning whip', strike: 'A lash at reach that shocks.', heavy: 'Chain lash: the first target, then up to 3 more.', specialName: 'Sweep', special: 'A full circle around you.' },
  arcane: { name: 'Arcane wand', strike: 'A light arcane bolt.', heavy: 'Hold to charge a bolt that pierces.', specialName: 'Siphon', special: 'Hold: rooted, your runes regenerate fast.', held: true },
  fire: { name: 'Flame sword', strike: 'A slash that sets alight.', heavy: 'A rolling crescent of flame that ignites.', specialName: 'Sweep', special: 'A full circle around you.' },
  earth: { name: 'Stone maul', strike: 'A slow, heavy blow that knocks back.', heavy: 'A fissure down one lane, knocking down all in it.', specialName: 'Sweep', special: 'A full circle around you.' },
  ice: { name: 'Ice bow', strike: 'One quick icicle, the fastest shot in hand.', heavy: 'Hold to draw: a fan of three icicles; a full draw pierces.', specialName: 'Splinter shot', special: 'An icicle at the cursor that bursts into flying shards.' },
};

interface GuardInfo { name: string; el: Element; defend: string; retreatName: string; retreat: string; dist: number }
/** By GUARD_NAME (guards.ts). */
export const GUARDS: Record<string, GuardInfo> = {
  mirror: { name: 'Mirror buckler', el: 'shield', defend: 'A narrow block that glances shots off; a parry reflects one.', retreatName: 'Backstep', retreat: 'A quick step back.', dist: ARMS.backstep },
  bulwark: { name: 'Bulwark', el: 'earth', defend: 'A wide block that also stops melee; a parry bashes the attacker down.', retreatName: 'Shove step', retreat: 'A short step that shoves and stuns whoever is in front.', dist: ARMS.shoveStep },
  ember: { name: 'Ember targe', el: 'fire', defend: 'Blocking burns melee attackers; a parry sends a burst of flame.', retreatName: 'Flame step', retreat: 'Step back, leaving a line of fire.', dist: ARMS.flameStep },
  rime: { name: 'Rime kite', el: 'cold', defend: 'Blocking chills melee attackers; a parry freezes them.', retreatName: 'Ice slide', retreat: 'Slide back on a strip of ice.', dist: ARMS.iceSlide },
  spark: { name: 'Spark ring', el: 'lightning', defend: 'The weakest block; a parry discharges into nearby enemies.', retreatName: 'Blink', retreat: 'Blink back, leaving a spark where you stood.', dist: ARMS.blink },
  tide: { name: 'Tide shield', el: 'water', defend: 'Blocking shoves and soaks attackers; a parry sends a shoving wave.', retreatName: 'Surge', retreat: 'Step back behind a wave that shoves.', dist: ARMS.surge },
  prism: { name: 'Prism', el: 'arcane', defend: 'Stops even beams and stores what it blocks; lower it charged to fire the Lance.', retreatName: 'Phase', retreat: 'Phase back through bodies.', dist: ARMS.phase },
  leaf: { name: 'Leaf aegis', el: 'life', defend: 'Blocking heals the allies around you; a parry is a burst heal.', retreatName: 'Seed step', retreat: 'Step back, leaving a healing bloom.', dist: ARMS.seedStep },
};

const ARMS_KEY = (weapon: number): string => (weapon ? elementName(weapon) : 'staff');

/** Your hands' five moves for what you hold. */
export function handsRows(h: HandsState): HelpRow[] {
  const wk = ARMS_KEY(h.weapon), W = WEAPONS[wk] ?? WEAPONS.staff, look = (h.weapon ? elementName(h.weapon) : null) as Element | null;
  const gName = GUARD_NAME[h.guard] ?? 'none', G = h.guard ? GUARDS[gName] : null;
  const dmg = (ARMS.blowDmg as Record<string, number>)[wk] ?? ARMS.blowDmg.staff;
  const rec = (ARMS.strikeRecovery as Record<string, number>)[wk] ?? ARMS.strikeRecovery.staff;
  const els = h.weapon ? ' + ELEMENTS AT HALF POWER' : '';
  const uses = (u: number) => (h.weapon ? `, ${plural(u, 'USE')}` : '');
  const no: Demo = { els: [], cast: 'wait' };
  return [
    { slot: 'strike', keys: K('R', false, 'TAP', 'RT'), title: 'Strike', text: W.strike, tags: [], look,
      scale: '', stats: [`HIT ${dmg}${els}`, `RECOVERY ${rec}S${uses(1)}`], demo: { els: [], cast: 'strike' } },
    { slot: 'heavy', keys: K('R', false, 'HOLD', 'RT HOLD'), title: 'Heavy', text: W.heavy, tags: [], look,
      scale: '', stats: [`${ARMS.heavyScale}X A STRIKE`, `CHARGE UP TO ${RHYTHM.chargeMax}S${uses(2)}`], demo: { els: [], cast: 'heavy' } },
    { slot: 'special', keys: K('R', true, W.held ? 'HOLD' : '', W.held ? 'LT HOLD' : 'LT'), title: W.specialName, text: W.special, tags: [], look,
      scale: '', stats: [W.held ? `HOLD${h.weapon ? ', 1 USE/S' : ''}` : `${ARMS.sweepScale}X A STRIKE${uses(2)}`], demo: { els: [], cast: W.held ? 'channel' : 'special' } },
    G
      ? { slot: 'defend', keys: K(null, false, 'HOLD', 'RB', true), title: 'Defend', text: 'Hold to block; tap as a hit lands to parry. ' + G.defend, tags: [], look: G.el,
        scale: '', stats: [`PARRY WINDOW ${gName === 'mirror' ? ARMS.parryMirror : ARMS.parry}S`], demo: { els: [], cast: 'block' } }
      : { slot: 'defend', keys: K(null, false, '', 'RB', true), title: 'Defend', text: 'No guard. Queue Shield and an element, then Shift+LMB, to conjure one.', tags: [], look: null, scale: '', stats: [], demo: no, idle: true },
    G
      ? { slot: 'retreat', keys: K('L', true, '', 'LB+RT'), title: G.retreatName, text: G.retreat, tags: [], look: G.el,
        scale: '', stats: [`${G.dist}U`, `RECOVERY ${ARMS.retreatRecovery}S, FREE`], demo: { els: [], cast: 'retreat' } }
      : { slot: 'retreat', keys: K('L', true, '', 'LB+RT'), title: 'Hop back', text: 'A quick hop back. A guard gives you a better Retreat.', tags: [], look: null, scale: '', stats: ['FREE'], demo: { els: [], cast: 'retreat' } },
  ];
}

/** The whole panel for a queue, or for your hands when it is empty. */
export function helpModel(queue: readonly Element[], hands: HandsState): HelpModel {
  if (queue.length) {
    const rows = spellRows(queue);
    return { mode: 'spell', queue: [...queue], header: 'ONE SPELL PER GESTURE', rows, key: 'q:' + queue.join('+') };
  }
  const wk = ARMS_KEY(hands.weapon), gName = GUARD_NAME[hands.guard] ?? 'none';
  const weapon = hands.wand ? 'Sculpting wand' : (WEAPONS[wk] ?? WEAPONS.staff).name + (hands.weapon ? ` (${hands.uses})` : '');
  const holding = weapon + (hands.guard ? ' + ' + GUARDS[gName].name : '');
  return { mode: 'hands', queue: [], header: holding, rows: handsRows(hands), key: `h:${hands.weapon}:${hands.guard}:${hands.wand ? 1 : 0}` };
}
