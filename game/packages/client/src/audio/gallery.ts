/**
 * The Sound Gallery's engine room: the game's own engine and recipes, wrapped for a page with play
 * buttons. scripts/sound-gallery.mjs bundles this to tools/sound-gallery/engine.js as window.SoundLab,
 * so a recipe sounds the same on the page and in the game. render() runs the same graph through an
 * OfflineAudioContext, which is how scripts/sound-check.mjs measures sounds nobody here can hear.
 */
import { compile } from '@wizard-sim/sim';
import { rules, type Cast, type Element } from '@wizard-sim/rules';
import { BANK } from './bank.gen';
import { AudioEngine } from './engine';
import { spellSoundOf } from './director';
import {
  ELEMENTS, ELEMENT_NAMES, ENEMY_KINDS, SHAPE_NAMES, SUSTAINS, composeBlink, composeBurning, composeDeath, composeDowned, composeDry, composeElement, composeFloorFire,
  composeFootstep, composeHeal, composeHit, composeImpact, composeInteraction, composeMove, composeQueue, composeRain, composeRockBreak, composeShape, composeSparkField, composeSpell,
  composeSpring, composeSteamCloud, composeStinger, composeStrike, composeSustain, composeTelegraph, composeUi, runesOf, type ElementName, type Plan,
} from './recipes';
import { CENTRE, ENVS, Limiter, jitter, occlusion, seeded, type EnvName, type Place, type Rand } from './variation';

export interface Step { plan: Plan; at: number; place?: Partial<Place>; gain?: number }

export interface Item {
  id: string; group: string; title: string; blurb: string;
  env?: EnvName;
  steps: (r: Rand) => Step[];
}

/** A sustained plan with an end: for playing a loop as a one-shot. */
function held(p: Plan, secs: number): Plan {
  return { ...p, layers: p.layers.map((l) => (l.loop ? { ...l, hold: secs, release: 0.25 } : l)) };
}
const once = (plan: Plan, at = 0): Step => ({ plan, at });

/** A spell as the game makes it: the rules pick its shape, the recipes make its sound. */
export function mix(queue: readonly ElementName[], cast: Cast, r: Rand = seeded(5)): { title: string; shape: string; steps: Step[] } {
  const spec = compile(queue as Element[], cast), s = spellSoundOf(spec), steps = [once(composeSpell(s, r))];
  if (SUSTAINS.has(s.shape)) steps.push(once(held(composeSustain(s), 1.5), 0.14));
  if (s.shape === 'missile') steps.push(once(composeImpact(s.lead ?? 'arcane', 0.6 + runesOf(s.els) * 0.28, r), 0.56));
  return { title: spec.title, shape: s.shape, steps };
}

/** Adds a rune as the game does: opposites cancel, Water and Cold make Ice. */
export function addRune(queue: readonly ElementName[], el: ElementName): { queue: ElementName[]; cancelled: string | null; full: boolean } {
  const { queue: q, event, kind } = rules.addElement(queue as Element[], el);
  const out = q as ElementName[];
  return { queue: out, cancelled: kind === 'cancel' ? event : null, full: kind === 'full' };
}

const EL_BLURB: Record<ElementName, string> = {
  water: 'Rushing water with a gurgle under it; splashes for the attack.',
  life: 'A warm open chord and wind chimes.',
  shield: 'A low humming field; struck bells and plate for the attack.',
  cold: 'Frost shimmer and creaking ice; breaking glass for the attack.',
  lightning: 'A hard electric buzz and crackling zaps.',
  arcane: 'Detuned, slowly turning saws; a falling, ringing bolt for the attack.',
  sigil: 'A glassy rune tone and gong over thin shimmer.',
  fire: 'A jet roar and crackling flame.',
  earth: 'Tumbling gravel; a pick striking rock for the attack.',
  ice: 'Water and Cold in one rune: heavier creaking ice, lower than Cold; shattering glass and debris for the attack.',
};
const SHAPE_BLURB: Record<typeof SHAPE_NAMES[number], string> = {
  force: 'One quick shove: a short whoosh, gone at once.',
  spray: 'Soft start, then a rush of air that keeps going while you hold.',
  beam: 'A hard strike-up, then a steady line of tone while you hold.',
  missile: 'Thin at launch and airy in flight. The landing is the element.',
  nova: 'Everything at once, with a thump and a long falling tail.',
  place: 'A rising breath, then it lands over there and settles.',
  wall: 'Grinds up out of the floor and thuds into place.',
  conjure: 'A blade drawn from nowhere, with a glint.',
  self: 'Drawn in toward you, rising, then held for a moment.',
};
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const ENEMY_TITLE: Record<typeof ENEMY_KINDS[number], string> = { swarmer: 'Goblin', brute: 'Brute', shieldbearer: 'Shieldbearer', caster: 'Archer', grabber: 'Grabber', imp: 'Imp' };

/** The test spell of the variation demos: the same cast every time, so only the variation changes. */
const demo = (queue: ElementName[], cast: Cast = 'area') => (r: Rand) => mix(queue, cast, r).steps;
const SEED_SPELL: ElementName[] = ['earth', 'fire', 'fire'];

/** Thirty hits in a second, put through the game's limiter. */
function crowd(r: Rand): Step[] {
  const l = new Limiter(), rule = { gap: 0.05, max: 5 }, steps: Step[] = [];
  for (let i = 0; i < 100; i++) {
    const at = (i / 100) * 1.6;
    l.frame();
    const g = l.admit('hit', rule, at, 0.2);
    if (!g) continue;
    const j = jitter(r), plan = composeHit(i % 3 ? 'fire' : null, 6, r);
    for (const y of plan.layers) y.rate *= j.rate;
    steps.push({ plan, at, gain: g * j.gain, place: { pan: Math.sin(i * 1.7) * 0.6 } });
  }
  return steps;
}

export const ITEMS: readonly Item[] = [
  ...ELEMENT_NAMES.map((el): Item => ({ id: `el-${el}`, group: 'elements', title: cap(el), blurb: EL_BLURB[el], steps: (r) => [once(composeElement(el, r))] })),
  ...SHAPE_NAMES.map((sh): Item => ({ id: `shape-${sh}`, group: 'shapes', title: cap(sh), blurb: SHAPE_BLURB[sh], steps: () => [once(composeShape(sh))] })),

  { id: 'spell-fireball', group: 'spells', title: 'Fireball', blurb: 'Earth, Fire, Force: a missile that lands in Fire.', steps: demo(['earth', 'fire'], 'force') },
  { id: 'spell-flame', group: 'spells', title: 'Flame spray', blurb: 'Fire, Fire, Force.', steps: demo(['fire', 'fire'], 'force') },
  { id: 'spell-frost', group: 'spells', title: 'Ice shards', blurb: 'Water, Cold (they make Ice), Force.', steps: demo(['ice'], 'force') },
  { id: 'spell-beam', group: 'spells', title: 'Arcane beam', blurb: 'Arcane, Arcane, Force.', steps: demo(['arcane', 'arcane'], 'force') },
  { id: 'spell-arc', group: 'spells', title: 'Lightning arc', blurb: 'Lightning, Force. It shares the beam\'s structure.', steps: demo(['lightning'], 'force') },
  { id: 'spell-quake', group: 'spells', title: 'Quake', blurb: 'Earth, Earth, Earth, Area.', steps: demo(['earth', 'earth', 'earth']) },
  { id: 'spell-wall', group: 'spells', title: 'Rock wall', blurb: 'Shield, Earth, Place.', steps: demo(['shield', 'earth'], 'place') },
  { id: 'spell-ward', group: 'spells', title: 'Ward', blurb: 'Shield on yourself.', steps: demo(['shield'], 'self') },
  { id: 'spell-heal', group: 'spells', title: 'Heal', blurb: 'Life on yourself.', steps: demo(['life', 'life'], 'self') },

  { id: 'mix-cancel', group: 'interactions', title: 'Cancel', blurb: 'Opposite runes annihilate in the queue.', steps: (r) => [once(composeInteraction('cancel', r))] },
  { id: 'mix-douse', group: 'interactions', title: 'Douse', blurb: 'Water on something burning.', steps: (r) => [once(composeInteraction('douse', r))] },
  { id: 'mix-steam', group: 'interactions', title: 'Steam', blurb: 'Fire and water making steam.', steps: (r) => [once(composeInteraction('steam', r))] },
  { id: 'mix-freeze', group: 'interactions', title: 'Freeze', blurb: 'A body locking solid.', steps: (r) => [once(composeInteraction('freeze', r))] },
  { id: 'mix-shatter', group: 'interactions', title: 'Shatter', blurb: 'A frozen body smashed.', steps: (r) => [once(composeInteraction('shatter', r))] },

  { id: 'var-runes-1', group: 'var-runes', title: '1 rune', blurb: 'Fire, Area.', steps: demo(['fire']) },
  { id: 'var-runes-3', group: 'var-runes', title: '3 runes', blurb: 'The same, three times over.', steps: demo(['fire', 'fire', 'fire']) },
  { id: 'var-runes-5', group: 'var-runes', title: '5 runes', blurb: 'All five: lower, longer, heavier.', steps: demo(['fire', 'fire', 'fire', 'fire', 'fire']) },
  { id: 'var-env-hall', group: 'var-env', title: 'Hall', blurb: 'The Sanctum, and any room not given a profile.', env: 'hall', steps: demo(SEED_SPELL) },
  { id: 'var-env-cave', group: 'var-env', title: 'Cave', blurb: 'The tutorial\'s chamber.', env: 'cave', steps: demo(SEED_SPELL) },
  { id: 'var-env-outdoor', group: 'var-env', title: 'Outdoor', blurb: 'The Arena and Survive.', env: 'outdoor', steps: demo(SEED_SPELL) },
  { id: 'var-wall-open', group: 'var-wall', title: 'In the open', blurb: 'Nothing between you.', steps: demo(SEED_SPELL) },
  { id: 'var-wall-one', group: 'var-wall', title: 'Behind a wall', blurb: 'One rock wall on the line to your wizard.', steps: (r) => demo(SEED_SPELL)(r).map((s) => ({ ...s, place: occlusion(1) })) },
  { id: 'var-wall-two', group: 'var-wall', title: 'Behind two', blurb: 'Two walls: duller and further off.', steps: (r) => demo(SEED_SPELL)(r).map((s) => ({ ...s, place: occlusion(2) })) },
  { id: 'var-crowd', group: 'var-crowd', title: 'A hundred hits', blurb: 'A hundred hits in 1.6 seconds through the game\'s limiter.', steps: crowd },

  { id: 'hit-light', group: 'bodies', title: 'Light hit', blurb: 'A plain blow.', steps: (r) => [once(composeHit(null, 4, r))] },
  { id: 'hit-heavy', group: 'bodies', title: 'Heavy hit', blurb: 'A big blow.', steps: (r) => [once(composeHit(null, 20, r))] },
  { id: 'hit-fire', group: 'bodies', title: 'Burning hit', blurb: 'A blow with Fire on it.', steps: (r) => [once(composeHit('fire', 10, r))] },
  { id: 'heal', group: 'bodies', title: 'Healed', blurb: 'A touch of Life landing.', steps: (r) => [once(composeHeal(r))] },
  { id: 'death-small', group: 'bodies', title: 'Goblin death', blurb: 'A small enemy, killed by Cold.', steps: (r) => [once(composeDeath('small', 'cold', r))] },
  { id: 'death-big', group: 'bodies', title: 'Brute death', blurb: 'The big one going down.', steps: (r) => [once(composeDeath('big', null, r))] },
  { id: 'downed', group: 'bodies', title: 'Wizard downed', blurb: 'One of you is out.', steps: () => [once(composeDowned())] },
  { id: 'foot-stone', group: 'bodies', title: 'Footsteps on stone', blurb: 'A wizard walking; random clip and pitch each step.', steps: (r) => [0, 0.34, 0.68, 1.02, 1.36].map((at) => { const p = composeFootstep(r); for (const y of p.layers) y.rate *= jitter(r).rate; return once(p, at); }) },
  { id: 'foot-brute', group: 'bodies', title: 'Brute footsteps', blurb: 'Slower and much heavier.', steps: (r) => [0, 0.6, 1.2].map((at) => once(composeFootstep(r, true), at)) },
  { id: 'wall-break', group: 'bodies', title: 'Rock wall breaks', blurb: 'A wall giving way.', steps: (r) => [once(composeRockBreak(r))] },
  { id: 'blink', group: 'bodies', title: 'Blink', blurb: 'A pop and a flutter.', steps: () => [once(composeBlink())] },

  ...ENEMY_KINDS.map((k): Item => ({ id: `enemy-${k}`, group: 'enemies', title: ENEMY_TITLE[k], blurb: 'Its wind-up, then its blow. The wind-up is your warning.', steps: (r) => [once(composeTelegraph(k, r)), once(composeStrike(k, r), 0.62)] })),

  { id: 'move-strike', group: 'weapons', title: 'Strike', blurb: 'A quick swing.', steps: (r) => [once(composeMove('strike', null, r))] },
  { id: 'move-sweep', group: 'weapons', title: 'Sweep', blurb: 'A full circle.', steps: (r) => [once(composeMove('sweep', null, r))] },
  { id: 'move-heavy', group: 'weapons', title: 'Heavy', blurb: 'A big committed blow.', steps: (r) => [once(composeMove('heavy', null, r))] },
  { id: 'move-flame', group: 'weapons', title: 'Flame sword Strike', blurb: 'A Strike tinted by its weapon\'s element.', steps: (r) => [once(composeMove('strike', 'fire', r))] },
  { id: 'move-block', group: 'weapons', title: 'Block', blurb: 'A blow taken on a guard.', steps: (r) => [once(composeMove('block', null, r))] },
  { id: 'move-parry', group: 'weapons', title: 'Parry', blurb: 'The timed one. It should feel like a reward.', steps: (r) => [once(composeMove('parry', null, r))] },
  { id: 'move-retreat', group: 'weapons', title: 'Retreat', blurb: 'A quick step back.', steps: (r) => [once(composeMove('retreat', null, r))] },

  { id: 'zone-rain', group: 'world', title: 'Rain', blurb: 'Water Place, falling.', steps: () => [once(held(composeRain(), 1.8))] },
  { id: 'zone-steam', group: 'world', title: 'Steam cloud', blurb: 'A lingering cloud.', steps: () => [once(held(composeSteamCloud(), 1.8))] },
  { id: 'zone-spring', group: 'world', title: 'Healing spring', blurb: 'Life and water, bubbling.', steps: () => [once(held(composeSpring(), 1.8))] },
  { id: 'zone-spark', group: 'world', title: 'Spark field', blurb: 'Electricity left in the air.', steps: () => [once(held(composeSparkField(), 1.8))] },
  { id: 'zone-burn', group: 'world', title: 'Burning body', blurb: 'Someone on fire nearby.', steps: () => [once(held(composeBurning(), 1.8))] },
  { id: 'zone-floorfire', group: 'world', title: 'Burning floor', blurb: 'A Fire patch.', steps: () => [once(held(composeFloorFire(), 1.8))] },

  { id: 'ui-queue', group: 'ui', title: 'Rune queue', blurb: 'Five runes going in. Each element has its note, so a queue is a small tune.', steps: () => (['earth', 'water', 'arcane', 'lightning', 'cold'] as ElementName[]).map((el, i) => once(composeQueue(el, i + 1), i * 0.16)) },
  { id: 'ui-dry', group: 'ui', title: 'Out of runes', blurb: 'A dull knock.', steps: () => [once(composeDry())] },
  { id: 'ui-open', group: 'ui', title: 'Menu open', blurb: 'The Esc menu.', steps: () => [once(composeUi('open'))] },
  { id: 'ui-close', group: 'ui', title: 'Menu close', blurb: 'The Esc menu.', steps: () => [once(composeUi('close'))] },
  { id: 'ui-move', group: 'ui', title: 'Menu move', blurb: 'Moving between items.', steps: () => [once(composeUi('move'))] },
  { id: 'ui-select', group: 'ui', title: 'Menu select', blurb: 'Choosing an item.', steps: () => [once(composeUi('select'))] },
  { id: 'ui-adjust', group: 'ui', title: 'Setting changed', blurb: 'A slider step.', steps: () => [once(composeUi('adjust'))] },
  { id: 'st-wave', group: 'ui', title: 'Wave begins', blurb: 'A low horn.', steps: () => [once(composeStinger('wave'))] },
  { id: 'st-clear', group: 'ui', title: 'Wave cleared', blurb: 'A rising run of bells.', steps: () => [once(composeStinger('clear'))] },
  { id: 'st-lose', group: 'ui', title: 'Everyone down', blurb: 'A tired, falling slide.', steps: () => [once(composeStinger('lose'))] },
];

const itemById = new Map(ITEMS.map((i) => [i.id, i]));
const srcOf = new Map(BANK.map((c) => [c.id, c.src]));

/** What an item is made of, for the card's label: code, recordings, or both. */
export function sourceOf(id: string): string {
  const clips = itemById.get(id)!.steps(seeded(2)).flatMap((s) => s.plan.layers.map((l) => l.clip));
  const lib = new Set(clips.filter((c) => !c.startsWith('y-')).map((c) => srcOf.get(c) ?? '?')), synth = clips.some((c) => c.startsWith('y-'));
  const names = [...lib].sort().map((s) => (s === 'kenney' ? 'Kenney' : s === 'commons' ? 'Commons' : 'pending')).join(' + ');
  return !lib.size ? 'Code-made' : synth ? `Blend: code + ${names}` : names;
}

declare global { interface Window { SOUND_BANK?: Record<string, string> } }

const bytes = (b64: string): ArrayBuffer => {
  const s = atob(b64), u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u.buffer;
};

/** The bank decoded once; buffers work in any context of the same page. */
let decoded: Promise<Map<string, AudioBuffer>> | null = null;
function decodeBank(ctx: BaseAudioContext): Promise<Map<string, AudioBuffer>> {
  decoded ??= (async () => {
    const out = new Map<string, AudioBuffer>();
    await Promise.all(BANK.map(async (c) => {
      const b64 = window.SOUND_BANK?.[c.id];
      if (b64) out.set(c.id, await ctx.decodeAudioData(bytes(b64)));
    }));
    return out;
  })();
  return decoded;
}
async function fill(e: AudioEngine): Promise<void> {
  for (const [id, b] of await decodeBank(e.ctx)) e.addClip(id, b, BANK.find((c) => c.id === id)?.loop);
}

const place = (p?: Partial<Place>): Place => ({ ...CENTRE, ...p });

let live: { ctx: AudioContext; engine: AudioEngine } | null = null;

/** Called from a click, so the browser lets it make sound. */
async function ready(): Promise<AudioEngine> {
  if (!live) {
    const ctx = new AudioContext();
    live = { ctx, engine: new AudioEngine(ctx) };
    live.engine.setVolumes({ master: 0.9, effects: 1, music: 1 });
    await fill(live.engine);
  }
  if (live.ctx.state !== 'running') await live.ctx.resume();
  return live.engine;
}

function start(e: AudioEngine, steps: readonly Step[], delay = 0): void {
  for (const s of steps) e.play(s.plan, place(s.place), s.gain ?? 1, s.at + delay);
}

/** How long a run of steps sounds, with its room's tail. */
function lengthOf(steps: readonly Step[], env: EnvName): number {
  let end = 0;
  for (const s of steps) for (const l of s.plan.layers) end = Math.max(end, s.at + l.at + l.attack + (l.hold || 1.6) + l.release);
  return end + ENVS[env].decay * 0.6;
}

export interface Measured { secs: number; peak: number; rms: number; ringing: number; zcr: number; clipped: number; left: number; right: number; low: number }

/** Renders steps offline through the game's graph and measures the result. */
async function measure(steps: readonly Step[], env: EnvName): Promise<Measured> {
  // the limiter takes a moment to settle after it's made, which the game never hears: start a little in
  const lead = 0.3, secs = lengthOf(steps, env) + lead, rate = 44100, ctx = new OfflineAudioContext(2, Math.ceil(secs * rate), rate), e = new AudioEngine(ctx);
  e.setVolumes({ master: 1, effects: 1, music: 1 });
  e.setEnv(env);
  await fill(e);
  start(e, steps, lead);
  const out = await ctx.startRendering(), L = out.getChannelData(0), R = out.getChannelData(1), n = L.length;
  let peak = 0, sq = 0, cross = 0, clipped = 0, sl = 0, sr = 0, lastLoud = 0, lp = 0, low = 0;
  for (let i = 0; i < n; i++) { peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i])); }
  const floor = peak * 0.003; // -50 dB under the peak
  for (let i = 0; i < n; i++) {
    const m = (L[i] + R[i]) / 2;
    sq += m * m; sl += L[i] * L[i]; sr += R[i] * R[i];
    if (i && (m > 0) !== ((L[i - 1] + R[i - 1]) / 2 > 0)) cross++;
    if (Math.abs(L[i]) >= 0.999 || Math.abs(R[i]) >= 0.999) clipped++;
    if (Math.abs(m) > floor) lastLoud = i;
    lp += (m - lp) * 0.028; // about 200 Hz at 44.1 kHz
    low += lp * lp;
  }
  return { secs, peak, rms: Math.sqrt(sq / n), ringing: lastLoud / rate - lead, zcr: cross / (n / rate), clipped, left: Math.sqrt(sl / n), right: Math.sqrt(sr / n), low: sq > 0 ? low / sq : 0 };
}

export const SoundLab = {
  items: ITEMS.map(({ id, group, title, blurb }) => ({ id, group, title, blurb, source: sourceOf(id) })),
  elements: ELEMENT_NAMES,
  blipOf: (el: ElementName) => ELEMENTS[el].blip,
  addRune, mix: (q: ElementName[], cast: Cast) => { const m = mix(q, cast); return { title: m.title, shape: m.shape }; },
  async playItem(id: string): Promise<void> {
    const it = itemById.get(id)!, e = await ready();
    e.setEnv(it.env ?? 'hall');
    start(e, it.steps(Math.random));
  },
  async playMix(q: ElementName[], cast: Cast, env: EnvName): Promise<void> {
    const e = await ready();
    e.setEnv(env);
    start(e, mix(q, cast, Math.random).steps);
  },
  async playQueue(el: ElementName, n: number): Promise<void> { start(await ready(), [once(composeQueue(el, n))]); },
  async playCancel(): Promise<void> { start(await ready(), [once(composeInteraction('cancel'))]); },
  async volume(v: number): Promise<void> { (await ready()).setVolumes({ master: v, effects: 1, music: 1 }); },
  /** For the checks: every item rendered offline, or one mix. */
  measureItem: (id: string, seed = 7) => { const it = itemById.get(id)!; return measure(it.steps(seeded(seed)), it.env ?? 'hall'); },
  measureMix: (q: ElementName[], cast: Cast, env: EnvName = 'hall', seed = 7) => measure(mix(q, cast, seeded(seed)).steps, env),
  /** The bank's clips that decoded, so the check knows the page really has them. */
  async clipCount(): Promise<number> { return (await decodeBank(new OfflineAudioContext(1, 1, 44100))).size; },
};

(globalThis as unknown as { SoundLab: typeof SoundLab }).SoundLab = SoundLab;
