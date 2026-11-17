/**
 * The Sound Lab (dev server only: localhost:5187/?lab=fire). One element at a time, heard in the game
 * with its visuals. Each moment is a spell cut into the parts being judged (a flamethrower's catch, roar and
 * cut-off), and each part has its own takes: switch them while it plays, and play the whole spell or just
 * that part. Nothing plays until you ask, so you can write in peace, and while nothing plays your hands are
 * your own, to cast it yourself. Each take has its own mark and note, and each moment an overall one.
 *
 * The kits are local (vite.config.ts serves them on this machine only; they're never in a build). A part
 * whose kit entry has the reference's or today's layers too (KitLayer.set) offers them beside the takes.
 * Notes go through the dev server into content/audio/lab-notes.json, where Claude reads them.
 */
import { KIND, NO_INPUT, type PlayerInput, type World } from '@wizard-sim/sim';
import { demoInput, parseDemo, PERIOD, type Demo } from '../demo';
import { loadBaseline } from './baseline';
import type { GameAudio } from './game-audio';
import { kitPlan, useKit, type Kit, type KitLayer } from './kits';
import type { ElementName, Plan } from './recipes';
import { CENTRE } from './variation';

/**
 * A part of a spell being judged: the kit entry it is (a role like `hold`, or a spell entry like `land:missile`) and how many takes it has.
 * `other`: the entry has the reference's (or today's) layers too, under this name. `direct`: the Lab can't make it happen (nothing
 * strikes a barrier here), so a button plays the part on its own, as if beside you.
 */
interface Section { name: string; key: string; takes: number; other?: string; direct?: boolean }
/**
 * `douse`: the dummies are put out as soon as they catch, so a hit isn't followed by the burn's own small hits every half second.
 * `near`: your wizard is stood this far south of the nearest dummy as it starts, for spells that only reach what's close (the
 * dummies stand in a row, so the others are well off to the side). `hurt`: you and the dummies are kept at half health, so a heal
 * has something to heal (a heal on a full body does nothing, and makes no sound).
 */
interface Moment { id: string; name: string; spell: string; listen: string; sections: Section[]; near?: number; douse?: boolean; hurt?: boolean }

const LABS: Readonly<Record<string, { el: ElementName; moments: Moment[] }>> = {
  // round 1 the Sigil way (tools/sfx/fire-1.json): three takes of each part, the reference to compare
  fire: {
    el: 'fire',
    moments: [
      // r3, settled unless it sounds wrong: catch, roar 1, and no cut-off (the roar dies away over 0.5 s instead)
      // settled 2026-11-14: the flamethrower (catch and roar) confirmed Right: Fire is complete
    ],
  },
  // 2026-11-14, overnight round 1 (tools/sfx/elements-1.json): Life, Shield, Cold, Arcane and Lightning, a kit each, three takes
  // of each part beside the reference (Magicka's, the dev baseline). Takes 1 and 2 share a prompt; take 3 is a second wording.
  life: {
    el: 'life',
    moments: [
      // settled 2026-11-14 and out of the Lab: the beam (take 1, "friendly"), its catch (round 2 take 3, "a nice soft tap with a slight
      // echo"), the heal tick (take 1, quieter, then the user's 80 %), healing yourself and the palm (take 1), the spring's cast (take 1, for now)
      // ring r2 (2026-11-14): the thud helps, but the shimmer was "very grating", "maybe like 30%"
      // settled 2026-11-14: the ring, round 3 take 3 ("good enough")
      { id: 'spring-r2', name: 'Healing spring', spell: 'life,life/place', hurt: true, listen: 'The loop while a healing spring lasts (its cast is settled). Round 1 was rain, dripping and waves. Round 2 uses your plainer prompts, one each, to see where the generator goes with them: take 1 "A magical healing spring", take 2 "A spring of healing light on the ground", take 3 "Healing magic lingering on the ground". They swelled in and out, so each is cut to its steadiest few seconds and made into a loop (your level is still 55 %).',
        sections: [{ name: 'Spring', key: 'ground', takes: 3 }] },
      { id: 'spray-r2', name: 'Healing spray', spell: 'life,life,fire/force', hurt: true, listen: 'Life + Fire: a cone of warm light. Its own prompts at last: takes 1 and 2 a soft spray of warm light, an airy breath with a faint glow; take 3 just "A healing spray of magic light". They came back mostly as a soft high hiss, so listen for whether it reads as light or as steam.',
        sections: [{ name: 'Spray', key: 'hold', takes: 3, other: 'Reference' }] },
    ],
  },
  shield: {
    el: 'shield',
    moments: [
      // settled 2026-11-14: the barrier take 2 (arc and ring), the ward take 3, blocks takes 1 and 2 at random (3 kept for arrows),
      // the blink take 1
    ],
  },
  cold: {
    el: 'cold',
    moments: [
      // settled 2026-11-14 and out of the Lab: the spray and its catch (take 2, "even better" than 1), the ring (take 3, "a more
      // forceful burst") and the frost hit (take 1): "3/1 is the best combo"
      // settled 2026-11-14: the fog's cast, take 3
      { id: 'fog-r3', name: 'Freezing fog', spell: 'cold,cold/place', listen: 'The loop while the fog lies (16 s), after its cast (settled, take 3). You asked for "more of a crackling sound of freezing", static rather than busy. Three generated takes of frost forming and crackling with a faint cold hush, each cut to its steady part and made into a loop.',
        sections: [{ name: 'Lying fog', key: 'ground', takes: 3 }] },
    ],
  },
  arcane: {
    el: 'arcane',
    moments: [
      // settled 2026-11-14: the beam take 2 and its catch take 2, Attune take 1
      { id: 'nova-r2', name: 'Arcane nova', spell: 'arcane,arcane/area', listen: 'A pressure wave blown out from you. You marked the reference Right, and said our take 3 sounded more explosive with a better start, but a chime in its tail. Round 2 is that start: take 1 cut at 0.5 s, take 2 at 0.8 s, take 3 the 0.5 s cut over the deep boom of round 1 take 1. The blast\'s explosion plays the nova too.',
        sections: [{ name: 'Nova', key: 'burst', takes: 3, other: 'Reference' }] },
      { id: 'blast-r2', name: 'Arcane blast', spell: 'arcane,arcane/place', listen: 'A mark on the floor where you aim, then it explodes 0.6 s later. Round 1\'s marks rose for 1.5 s, so they were still building after the explosion. Round 2 squeezes each into the 0.6 s fuse, quickening into the bang (the bang is the nova\'s take, chosen on that row).',
        sections: [{ name: 'Mark', key: 'place', takes: 3, other: 'Reference' }] },
      { id: 'burst-r1', name: 'Arcane burst', spell: 'arcane,arcane/conjure', listen: 'Arcane with the Weapon cast: a short cone of force. Its takes are round 1\'s novas cut to 0.8 s. You heard nothing last time: the Lab played only the first spell of a pair, now fixed.',
        sections: [{ name: 'Burst', key: 'force', takes: 3, other: 'Reference' }] },
    ],
  },
  lightning: {
    el: 'lightning',
    moments: [
      // settled 2026-11-14: the arc take 1 and its catch take 1, the zap take 2, Discharge take 3, the strike take 1: Lightning is complete
    ],
  },
  sigil: {
    el: 'sigil',
    moments: [
      // 2026-11-14: other elements' glyphs arming, made from the elements' round 1 clips (Cold's ice crack is settled)
      // r1 played no glyph at all: two Sigil runes cancel, so each spell was its element's own Place (the user: "cant hear anything")
      { id: 'glyph-arm-r2', name: 'Glyphs arming', spell: 'sigil,life/place;sigil,lightning/place;sigil,arcane/place;sigil,fire/place', listen: 'A Life, Lightning, Arcane and Fire glyph, in turn: each etches, then arms 0.8 s later. Arming played the same click for all but Cold. Each now has a small sound of its element (one take), with the click to compare: Life a soft breath of light, Lightning a zap, Arcane the thump of its beam, Fire its soft hit.',
        sections: [{ name: 'Life', key: 'glyph+life', takes: 1, other: 'Click' }, { name: 'Lightning', key: 'glyph+lightning', takes: 1, other: 'Click' }, { name: 'Arcane', key: 'glyph+arcane', takes: 1, other: 'Click' }, { name: 'Fire', key: 'glyph+fire', takes: 1, other: 'Click' }] },
      // settled 2026-11-11 and out of the Lab: Haste's hum (hum 3) and the rune blop (take 1)
      // orbitals (sigil-12.json) came out on 2026-11-11: every take rejected, and circling stays silent. Its row can come back with
      // `near: 3.2` (an orb strikes within 1.6 u of a dummy's edge, and its ring starts due east)
    ],
  },
};

type Notes = Record<string, { mark?: string; note?: string; level?: number }>;
/** A take counts as reviewed once it has a mark or a note. */
const reviewed = (n: Notes, key: string): boolean => !!(n[key]?.mark || n[key]?.note?.trim());
/** Each of our takes in a lab (not the reference): its notes key. */
const takeKeys = (el: string): string[] => (LABS[el]?.moments ?? []).flatMap((m) => m.sections.flatMap((s) => Array.from({ length: s.takes }, (_, i) => `${el}/${m.id}/${s.key}/take${i + 1}`)));
/** How many of a lab's takes are still waiting for a mark or a note. */
export const toReview = (el: string, n: Notes): number => takeKeys(el).filter((k) => !reviewed(n, k)).length;

/** The page's tabs, in order: every lab, then music and ambience (atmos.ts). */
const TABS: readonly [string, string][] = [['life', 'Life'], ['shield', 'Shield'], ['cold', 'Frost'], ['arcane', 'Arcane'], ['lightning', 'Lightning'], ['sigil', 'Sigil'], ['fire', 'Fire'], ['atmos', 'Music and ambience']];
export const TABS_CSS = `.labtabs{display:flex;flex-wrap:wrap;gap:4px;margin:0 0 10px}.labtabs a{flex:0 0 auto;padding:3px 7px;border:1px solid #4a4257;border-radius:5px;
  color:#ece6d8;text-decoration:none;font-size:12px;background:#2a2535}.labtabs a.on{background:#d9772b;border-color:#f0a35e;color:#1b1209;font-weight:600}
.labtabs a i{font-style:normal;margin-left:4px;padding:0 5px;border-radius:8px;background:#e0a23a;color:#1b1209;font-size:11px;font-weight:700}
.labtabs a b{font-weight:400;margin-left:4px;color:#8fc98f}.labtabs a.on b{color:#1b1209}`;

/**
 * One page for every lab: a tab each, with how many takes are still to review (amber) or a check when none are. A tab reloads the
 * page on that lab, keeping the room in the hash. `atmosLeft` is the Atmosphere Lab's own count, when known.
 */
export function labTabs(parent: HTMLElement, current: string, n: Notes, atmosLeft?: number): HTMLElement {
  const row = document.createElement('div'); row.className = 'labtabs';
  for (const [id, label] of TABS) {
    const a = document.createElement('a'); a.textContent = label; a.href = `?lab=${id}${location.hash}`;
    a.classList.toggle('on', id === current);
    const left = id === 'atmos' ? atmosLeft : toReview(id, n);
    if (left !== undefined) {
      const badge = document.createElement(left ? 'i' : 'b'); badge.textContent = left ? String(left) : '✓';
      badge.title = left ? `${left} takes to review` : 'Nothing left to review';
      a.appendChild(badge);
    }
    row.appendChild(a);
  }
  parent.prepend(row);
  return row;
}

/** With no lab named, the first one with takes still to review (else Life). */
export const firstToReview = (n: Notes): string => TABS.map(([id]) => id).find((id) => id !== 'atmos' && toReview(id, n) > 0) ?? 'life';

/** Your wizard with no statuses: not burning, wet, frozen, stunned or chilled. */
function calm(w: World): void {
  const b = w.bodies;
  b.burn[0] = b.burnPool[0] = b.wet[0] = b.frozen[0] = b.stun[0] = b.chill[0] = 0;
}

/** One take of a kit layer: its clips ending in n, else its first. A layer with only one clip keeps it. */
function pickTake(clips: readonly string[], n: number): readonly string[] {
  const these = clips.filter((c) => c.endsWith(`-${n}`));
  return these.length ? these : clips.slice(0, 1);
}

/**
 * The kit with each entry at its chosen take: 0 is the other set (KitLayer.set 'ref'), else take n of ours. Entries nobody chose play
 * take 1. `level` scales an entry, for mixing in the Lab: 0 keeps its layers at no gain (an empty entry would fall back to the old
 * placeholder sound, not silence).
 */
function kitAt(kit: Kit, take: (key: string) => number, level: (key: string) => number = () => 1): Kit {
  const one = (key: string, ls: readonly KitLayer[]) => {
    const n = take(key), g = level(key);
    return ls.filter((l) => !l.set || (l.set === 'ref') === (n === 0)).map((l) => ({ ...(l.set === 'ref' ? l : { ...l, clips: pickTake(l.clips, n || 1) }), gain: l.gain * g }));
  };
  const all = (ls: Readonly<Record<string, readonly KitLayer[]>>) => Object.fromEntries(Object.entries(ls).map(([k, v]) => [k, one(k, v)]));
  const { spells, ...roles } = kit;
  return { ...all(roles), spells: all(spells ?? {}) };
}

/** The clips a kit entry plays, for hearing just that part. */
function clipsOf(kit: Kit, key: string): Set<string> {
  const ls = (kit as unknown as Record<string, readonly KitLayer[] | undefined>)[key] ?? kit.spells?.[key] ?? [];
  return new Set(ls.flatMap((l) => l.clips));
}

const CSS = `
#lab{position:fixed;top:12px;right:12px;width:350px;max-height:calc(100vh - 24px);overflow:auto;z-index:50;background:#14121bf2;color:#ece6d8;
  border:1px solid #4a4257;border-radius:8px;padding:12px;font:13px/1.4 system-ui,sans-serif}
#lab h2{margin:0 0 2px;font-size:15px}#lab p{margin:0 0 8px;color:#a9a1b5;font-size:12px}
#lab .row{display:flex;gap:4px;margin-bottom:6px;align-items:center}
#lab button{flex:1;background:#2a2535;color:inherit;border:1px solid #4a4257;border-radius:5px;padding:5px 6px;font:inherit;cursor:pointer}
#lab button:hover{background:#393246}#lab button.on{background:#d9772b;border-color:#f0a35e;color:#1b1209;font-weight:600}
#lab button:disabled{opacity:.4;cursor:default}
#lab .lbl{flex:0 0 auto;color:#a9a1b5;font-size:12px;min-width:74px}
#lab .m{border-top:1px solid #3a3346;padding:8px 0}#lab .m>button{width:100%;text-align:left;margin-bottom:4px}
#lab .m small{display:block;color:#a9a1b5;margin-bottom:6px}#lab .m .more{display:none}#lab .m.open .more{display:block}
#lab .sec{border-left:3px solid #4a4257;padding:4px 0 2px 8px;margin:8px 0}#lab .sec.solo{border-left-color:#d9772b}
#lab .sec h3{margin:0 0 5px;font-size:13px}
#lab .r b{display:block;font-size:12px;margin-bottom:3px}
#lab .marks{display:flex;gap:4px}#lab .marks button{font-size:12px;padding:3px}
#lab textarea{box-sizing:border-box;width:100%;height:40px;margin-top:4px;background:#0f0d14;color:inherit;border:1px solid #4a4257;border-radius:5px;padding:5px;font:inherit;resize:vertical}
#lab .saved{color:#8fc98f;font-size:11px;height:14px}
#lab .st{font-size:11px;font-weight:600}#lab .st.todo{color:#e0a23a}#lab .st.done{color:#8fc98f}#lab button.on .st{color:#1b1209}
#lab button:has(.st.todo){border-color:#e0a23a;box-shadow:inset 0 0 0 1px #e0a23a}#lab .m>button:has(.st.done){opacity:.75}`;

/** The switchable kinds of sound around the spell, by the director's group: rune blips and steps start off, so what you hear is the spell. */
type Extra = 'runes' | 'other';
const EXTRAS: readonly [Extra, string][] = [['runes', 'Rune sounds'], ['other', 'Steps and the rest']];
// heal (a heal's ticks), zone (a spring or fog lying on the floor) and move (the Blink) are part of the spells that make them
const SPELL_GROUPS = new Set(['cast', 'chan', 'charge', 'flight', 'aura', 'orbit', 'hit', 'zap', 'orbstrike', 'impact', 'burst', 'floorfire', 'burn', 'heal', 'zone', 'move']);
const extraOf = (group: string): Extra | null => (group === 'ui' ? 'runes' : SPELL_GROUPS.has(group) ? null : 'other');
/** The Now playing line's names. */
const SAYS: readonly [RegExp, string][] = [
  [/^queue:/, 'rune'], [/^kit:tick|^heal/, 'heal tick'], [/^kit:spring|^zone:spring/, 'spring'], [/^kit:fog/, 'lying fog'], [/^kit:blink|^blink/, 'blink'], [/^kit:blocked|^blocked/, 'blocked'], [/^kit:aura/, 'aura loop'], [/^kit:orbstrike/, 'orb strike'], [/^kit:hold|^hold:/, 'held loop'], [/^kit:stop/, 'dying breath'], [/^kit:charge|^charge/, 'charge'], [/^kit:flight|^flight/, 'in flight'],
  [/^kit:land|^impact|^hit/, 'hit'], [/^kit:ground|^floorfire/, 'burning ground'], [/^kit:burn|^burn/, 'burning body'], [/^kit:|^(spray|beam|missile|nova|force|self|place):/, 'cast'],
];
const MARKS = ['Right', 'Close', 'Wrong'];

export class SoundLab {
  private demo: Demo | null = null;
  private tick = 0;
  /** Stop after one cycle, rather than looping. */
  private once = false;
  /** What's playing, for its buttons: called with nothing when it stops. */
  private played: (() => void) | null = null;
  /** Take away what the last moment left standing: a turret would go on firing over the next one. */
  private clear = false;
  /** Where the open moment stands your wizard, once, as it starts playing. */
  private near: number | null = null;
  private douse = false;
  private hurt = false;
  private stand = false;
  private ref: Kit | null = null;
  /** The kit as it plays now, at the chosen takes. */
  private live: Kit | null = null;
  private lab: typeof LABS[string] = LABS.life;
  private notes: Notes = {};
  /** Every badge that says whether something is reviewed, redrawn when a mark or note changes; and the tabs. */
  private badges: (() => void)[] = [];
  private tabs: HTMLElement | null = null;
  /** Each kit entry's chosen take: 0 is the other set (reference or today). */
  private takes = new Map<string, number>();
  /** The kit entry being heard on its own, or null for the whole spell. */
  private solo: string | null = null;
  /** What the loops playing were started for (takes and solo), so they restart only when it changes. */
  private heard = '';
  private soloClips = new Set<string>();
  private extras: Record<Extra, boolean> = { runes: false, other: false };
  private recent: { name: string; at: number }[] = [];
  private loops = new Map<string, string>();
  private now: HTMLElement | null = null;
  private status: HTMLElement | null = null;
  /** Redraws the open moment's buttons after a change. */
  private redraw: (() => void) | null = null;

  constructor(private audio: GameAudio, private name: string) {
    (window as unknown as { __lab?: SoundLab }).__lab = this; // for headless checks of what plays
    const d = audio.director;
    d.hear = (k) => { const x = extraOf(k); return this.solo !== null || !x || this.extras[x]; };
    d.hearPlan = (p: Plan) => this.solo === null || p.layers.some((l) => this.soloClips.has(l.clip));
    d.punches = false;
    d.onPlan = (name, looped, id) => {
      const say = SAYS.find(([re]) => re.test(name))?.[1] ?? name;
      if (!looped) this.recent.push({ name: say, at: performance.now() });
      else if (name && id) this.loops.set(id, say);
      else if (id) this.loops.delete(id);
    };
    setInterval(() => this.showNow(), 150);
    void this.boot();
  }

  /** Seat 0's input while a moment plays. Off a loop like this nothing should wear out, so runes and health are topped up. */
  input(w: World): PlayerInput | null {
    for (let k = 0; k < 9; k++) w.seats.runes[k] = 5;
    w.bodies.hp[0] = 100;
    if (this.hurt) for (let i = 0; i < w.bodies.kind.length; i++) if (w.bodies.kind[i] === KIND.wizard || w.bodies.kind[i] === KIND.dummy) w.bodies.hp[i] = w.bodies.maxHp[i] / 2;
    if (this.clear) { w.devices.type.fill(0); w.devices.chan.fill(0); w.seats.aura.fill(0); this.clear = false; }
    // a single play ends with the wizard put out, so the burn's loop ends with it and the next play starts from quiet
    // a moment of several spells in turn (a;b) plays each of them once
    if (this.once && this.tick >= PERIOD * (this.demo?.seq?.length ?? 1)) { this.stop(); calm(w); }
    if (!this.demo) return null;
    if (this.douse) for (let i = 1; i < w.bodies.burn.length; i++) w.bodies.burn[i] = 0;
    // every play starts the same: still burning or wet from the last one, a Fire cast on yourself only dries you,
    // or carries on a fire that's already going
    if (this.stand) calm(w);
    if (this.stand && this.near !== null) {
      this.stand = false;
      const b = w.bodies;
      let d = -1;
      for (let i = 0; i < b.kind.length; i++) if (b.kind[i] === KIND.dummy && (d < 0 || Math.hypot(b.x[i] - b.x[0], b.y[i] - b.y[0]) < Math.hypot(b.x[d] - b.x[0], b.y[d] - b.y[0]))) d = i;
      if (d >= 0) { b.x[0] = b.x[d]; b.y[0] = b.y[d] + this.near; }
    }
    this.stand = false;
    return demoInput(w, this.tick++, 0, this.demo) ?? NO_INPUT;
  }

  private play(spell: string, once: boolean, solo: string | null, done: () => void): void {
    this.stop();
    this.solo = solo;
    this.demo = parseDemo(spell);
    this.once = once;
    this.tick = 0;
    this.stand = true;
    this.played = done;
    this.apply();
  }

  private stop(): void {
    this.demo = null;
    this.played?.();
    this.played = null;
  }

  private showNow(): void {
    if (!this.now) return;
    const t = performance.now();
    this.recent = this.recent.filter((r) => t - r.at < 900);
    const names = [...new Set([...this.loops.values(), ...this.recent.map((r) => r.name)])];
    this.now.textContent = `Now playing: ${names.join(', ') || 'nothing'}`;
  }

  private async boot(): Promise<void> {
    try { this.notes = await (await fetch('/__lab/notes')).json(); } catch { /* none yet */ }
    // ?lab on its own (or a name that isn't a lab): the first lab with takes still to review
    if (!LABS[this.name]) this.name = firstToReview(this.notes);
    this.lab = LABS[this.name];
    this.build();
    const kits = await loadBaseline(this.audio);
    this.ref = kits?.[this.lab.el] ?? null;
    if (this.status) this.status.textContent = this.ref ? '' : 'The local kits are not on this machine, so there is nothing to compare.';
    this.apply();
  }

  /**
   * A part's level in the Lab's mix (1 as it is, 0 off), kept in the notes as `<el>/level/<kit key>` so it lasts and Claude can read
   * how loud the user wants it.
   */
  private levelOf(key: string): number { return this.notes[`${this.lab.el}/level/${key}`]?.level ?? 1; }
  private notesLevels(): number[] { return this.lab.moments.flatMap((m) => m.sections.map((s) => this.levelOf(s.key))); }

  /** The element's kit at the chosen takes, and what "just this part" lets through. */
  private apply(): void {
    if (!this.ref) return;
    const kit = kitAt(this.ref, (k) => this.takes.get(k) ?? 1, (k) => this.levelOf(k));
    useKit(this.lab.el, kit);
    this.live = kit;
    this.soloClips = this.solo === null ? new Set() : clipsOf(kit, this.solo);
    // a loop already going would carry on as the old take; but restarting one that hasn't changed is heard as a new start
    const was = this.heard;
    this.heard = `${JSON.stringify([...this.takes])}|${this.solo}|${JSON.stringify(this.notesLevels())}`;
    if (was !== this.heard) this.audio.director.restartLoops();
    this.redraw?.();
  }

  private save(key: string, saved: HTMLElement): void {
    void fetch('/__lab/notes', { method: 'POST', body: JSON.stringify({ id: key, ...this.notes[key] }) })
      .then((r) => { saved.textContent = r.ok ? 'Saved' : 'Not saved: is the dev server running?'; })
      .catch(() => { saved.textContent = 'Not saved: is the dev server running?'; });
  }

  /** Redraws everything that says what's reviewed: badges and tabs. */
  private refresh(): void {
    for (const b of this.badges) b();
    const root = this.tabs?.parentElement;
    this.tabs?.remove();
    if (root) this.tabs = labTabs(root, this.name, this.notes);
  }

  /** A small status beside a label: amber while something's waiting for review, green once it's done. */
  private badge(parent: HTMLElement, left: () => number, words: (left: number) => string): void {
    const st = document.createElement('span'); st.className = 'st';
    parent.appendChild(st);
    const draw = () => { const k = left(); st.textContent = words(k); st.classList.toggle('todo', k > 0); st.classList.toggle('done', k === 0); };
    draw();
    this.badges.push(draw);
  }

  /** A mark and a note, kept under `key`. Saves as you type. */
  private rating(parent: HTMLElement, key: string, label: string, hint: string): HTMLElement {
    const n = (this.notes[key] ??= {});
    const box = document.createElement('div'); box.className = 'r';
    const name = document.createElement('b'); name.textContent = label;
    const marks = document.createElement('div'); marks.className = 'marks';
    const t = document.createElement('textarea'); t.placeholder = hint; t.value = n.note ?? '';
    const saved = document.createElement('div'); saved.className = 'saved';
    const mb = MARKS.map((m) => {
      const b = document.createElement('button'); b.textContent = m;
      b.classList.toggle('on', n.mark === m);
      b.onclick = () => { n.mark = n.mark === m ? undefined : m; for (const x of mb) x.classList.toggle('on', x.textContent === n.mark); this.save(key, saved); this.refresh(); };
      marks.appendChild(b);
      return b;
    });
    let wait = 0;
    const write = () => { window.clearTimeout(wait); if ((n.note ?? '') !== t.value) { n.note = t.value; this.save(key, saved); this.refresh(); } };
    t.oninput = () => { saved.textContent = ''; window.clearTimeout(wait); wait = window.setTimeout(write, 700); };
    t.onblur = write;
    box.append(name, marks, t, saved);
    parent.appendChild(box);
    return box;
  }

  private build(): void {
    const style = document.createElement('style');
    style.textContent = CSS + TABS_CSS;
    const root = document.createElement('div');
    root.id = 'lab';
    // typing a note mustn't cast runes, and a click here mustn't cast a spell
    for (const ev of ['keydown', 'keyup']) root.addEventListener(ev, (e) => { if ((e.target as HTMLElement).tagName === 'TEXTAREA') e.stopPropagation(); });
    for (const ev of ['pointerdown', 'pointerup']) root.addEventListener(ev, (e) => e.stopPropagation());
    // and a button keeps no focus, so the keys go back to the game
    root.addEventListener('click', (e) => { if ((e.target as HTMLElement).tagName === 'BUTTON') (e.target as HTMLElement).blur(); });
    const el = (tag: string, text = '', parent: HTMLElement = root, cls = '') => { const n = document.createElement(tag); n.textContent = text; if (cls) n.className = cls; parent.appendChild(n); return n; };
    const button = (text: string, parent: HTMLElement) => el('button', text, parent) as HTMLButtonElement;
    el('h2', `Sound Lab: ${this.lab.el}`);
    this.tabs = labTabs(root, this.name, this.notes);
    el('p', 'Amber: takes you haven\'t marked or written on yet; green: done. Open a moment. Play the whole spell, or just the part you are judging, and switch that part\'s takes while it plays. With nothing playing, your keys cast as usual.');
    this.status = el('p');
    const extras = el('div', '', root, 'row');
    el('span', 'Also hear:', extras, 'lbl');
    for (const [k, label] of EXTRAS) {
      const b = button(label, extras);
      b.onclick = () => { this.extras[k] = !this.extras[k]; b.classList.toggle('on', this.extras[k]); if (k === 'other') this.audio.director.punches = this.extras[k]; };
    }
    this.now = el('p', 'Now playing: nothing');
    const rows: HTMLElement[] = [];
    for (const m of this.lab.moments) {
      const key = `${this.lab.el}/${m.id}`;
      const row = el('div', '', root, 'm'); rows.push(row);
      const open = button(m.name, row);
      const keysOf = (s: Section) => Array.from({ length: s.takes }, (_, i) => `${key}/${s.key}/take${i + 1}`);
      const momentKeys = m.sections.flatMap(keysOf);
      this.badge(open, () => momentKeys.filter((k) => !reviewed(this.notes, k)).length, (k) => (k ? ` · ${k} to review` : ' · reviewed ✓'));
      const more = el('div', '', row, 'more');
      el('small', m.listen, more);
      // every play button, to light the one playing
      const plays: [HTMLButtonElement, string | null, boolean][] = [];
      const idle = () => { for (const [b] of plays) b.classList.remove('on'); };
      const player = (parent: HTMLElement, label: string, solo: string | null) => {
        const line = el('div', '', parent, 'row');
        el('span', label, line, 'lbl');
        for (const [text, once] of [['Once', true], ['Loop', false]] as const) {
          const b = button(text, line);
          plays.push([b, solo, once]);
          b.onclick = () => { this.play(m.spell, once, solo, idle); b.classList.add('on'); };
        }
        button('Stop', line).onclick = () => { this.stop(); this.clear = true; };
      };
      player(more, 'Whole spell', null);
      const draws: (() => void)[] = [];
      for (const s of m.sections) {
        const sec = el('div', '', more, 'sec');
        const h = el('h3', m.sections.length > 1 || s.takes > 1 ? s.name : `${s.name} (one take)`, sec);
        this.badge(h, () => keysOf(s).filter((k) => !reviewed(this.notes, k)).length, (k) => (k ? ` · ${k} of ${s.takes} to review` : ' · reviewed ✓'));
        if (s.direct) {
          // a part the Lab can't stage: played on its own, at the take chosen
          const line = el('div', '', sec, 'row');
          el('span', `Just the ${s.name.toLowerCase()}`, line, 'lbl');
          button('Play it', line).onclick = () => {
            const ls = (this.live as unknown as Record<string, readonly KitLayer[] | undefined>)?.[s.key] ?? this.live?.spells?.[s.key];
            if (ls?.length) this.audio.play(kitPlan(`kit:${s.key}`, ls, Math.random), CENTRE, 1);
          };
        } else player(sec, `Just the ${s.name.toLowerCase()}`, s.key);
        const choices: [number, string][] = [...Array.from({ length: s.takes }, (_, i): [number, string] => [i + 1, `Take ${i + 1}`]), ...(s.other ? [[0, s.other] as [number, string]] : [])];
        const pick = el('div', '', sec, 'row');
        const picks = choices.length > 1 ? choices.map(([n, label]) => {
          const b = button(label, pick); b.onclick = () => { this.takes.set(s.key, n); this.apply(); };
          // each take of ours says if it's reviewed, and how; the reference needs no review
          if (n) { const tk = `${key}/${s.key}/take${n}`; this.badge(b, () => (reviewed(this.notes, tk) ? 0 : 1), (k) => (k ? ' · new' : ` · ${this.notes[tk]?.mark ?? 'noted'}`)); }
          return [n, b] as const;
        }) : [];
        if (!picks.length) pick.remove();
        // its level in the whole spell, to mix it yourself: all the way down turns this part off
        const mix = el('div', '', sec, 'row'), lk = `${this.lab.el}/level/${s.key}`;
        const lvl = el('span', '', mix, 'lbl');
        const say = (v: number) => { lvl.textContent = v === 0 ? 'Level: off' : `Level: ${Math.round(v * 100)}%`; };
        const slider = el('input', '', mix) as HTMLInputElement;
        slider.type = 'range'; slider.min = '0'; slider.max = '1.5'; slider.step = '0.05'; slider.value = String(this.levelOf(s.key)); slider.style.flex = '1';
        say(this.levelOf(s.key));
        slider.oninput = () => say(Number(slider.value));
        slider.onchange = () => { (this.notes[lk] ??= {}).level = Number(slider.value); this.save(lk, el('span')); this.apply(); };
        // one note per take, the chosen one shown, so a note is plainly about what you're hearing
        const boxes = choices.map(([n, label]) => {
          const b = this.rating(sec, `${key}/${s.key}/${n ? `take${n}` : 'other'}`, choices.length > 1 ? `${s.name}, ${label}` : s.name, `${label}: what is off, in your own words`);
          return [n, b] as const;
        });
        // what the chosen take was asked for, so a sound that went wrong can be traced to its words
        const said = el('small', '', sec);
        said.style.margin = '4px 0';
        draws.push(() => {
          const n = this.takes.get(s.key) ?? 1;
          const ls = (this.ref as unknown as Record<string, readonly KitLayer[] | undefined>)?.[s.key] ?? this.ref?.spells?.[s.key] ?? [];
          const ours = ls.find((l) => l.about?.length);
          said.textContent = n === 0 ? (s.other === 'Reference' ? 'Reference: Magicka\'s own sound (the dev baseline).' : `${s.other}: the sound it would replace, to compare.`) : ours?.about ? `Prompt: ${ours.about[Math.min(n, ours.about.length) - 1]}` : '';
          for (const [k, b] of picks) b.classList.toggle('on', k === n);
          for (const [k, b] of boxes) b.style.display = k === n || boxes.length === 1 ? '' : 'none';
          sec.classList.toggle('solo', this.solo === s.key && !!this.demo);
        });
      }
      this.rating(more, key, 'Overall', 'The spell as a whole');
      const draw = () => { for (const d of draws) d(); };
      open.onclick = () => {
        const was = row.classList.contains('open');
        this.stop();
        this.clear = true;
        for (const r of rows) { r.classList.remove('open'); r.querySelector('button')!.classList.remove('on'); }
        if (!was) { row.classList.add('open'); open.classList.add('on'); }
        this.near = was ? null : m.near ?? null;
        this.douse = !was && !!m.douse;
        this.hurt = !was && !!m.hurt;
        this.redraw = was ? null : draw;
        draw();
      };
    }
    document.body.append(style, root);
  }
}
