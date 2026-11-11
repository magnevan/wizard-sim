/**
 * Sound is built the way spells are. Each element is a layer of sound (what it is made of) and each
 * cast shape is an envelope and a structure (a beam sustains, a nova bursts, a missile whooshes and
 * lands). Compose the two and you have the spell, so nine layers and nine shapes cover every
 * combination without a recording each, and a partner's spell is readable by ear: the shape tells
 * you what they did, the timbre what they did it with. This file is pure data and maths.
 *
 * A Plan is what the engine plays: a list of clip layers with their timing. Clip ids starting `y-`
 * are code-made (synth.ts); the others are tuned samples (the bank: content/audio/bank.json).
 */
import { kitOf, kitPlan, type Kit } from './kits';
import { clamp, pick, runeMod, seeded, type Rand } from './variation';

export interface Layer {
  clip: string;
  /** Linear gain. */
  gain: number;
  /** Playback rate at the start, and at the end if it glides. */
  rate: number;
  rateTo?: number;
  /** Seconds after the sound's start. */
  at: number;
  /** Seconds to fade in. */
  attack: number;
  /** Seconds at full level after the attack; 0 lets a one-shot clip play out whole. */
  hold: number;
  /** Seconds to fade out after the hold. */
  release: number;
  /** Loop the clip (a sustained layer: it plays until the sound is stopped). */
  loop?: boolean;
  /** A lowpass on this layer, Hz, and where it goes over the sound's length. */
  lowpass?: number;
  lowpassTo?: number;
}

export interface Plan {
  name: string;
  layers: Layer[];
  /** Added to the room's usual reverb send. */
  wet: number;
}

export const ELEMENT_NAMES = ['water', 'life', 'shield', 'cold', 'lightning', 'arcane', 'sigil', 'fire', 'earth', 'ice'] as const;
export type ElementName = typeof ELEMENT_NAMES[number];

/** The sound of one element. */
export interface ElementVoice {
  /** What it's made of, sustained: looping material clips, with their gains. */
  body: readonly (readonly [string, number])[];
  /** Its attack: a transient that says what it is. */
  hit: readonly string[];
  /** The clips of its impact on something. */
  impact: readonly string[];
  /** Base playback rate and level, so each element sits in its own part of the spectrum. */
  rate: number;
  gain: number;
  /** The rune queue's blip, as a rate on y-blip: the elements make a scale, so a queue is a little tune. */
  blip: number;
}

export const ELEMENTS: Readonly<Record<ElementName, ElementVoice>> = {
  // the elements sit on a pentatonic scale from Earth up to Cold, so any queue sounds right together
  earth: { body: [['earth-rumble', 1]], hit: ['earth-hit-1', 'earth-hit-2', 'earth-hit-3', 'earth-hit-4'], impact: ['earth-hit-1', 'earth-hit-3', 'debris'], rate: 0.9, gain: 1, blip: 0.5 },
  fire: { body: [['fire-roar', 0.9], ['fire-crackle', 0.75]], hit: ['fire-burst-1', 'fire-burst-2', 'fire-burst-3'], impact: ['fire-burst-1', 'fire-burst-2'], rate: 1, gain: 0.95, blip: 0.5625 },
  water: { body: [['water-rush', 0.85], ['water-gurgle', 0.6]], hit: ['water-splash-1', 'water-splash-2', 'water-splash-3', 'water-splash-4'], impact: ['water-splash-1', 'water-splash-2', 'water-splash-3'], rate: 1, gain: 0.72, blip: 0.6667 },
  life: { body: [['y-life', 0.5], ['life-chime', 0.7]], hit: ['life-chime-1', 'life-chime-2', 'life-chime-3'], impact: ['life-chime-2', 'life-chime-3'], rate: 1, gain: 0.8, blip: 0.75 },
  shield: { body: [['y-shield', 0.55], ['shield-field', 0.5]], hit: ['shield-hit-1', 'shield-hit-2', 'shield-hit-3'], impact: ['shield-hit-1', 'shield-hit-2'], rate: 1, gain: 0.85, blip: 0.8333 },
  arcane: { body: [['y-arcane', 0.7]], hit: ['y-arcane-hit', 'arcane-bolt-1', 'arcane-bolt-2'], impact: ['y-arcane-hit', 'arcane-bolt-2'], rate: 1, gain: 0.9, blip: 1 },
  sigil: { body: [['y-shimmer', 0.32], ['y-arcane', 0.22]], hit: ['y-sigil', 'sigil-gong'], impact: ['y-sigil'], rate: 1.1, gain: 0.85, blip: 1.125 },
  lightning: { body: [['y-buzz', 0.95]], hit: ['y-zap-1', 'y-zap-2', 'y-zap-3'], impact: ['y-zap-2', 'thunder-crack'], rate: 1, gain: 1, blip: 1.3333 },
  cold: { body: [['y-shimmer', 0.42], ['ice-creak', 0.65]], hit: ['ice-hit-1', 'ice-hit-2', 'ice-hit-3'], impact: ['ice-hit-1', 'ice-hit-2', 'ice-hit-4'], rate: 1.05, gain: 1, blip: 1.5 },
  // Ice (Water + Cold in one rune): Cold's clips, heavier and glassier (more creak, a lower rate, debris on impact). A first pass: its own sound is open.
  ice: { body: [['ice-creak', 0.85], ['y-shimmer', 0.25]], hit: ['ice-hit-2', 'ice-hit-3', 'ice-hit-4'], impact: ['ice-hit-3', 'ice-hit-4', 'debris'], rate: 0.9, gain: 1, blip: 1.6667 },
};

/** The nine cast shapes the ear tells apart. Every sim Shape falls into one. */
export const SHAPE_NAMES = ['force', 'spray', 'beam', 'missile', 'nova', 'place', 'wall', 'conjure', 'self'] as const;
export type ShapeName = typeof SHAPE_NAMES[number];

const SHAPE_OF: Readonly<Record<string, ShapeName>> = {
  beam: 'beam', arc: 'beam', spray: 'spray', shards: 'spray', missile: 'missile',
  nova: 'nova', quake: 'nova', discharge: 'nova', ring: 'nova', motes: 'nova', orbitals: 'nova',
  patch: 'place', blast: 'place', geyser: 'place', strike: 'place', spring: 'place', glyph: 'place', lineglyph: 'place', lens: 'place', turret: 'place',
  wave: 'wall', arcwall: 'wall', drawnwall: 'wall',
  guard: 'conjure', weapon: 'conjure', wand: 'conjure', swing: 'force', palm: 'force', imbue: 'force', blink: 'force',
  self: 'self', ward: 'self', aura: 'self', double: 'self',
};
/** The sim's Shape name -> the shape the ear hears. */
export const shapeOf = (simShape: string): ShapeName => SHAPE_OF[simShape] ?? 'force';

/** Shapes that keep sounding after the cast, while the sim's channel lasts. */
export const SUSTAINS: ReadonlySet<ShapeName> = new Set(['spray', 'beam']);

interface ShapeEnvelope {
  /** When the element body comes in, and how it goes. */
  at: number; attack: number; hold: number; release: number;
  /** When the element's attack lands, and how loud. */
  hitAt: number; hit: number;
  /** How loud the body is. */
  body: number;
  /** The shape's own layers: the structure you hear whatever the element. */
  sig: readonly Omit<Layer, 'rate'>[];
  /** Extra reverb. */
  wet: number;
  /** How much of the sub thump it carries at full weight. */
  sub: number;
  /** The body's pitch glide (self: rising; nova: falling). */
  glide: number;
}

const L = (clip: string, gain: number, at = 0, attack = 0.003, hold = 0, release = 0.08): Omit<Layer, 'rate'> => ({ clip, gain, at, attack, hold, release });

const SHAPES: Readonly<Record<ShapeName, ShapeEnvelope>> = {
  // a shove: one quick punch of the element, gone at once
  force: { at: 0, attack: 0.008, hold: 0.09, release: 0.16, hitAt: 0, hit: 0.9, body: 0.7, sig: [L('y-whoosh-short', 0.5)], wet: 0, sub: 0.45, glide: 1 },
  // starts soft and fills out: the loop (composeSustain) takes over from here
  spray: { at: 0, attack: 0.05, hold: 0.16, release: 0.2, hitAt: 0, hit: 0.45, body: 0.8, sig: [L('y-whoosh-short', 0.3)], wet: 0, sub: 0.15, glide: 1 },
  // a hard strike-up, then the loop
  beam: { at: 0, attack: 0.02, hold: 0.2, release: 0.2, hitAt: 0, hit: 0.8, body: 0.7, sig: [L('y-rise', 0.3, 0, 0.003, 0.12, 0.05)], wet: 0.02, sub: 0.25, glide: 1 },
  // the launch is thin and airy; composeImpact is the other half of the sound
  missile: { at: 0, attack: 0.02, hold: 0.06, release: 0.2, hitAt: 0, hit: 0.5, body: 0.32, sig: [L('y-whoosh', 0.75)], wet: 0, sub: 0.3, glide: 0.92 },
  // everything at once, with a big falling tail
  nova: { at: 0, attack: 0.004, hold: 0.1, release: 0.75, hitAt: 0, hit: 1, body: 0.95, sig: [L('boom-1', 0.62), L('y-whoosh-short', 0.4, 0.01)], wet: 0.16, sub: 1, glide: 0.82 },
  // a rising breath, then it lands where you pointed and settles
  place: { at: 0.17, attack: 0.01, hold: 0.14, release: 0.5, hitAt: 0.17, hit: 0.9, body: 0.7, sig: [L('y-rise', 0.5, 0, 0.02, 0.15, 0.03)], wet: 0.05, sub: 0.55, glide: 1 },
  // grinds up out of the floor and thuds into place
  wall: { at: 0.05, attack: 0.05, hold: 0.2, release: 0.28, hitAt: 0.3, hit: 0.85, body: 0.4, sig: [L('y-grind', 0.8), L('earth-hit-2', 0.5, 0.3)], wet: 0.03, sub: 0.7, glide: 1 },
  // steel coming out of nowhere, and a glint of the element on it
  conjure: { at: 0.04, attack: 0.05, hold: 0.08, release: 0.32, hitAt: 0.09, hit: 0.5, body: 0.42, sig: [L('draw-1', 0.75), L('y-sigil', 0.28, 0.08)], wet: 0.03, sub: 0, glide: 1.05 },
  // drawn in toward you, rising, and held for a moment
  self: { at: 0, attack: 0.22, hold: 0.04, release: 0.34, hitAt: 0.24, hit: 0.5, body: 0.6, sig: [L('y-suck', 0.62)], wet: 0.04, sub: 0.1, glide: 1.3 },
};

/** What a spell is, to the ear. */
export interface SpellSound {
  /** Runes of each element in the spell, by name. */
  els: Partial<Record<ElementName, number>>;
  shape: ShapeName;
  /** The element that leads (the spell's look). */
  lead?: ElementName;
  /** The sim's own shape, finer than `shape`: a kit can give it a sound of its own. */
  form?: string;
}

export const runesOf = (els: SpellSound['els']): number => Object.values(els).reduce((a, b) => a + (b ?? 0), 0);

/** At most three elements, lead first then most runes, each with how loud it is in the mix. */
function mixOf(s: SpellSound): { el: ElementName; g: number }[] {
  const names = (Object.keys(s.els) as ElementName[]).filter((e) => (s.els[e] ?? 0) > 0);
  const lead = s.lead && names.includes(s.lead) ? s.lead : names.slice().sort((a, b) => (s.els[b] ?? 0) - (s.els[a] ?? 0))[0];
  if (!lead) return [];
  const rest = names.filter((e) => e !== lead).sort((a, b) => (s.els[b] ?? 0) - (s.els[a] ?? 0)).slice(0, 2);
  const top = s.els[lead] ?? 1;
  return [{ el: lead, g: 1 }, ...rest.map((el) => ({ el, g: 0.62 * Math.sqrt((s.els[el] ?? 1) / top) }))];
}

/** The kit of the element leading a spell, if it has one. */
const kitFor = (s: SpellSound): Kit | undefined => kitOf(mixOf(s)[0]?.el);

/** A spell's cast: the shape's structure with its elements poured in, or its element's kit if it has one for this shape. */
export function composeSpell(s: SpellSound, rand: Rand = Math.random): Plan {
  const sh = SHAPES[s.shape], m = runeMod(runesOf(s.els)), mix = mixOf(s), layers: Layer[] = [], kit = kitFor(s);
  // any element in the spell can own it: a Sigil aura may look like its water, and it's still Sigil's aura
  const els = Object.keys(s.els) as ElementName[], own = s.form ? els.flatMap((k) => { const sp = kitOf(k)?.spells; return sp ? [...els.map((e) => sp[`${s.form}+${e}`]), sp[s.form!]] : []; }).find(Boolean) : null;
  if (own) return kitPlan(`kit:${s.shape}`, own, rand, m.rate, m.gain, sh.wet + m.wet); // an empty one means silence
  const ls = !kit ? null : s.shape === 'spray' ? kit.start : s.shape === 'beam' ? kit.beamStart ?? kit.start : s.shape === 'missile' ? kit.launch : s.shape === 'nova' ? kit.burst
    : s.shape === 'force' ? kit.force : s.shape === 'place' ? kit.place : s.shape === 'wall' ? kit.wall : s.shape === 'self' ? kit.self ?? kit.land : null;
  if (ls?.length) return kitPlan(`kit:${s.shape}`, ls, rand, m.rate, m.gain, sh.wet + m.wet);
  const baseRate = m.rate;
  for (const g of sh.sig) layers.push({ ...g, gain: g.gain * m.gain, rate: baseRate, hold: g.hold ? g.hold * m.length : 0, release: g.release * m.length });
  mix.forEach(({ el, g }, i) => {
    const v = ELEMENTS[el], rate = baseRate * v.rate;
    // the lead's attack carries the shape's punch; the rest come in just behind it, so the attack stays clean
    layers.push({ clip: pick(v.hit, rand), gain: sh.hit * g * m.gain * v.gain, rate, at: sh.hitAt + i * 0.012, attack: 0.002, hold: 0, release: 0.08 });
    for (const [clip, cg] of v.body) {
      layers.push({
        clip, gain: sh.body * g * cg * m.gain * v.gain, rate, rateTo: rate * sh.glide, at: sh.at, attack: sh.attack, hold: sh.hold * m.length, release: sh.release * m.length, loop: true,
        lowpass: s.shape === 'nova' ? 9000 : undefined, lowpassTo: s.shape === 'nova' ? 900 : undefined,
      });
    }
  });
  if (m.weight > 0 && sh.sub > 0) layers.push({ clip: 'y-sub', gain: sh.sub * m.weight * 0.9, rate: 1, at: sh.hitAt, attack: 0.002, hold: 0, release: 0.1 });
  return { name: `${s.shape}:${mix.map((x) => x.el).join('+')}:${runesOf(s.els)}`, layers, wet: sh.wet + m.wet };
}

/** What a beam or spray sounds like while it's held: looping layers, played until stopped. */
export function composeSustain(s: SpellSound, rand: Rand = Math.random): Plan {
  const m = runeMod(runesOf(s.els)), mix = mixOf(s), layers: Layer[] = [], kit = kitFor(s);
  const held = s.shape === 'beam' ? kit?.beam ?? kit?.hold : kit?.hold ?? kit?.beam;
  if (held) return kitPlan(`kit:hold:${s.shape}`, held, rand, m.rate, m.gain, m.wet);
  for (const { el, g } of mix) {
    const v = ELEMENTS[el];
    for (const [clip, cg] of v.body) layers.push({ clip, gain: 0.72 * g * cg * m.gain * v.gain, rate: m.rate * v.rate, at: 0, attack: 0.06, hold: 0, release: 0.1, loop: true });
  }
  layers.push(s.shape === 'beam'
    ? { clip: 'y-buzz', gain: 0.1, rate: 0.5 * m.rate, at: 0, attack: 0.06, hold: 0, release: 0.1, loop: true } // a beam has a thin line of tone in it
    : { clip: 'y-flow', gain: 0.32 * m.gain, rate: m.rate, at: 0, attack: 0.06, hold: 0, release: 0.1, loop: true });
  return { name: `hold:${s.shape}:${mix.map((x) => x.el).join('+')}`, layers, wet: m.wet };
}

/** A held spell's last breath as it's let go. Only a kit has one: without it, the sound just fades. */
export function composeStop(s: SpellSound, rand: Rand = Math.random): Plan | null {
  const kit = kitFor(s), m = runeMod(runesOf(s.els));
  return kit?.stop?.length ? kitPlan('kit:stop', kit.stop, rand, m.rate, m.gain, m.wet) : null;
}

/** Charging a held spell: a rising tone in its element, `k` from 0 to 1. */
export function composeCharge(lead: ElementName): Plan {
  const kit = kitOf(lead);
  if (kit?.charge) return kitPlan('kit:charge', kit.charge, Math.random);
  const [clip, g] = ELEMENTS[lead].body[0];
  return { name: `charge:${lead}`, layers: [{ clip, gain: 0.55 * g, rate: 0.8, rateTo: 1.5, at: 0, attack: 0.15, hold: 0, release: 0.1, loop: true }], wet: 0 };
}

/** One element on its own: the bare layer, for the gallery. */
export function composeElement(el: ElementName, rand: Rand = seeded(3)): Plan {
  const v = ELEMENTS[el], layers: Layer[] = [{ clip: pick(v.hit, rand), gain: 0.85 * v.gain, rate: v.rate, at: 0, attack: 0.002, hold: 0, release: 0.08 }];
  for (const [clip, cg] of v.body) layers.push({ clip, gain: cg * 0.8 * v.gain, rate: v.rate, at: 0.05, attack: 0.1, hold: 1.1, release: 0.5, loop: true });
  return { name: `element:${el}`, layers, wet: 0 };
}

/** One shape on its own: only its structure, with no element poured in, for the gallery. */
export function composeShape(shape: ShapeName): Plan {
  const sh = SHAPES[shape], layers: Layer[] = sh.sig.map((g) => ({ ...g, rate: 1 }));
  if (sh.sub > 0) layers.push({ clip: 'y-sub', gain: sh.sub * 0.6, rate: 1, at: sh.hitAt, attack: 0.002, hold: 0, release: 0.1 });
  if (SUSTAINS.has(shape)) layers.push({ clip: shape === 'beam' ? 'y-buzz' : 'y-flow', gain: 0.35, rate: 1, at: 0.08, attack: 0.08, hold: 0.9, release: 0.25, loop: true });
  return { name: `shape:${shape}`, layers, wet: sh.wet };
}

/** An element landing: a missile's second half, a hit, a burst somewhere. `size` 0.3 is a tap, 1 a full blow, 2 a boulder. */
export function composeImpact(el: ElementName, size = 1, rand: Rand = Math.random): Plan {
  const v = ELEMENTS[el], k = clamp(size, 0.2, 2.2), rate = v.rate * (1.2 - 0.25 * Math.min(k, 1.6)), kit = kitOf(el);
  const landing = k >= 1.4 ? kit?.burst ?? kit?.land : kit?.land;
  if (landing) return kitPlan('kit:land', landing, rand, 1, Math.min(1, 0.45 + 0.45 * k), 0.02 * k);
  const layers: Layer[] = [{ clip: pick(v.impact, rand), gain: v.gain * Math.min(1, 0.45 + 0.45 * k), rate, at: 0, attack: 0.002, hold: 0, release: 0.08 }];
  if (k >= 0.9) layers.push({ clip: 'y-sub', gain: 0.5 * Math.min(1, k - 0.3), rate: 1, at: 0, attack: 0.002, hold: 0, release: 0.08 });
  if (k >= 1.4) layers.push({ clip: pick(['boom-1', 'boom-2', 'boom-3'], rand), gain: 0.5, rate, at: 0, attack: 0.002, hold: 0, release: 0.1 });
  return { name: `impact:${el}`, layers, wet: 0.02 * k };
}

const one = (name: string, clip: string, gain = 1, rate = 1, wet = 0): Plan => ({ name, layers: [{ clip, gain, rate, at: 0, attack: 0.002, hold: 0, release: 0.06 }], wet });
const many = (name: string, wet: number, ...ls: [string, number, number?, number?][]): Plan => ({ name, wet, layers: ls.map(([clip, gain, rate, at]) => ({ clip, gain, rate: rate ?? 1, at: at ?? 0, attack: 0.002, hold: 0, release: 0.06 })) });

export const INTERACTIONS = ['cancel', 'douse', 'steam', 'freeze', 'shatter'] as const;
export type Interaction = typeof INTERACTIONS[number];

/** Elements meeting: what happens when they touch. */
export function composeInteraction(kind: Interaction, rand: Rand = Math.random): Plan {
  switch (kind) {
    case 'cancel': return many('cancel', 0, ['y-cancel', 0.7], ['y-hiss', 0.22, 1.5]);
    case 'douse': return many('douse', 0.03, ['y-hiss', 0.75], [pick(['water-splash-2', 'water-splash-3'], rand), 0.5, 1.2]);
    case 'steam': return many('steam', 0.05, ['y-hiss', 0.9, 0.8], ['water-gurgle', 0.3, 1.3]);
    case 'freeze': return many('freeze', 0.04, [pick(['ice-hit-1', 'ice-hit-3'], rand), 0.8, 0.8], ['y-shimmer', 0.2, 1, 0.02]);
    case 'shatter': return many('shatter', 0.06, [pick(['ice-hit-2', 'ice-hit-3', 'ice-hit-4'], rand), 1, 0.85], ['y-sub', 0.55], ['ice-hit-1', 0.6, 1.3, 0.04]);
  }
}

export const DEATH_KINDS = ['small', 'big', 'wizard'] as const;

/** A body's blow: flesh, and the element on it if there is one. */
export function composeHit(el: ElementName | null, amount: number, rand: Rand = Math.random, punched = true): Plan {
  const big = amount >= 12;
  const punch = pick(big ? ['punch-heavy-1', 'punch-heavy-2', 'punch-heavy-3'] : ['punch-1', 'punch-2', 'punch-3'], rand);
  const layers: Layer[] = punched ? [{ clip: punch, gain: big ? 0.8 : 0.55, rate: 1, at: 0, attack: 0.002, hold: 0, release: 0.05 }] : [];
  if (el) {
    const v = ELEMENTS[el], kit = kitOf(el);
    if (kit?.land) layers.push(...kitPlan('', kit.land, rand, 1, 0.42).layers);
    else layers.push({ clip: pick(v.impact, rand), gain: 0.42 * v.gain, rate: v.rate * 1.15, at: 0, attack: 0.002, hold: 0, release: 0.05 });
  }
  return { name: `hit:${el ?? 'plain'}`, layers, wet: 0 };
}

export const composeHeal = (rand: Rand = Math.random): Plan => one('heal', pick(ELEMENTS.life.hit, rand), 0.42, 1.25, 0.04);

export function composeDeath(kind: typeof DEATH_KINDS[number], el: ElementName | null, rand: Rand = Math.random): Plan {
  const growl = pick(kind === 'big' ? ['growl-big-1', 'growl-big-2'] : ['growl-1', 'growl-2', 'growl-3', 'growl-4'], rand);
  const layers: Layer[] = [{ clip: growl, gain: 0.7, rate: kind === 'big' ? 0.8 : 1.35, rateTo: kind === 'big' ? 0.55 : 0.9, at: 0, attack: 0.004, hold: 0, release: 0.1 }];
  layers.push({ clip: kind === 'big' ? 'boom-2' : 'punch-heavy-2', gain: kind === 'big' ? 0.5 : 0.5, rate: 1, at: 0.02, attack: 0.002, hold: 0, release: 0.08 });
  if (el) layers.push({ clip: pick(ELEMENTS[el].impact, rand), gain: 0.5, rate: ELEMENTS[el].rate, at: 0, attack: 0.002, hold: 0, release: 0.06 });
  return { name: `death:${kind}`, layers, wet: 0.04 };
}

export const composeDowned = (): Plan => many('downed', 0.1, ['y-lose', 0.5, 1.5], ['punch-heavy-1', 0.7]);

export const composeFootstep = (rand: Rand = Math.random, heavy = false): Plan => {
  const clip = pick(['foot-1', 'foot-2', 'foot-3', 'foot-4', 'foot-5'], rand);
  return one('foot', clip, heavy ? 0.7 : 0.42, heavy ? 0.6 : 1, 0);
};

export const ENEMY_KINDS = ['swarmer', 'brute', 'shieldbearer', 'caster', 'grabber', 'imp'] as const;
export type EnemyKind = typeof ENEMY_KINDS[number];

/** An enemy's telegraph: heard as the wind-up begins. */
export function composeTelegraph(kind: EnemyKind, rand: Rand = Math.random): Plan {
  const g = pick(['growl-1', 'growl-2', 'growl-3', 'growl-4'], rand);
  switch (kind) {
    case 'swarmer': return one('tell:swarmer', g, 0.3, 1.5);
    case 'brute': return many('tell:brute', 0.03, [pick(['growl-big-1', 'growl-big-2'], rand), 0.8, 0.8], ['y-rise', 0.18, 0.5]);
    case 'shieldbearer': return many('tell:shield', 0, [g, 0.32, 0.95], ['shield-hit-3', 0.2, 0.8]);
    case 'caster': return many('tell:archer', 0, ['y-whoosh-short', 0.1, 0.5], ['y-string', 0.14, 0.7]);
    case 'grabber': return one('tell:grabber', g, 0.45, 1.15);
    case 'imp': return many('tell:imp', 0, [g, 0.26, 1.9], ['fire-burst-3', 0.18, 1.5]);
  }
}

/** An enemy's blow leaving it: the strike or release. What it hits has its own sound. */
export function composeStrike(kind: EnemyKind, rand: Rand = Math.random): Plan {
  switch (kind) {
    case 'swarmer': return many('strike:swarmer', 0, ['y-whoosh-short', 0.42, 1.25], [pick(['chop-1', 'cloth-1'], rand), 0.4, 1.1]);
    case 'brute': return many('strike:brute', 0.05, ['y-whoosh', 0.5, 0.75], ['y-sub', 0.5]);
    case 'shieldbearer': return many('strike:shield', 0.02, ['shield-hit-2', 0.65, 0.8], ['punch-heavy-3', 0.45]);
    case 'caster': return many('strike:archer', 0, ['y-string', 0.65], ['y-whoosh-short', 0.3, 1.5]);
    case 'grabber': return many('strike:grabber', 0, ['y-whoosh', 0.55, 1.1], ['cloth-2', 0.4]);
    case 'imp': return many('strike:imp', 0, ['fire-burst-2', 0.6, 1.3], ['y-whoosh-short', 0.3, 1.4]);
  }
}

export const WEAPON_MOVES = ['strike', 'sweep', 'heavy', 'block', 'parry', 'retreat', 'dash'] as const;
export type WeaponMove = typeof WEAPON_MOVES[number];

/** A weapon move in the hands, tinted by what the weapon is made of. */
export function composeMove(move: WeaponMove, el: ElementName | null, rand: Rand = Math.random): Plan {
  const tint = el ? [[pick(ELEMENTS[el].hit, rand), 0.3 * ELEMENTS[el].gain, ELEMENTS[el].rate * 1.1] as [string, number, number]] : [];
  switch (move) {
    case 'strike': return many('move:strike', 0, ['y-whoosh-short', 0.52, 1.15], [pick(['cloth-1', 'cloth-2', 'cloth-3'], rand), 0.3], ...tint);
    case 'sweep': return many('move:sweep', 0, ['y-whoosh', 0.45, 1.3], ['slice-1', 0.42], ...tint);
    case 'heavy': return many('move:heavy', 0.02, ['y-whoosh', 0.62, 0.9], ['chop-1', 0.55, 0.85, 0.03], ['y-sub', 0.42], ...tint);
    case 'block': return many('move:block', 0, ['shield-hit-3', 0.5, 0.9], ['punch-1', 0.4]);
    case 'parry': return many('move:parry', 0.1, ['shield-hit-1', 0.85, 1.25], ['y-sigil', 0.4, 1.4]);
    case 'retreat': return many('move:retreat', 0, ['y-whoosh-short', 0.45, 0.95], ['cloth-3', 0.3], ...tint);
    case 'dash': return many('move:dash', 0, ['y-whoosh', 0.55, 1.2], ...tint);
  }
}

/** What an aura with this element in it sounds like while it lasts, if Sigil's kit has that. */
export function composeAuraLoop(el: ElementName, rand: Rand = Math.random): Plan | null {
  const l = kitOf('sigil')?.spells?.[`hold:aura+${el}`];
  return l?.length ? kitPlan(`kit:aura:${el}`, l, rand) : null;
}

/** A device taken back, if its element's kit has a sound for that. */
export function composeDismiss(el: ElementName, rand: Rand = Math.random): Plan | null {
  const d = kitOf(el)?.dismiss;
  return d ? kitPlan('kit:dismiss', d, rand) : null; // an empty one means silence
}
export const composeBlink = (): Plan => one('blink', 'y-blink', 0.7, 1, 0.05);
export const composeRockBreak = (rand: Rand = Math.random): Plan => many('wall:break', 0.04, [pick(['earth-hit-3', 'earth-hit-4'], rand), 0.8, 0.8], ['debris', 0.7], ['y-sub', 0.4]);
export const composeBlocked = (rand: Rand = Math.random): Plan => one('blocked', pick(['shield-hit-2', 'shield-hit-3'], rand), 0.5, 1.1);

export const UI_SOUNDS = ['move', 'select', 'open', 'close', 'adjust', 'error'] as const;
export type UiSound = typeof UI_SOUNDS[number];

export function composeUi(kind: UiSound): Plan {
  switch (kind) {
    case 'move': return one('ui:move', 'y-tick', 0.5);
    case 'select': return one('ui:select', 'ui-confirm', 0.42);
    case 'open': return one('ui:open', 'ui-open', 0.45);
    case 'close': return one('ui:close', 'ui-close', 0.45);
    case 'adjust': return one('ui:adjust', 'ui-tick', 0.6);
    case 'error': return one('ui:error', 'ui-error', 0.42);
  }
}

/** A rune going into the queue: `n` runes in it, so the blips climb. */
export function composeQueue(el: ElementName, n: number): Plan {
  const tick = kitOf('sigil')?.spells?.queue;
  if (tick?.length) return kitPlan(`queue:${el}`, tick, Math.random, ELEMENTS[el].blip);
  return { name: `queue:${el}`, wet: 0, layers: [{ clip: 'y-blip', gain: 0.34, rate: ELEMENTS[el].blip * Math.pow(1.06, Math.max(0, n - 1)), at: 0, attack: 0.002, hold: 0, release: 0.03 }] };
}
export const composeDry = (): Plan => one('dry', 'y-dry', 0.5);

/** The director reads a text event's banner into one of these. */
export const composeStinger = (kind: 'wave' | 'clear' | 'lose'): Plan => one(`stinger:${kind}`, `y-${kind}`, 0.5, 1, 0.1);

export const composeRain = (): Plan => ({ name: 'zone:rain', wet: 0, layers: [
  { clip: 'water-rush', gain: 0.5, rate: 1.4, at: 0, attack: 0.2, hold: 0, release: 0.3, loop: true },
  { clip: 'y-flow', gain: 0.2, rate: 2, at: 0, attack: 0.2, hold: 0, release: 0.3, loop: true },
] });
export const composeSteamCloud = (): Plan => ({ name: 'zone:steam', wet: 0, layers: [{ clip: 'y-steam', gain: 0.36, rate: 1, at: 0, attack: 0.2, hold: 0, release: 0.3, loop: true }] });
export const composeSpring = (): Plan => ({ name: 'zone:spring', wet: 0, layers: [{ clip: 'water-gurgle', gain: 0.32, rate: 1.1, at: 0, attack: 0.2, hold: 0, release: 0.3, loop: true }, { clip: 'y-life', gain: 0.16, rate: 1, at: 0, attack: 0.2, hold: 0, release: 0.3, loop: true }] });
export const composeSparkField = (): Plan => ({ name: 'zone:spark', wet: 0, layers: [{ clip: 'y-buzz', gain: 0.4, rate: 1.2, at: 0, attack: 0.1, hold: 0, release: 0.2, loop: true }] });
export const composeBurning = (): Plan => { const k = kitOf('fire')?.status; return k ? kitPlan('kit:burn', k, Math.random) : burningPlan(); };
const burningPlan = (): Plan => ({ name: 'burn', wet: 0, layers: [{ clip: 'fire-crackle', gain: 0.5, rate: 1.1, at: 0, attack: 0.15, hold: 0, release: 0.25, loop: true }] });
export const composeFloorFire = (): Plan => { const k = kitOf('fire')?.ground; return k ? kitPlan('kit:ground', k, Math.random) : floorFirePlan(); };
const floorFirePlan = (): Plan => ({ name: 'floorfire', wet: 0, layers: [{ clip: 'fire-crackle', gain: 0.42, rate: 0.9, at: 0, attack: 0.2, hold: 0, release: 0.3, loop: true }, { clip: 'fire-roar', gain: 0.2, rate: 0.7, at: 0, attack: 0.2, hold: 0, release: 0.3, loop: true }] });
export function composeFlight(el: ElementName): Plan {
  const kit = kitOf(el);
  if (kit?.flight) return kitPlan('kit:flight', kit.flight, Math.random);
  const v = ELEMENTS[el], [clip, g] = v.body[0];
  return { name: `flight:${el}`, wet: 0, layers: [{ clip, gain: 0.3 * g * v.gain, rate: 1.2 * v.rate, at: 0, attack: 0.05, hold: 0, release: 0.1, loop: true }] };
}

/** Every clip a plan can name, so the tests can hold the bank to it. */
export function clipsOf(p: Plan): string[] { return p.layers.map((l) => l.clip); }
