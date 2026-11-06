/**
 * The help panel's data model (F2, help-panel.ts): what the queued runes will do, one row per cast
 * gesture, or with nothing queued, what your hands do with the weapon and guard you hold.
 *
 * Pure: the rules, the sim's compile() and its config numbers in, plain rows out. No DOM and no
 * Pixi, so it is tested in node (test/help-model.test.ts). The spell text is the rules' own
 * (tools/spell-atlas/rules-c.js), shortened to a line or two; the hands' moves are written here from
 * the sim's tables (hands.ts, guards.ts), because the rules don't describe them.
 */
import { rules, type Cast, type Element, type SpellDescriptor } from '@wizard-sim/rules';
import {
  ARMS, COMBAT, DAMAGE, GUARD_NAME, RHYTHM, SHAPES, STRUCT, SURFACE,
  compile, elementName, formCurve, type SpellSpec,
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

const ELS = rules.BASE as readonly Element[];
const EL_ID = (e: Element): number => ELS.indexOf(e) + 1;
const name = (e: Element): string => rules.ELEMENTS[e].name;
const n1 = (v: number): string => (Math.round(v * 10) / 10).toString();
const plural = (n: number, w: string): string => `${n} ${w}${n === 1 ? '' : 'S'}`;

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

/** How hard one hit of the spell lands, relative to the per-rune table (fireSpell's scales). */
const SHAPE_SCALE: Partial<Record<SpellSpec['shape'], number>> = { patch: 0.5, strike: 1.2, discharge: 0.8, palm: 1.2 };
const PER_SECOND = new Set<SpellSpec['shape']>(['beam', 'spray', 'arc']);

/** The numbers worth a glance: cost, damage (or healing) by element, reach, how long it lasts, hold. */
export function spellStats(queue: readonly Element[], cast: Cast, d: SpellDescriptor, spec: SpellSpec): string[] {
  const out: string[] = [];
  const kind = d.cost?.kind;
  out.push(plural(queue.length, 'RUNE') + (kind === 'bind' ? ', BINDS 1 SIGIL' : kind === 'stuff' ? ', STANDS' : ''));
  const n = spec.formN, sh = spec.shape;
  // damage or healing, for shapes that hit with the payload
  const hits = !['self', 'blink', 'ward', 'guard', 'wand', 'weapon', 'aura', 'double', 'motes', 'lens', 'turret', 'orbitals', 'glyph', 'lineglyph', 'arcwall', 'drawnwall', 'ring', 'todo'].includes(sh);
  if (hits) {
    const k = (SHAPE_SCALE[sh] ?? 1) * (PER_SECOND.has(sh) ? COMBAT.channelRate : 1), unit = PER_SECOND.has(sh) ? '/S' : '';
    if (spec.heal) out.push(`HEALS ${n1(COMBAT.healPerLife * spec.counts[EL_ID('life') - 1] * k)}${unit}`);
    else {
      const parts: string[] = [];
      for (const e of ELS) {
        const c = spec.counts[EL_ID(e) - 1];
        if (!c || !DAMAGE[e]) continue;
        const id = EL_ID(e), dmg = DAMAGE[e] * (id === spec.form && c > 1 ? formCurve(spec.form, c, COMBAT.sprayExp, COMBAT.rockExp, COMBAT.formScaling) : c) * k;
        parts.push(`${name(e).toUpperCase()} ${n1(dmg)}${unit}`);
      }
      if (parts.length) out.push(parts.join(' ') + (sh === 'missile' ? ' CHARGED' : ''));
    }
  }
  // reach
  const reach: Partial<Record<SpellSpec['shape'], string>> = {
    beam: `RANGE ${SHAPES.beamRange}U`, spray: `RANGE ${SHAPES.sprayRange}U`, arc: `RANGE ${SHAPES.arcRange}U`,
    nova: `RADIUS ${n1(SHAPES.novaRadius + SHAPES.novaPerRune * (n - 1))}U`, quake: `RADIUS ${n1(SHAPES.novaRadius + 1 + SHAPES.novaPerRune * (n - 1))}U`,
    discharge: `RADIUS ${4 + n}U`, patch: `RADIUS ${n1(SHAPES.patchRadius + 0.4 * (n - 1))}U`, blast: `RADIUS ${n1(2 + 0.4 * n)}U`,
    geyser: `RADIUS ${n1(0.9 + 0.4 * n)}U`, spring: `RADIUS ${n1(1.4 + 0.4 * n)}U`, strike: 'RADIUS 0.9U',
    imbue: `REACH ${n1(SHAPES.imbueRange + SHAPES.imbuePerRune * Math.max(0, spec.power - 1))}U`, blink: `UP TO ${STRUCT.blinkRange}U`,
    turret: `RANGE ${STRUCT.turretRange}U`, aura: `RADIUS ${STRUCT.auraRadius}U`,
  };
  if (reach[sh]) out.push(reach[sh]!);
  // how long it lasts
  const longer = 1 + SHAPES.lingerPerRune * (n - 1);
  if (sh === 'patch') {
    const water = spec.form === EL_ID('water');
    const life = spec.scald ? SHAPES.patchLife * longer : spec.freeze || spec.counts[EL_ID('cold') - 1] ? SURFACE.ice * longer : water ? SHAPES.rainLife + SHAPES.rainPerRune * (n - 1) : SURFACE.fire * longer;
    out.push(`LASTS ${n1(life)}S`);
  }
  if (sh === 'spring') out.push(`LASTS ${4 + 2 * n}S`);
  if (sh === 'blast' || sh === 'geyser') out.push(`FUSE ${SHAPES.delayedBlast}S`);
  if (spec.wall === 1 && (sh === 'arcwall' || sh === 'drawnwall' || sh === 'ring')) out.push(`STANDS ${STRUCT.rockLife + STRUCT.rockLifePerEarth * (spec.counts[EL_ID('earth') - 1] - 1)}S`);
  if (sh === 'aura') out.push(`LASTS ${STRUCT.auraTime}S`);
  if (sh === 'weapon') out.push(`${STRUCT.weaponUses} USES`);
  // hold
  if (spec.channel) out.push(`HOLD: CHANNEL, FREE ${RHYTHM.naturalChannel}S THEN ${RHYTHM.upkeep}/S`);
  if (spec.charge) out.push(`HOLD: CHARGE UP TO ${RHYTHM.chargeMax}S`);
  void cast;
  return out;
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
    return { slot: cast, keys, title: d.title, text: shortText(d), tags, stats: spellStats(queue, cast, d, spec), look, demo: dm };
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
      stats: [`HIT ${dmg}${els}`, `RECOVERY ${rec}S${uses(1)}`], demo: { els: [], cast: 'strike' } },
    { slot: 'heavy', keys: K('R', false, 'HOLD', 'RT HOLD'), title: 'Heavy', text: W.heavy, tags: [], look,
      stats: [`${ARMS.heavyScale}X A STRIKE`, `CHARGE UP TO ${RHYTHM.chargeMax}S${uses(2)}`], demo: { els: [], cast: 'heavy' } },
    { slot: 'special', keys: K('R', true, W.held ? 'HOLD' : '', W.held ? 'LT HOLD' : 'LT'), title: W.specialName, text: W.special, tags: [], look,
      stats: [W.held ? `HOLD${h.weapon ? ', 1 USE/S' : ''}` : `${ARMS.sweepScale}X A STRIKE${uses(2)}`], demo: { els: [], cast: W.held ? 'channel' : 'special' } },
    G
      ? { slot: 'defend', keys: K(null, false, 'HOLD', 'RB', true), title: 'Defend', text: 'Hold to block; tap as a hit lands to parry. ' + G.defend, tags: [], look: G.el,
        stats: [`PARRY WINDOW ${gName === 'mirror' ? ARMS.parryMirror : ARMS.parry}S`], demo: { els: [], cast: 'block' } }
      : { slot: 'defend', keys: K(null, false, '', 'RB', true), title: 'Defend', text: 'No guard. Queue Shield and an element, then Shift+LMB, to conjure one.', tags: [], look: null, stats: [], demo: no, idle: true },
    G
      ? { slot: 'retreat', keys: K('L', true, '', 'LB+RT'), title: G.retreatName, text: G.retreat, tags: [], look: G.el,
        stats: [`${G.dist}U`, `RECOVERY ${ARMS.retreatRecovery}S, FREE`], demo: { els: [], cast: 'retreat' } }
      : { slot: 'retreat', keys: K('L', true, '', 'LB+RT'), title: 'Hop back', text: 'A quick hop back. A guard gives you a better Retreat.', tags: [], look: null, stats: ['FREE'], demo: { els: [], cast: 'retreat' } },
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
