/**
 * The Sound Lab (dev server only: localhost:5187/?lab=fire). One element at a time, heard in the game
 * with its visuals: open a moment, then have your wizard cast it at the dummy once or on a loop, and switch
 * what you hear while you watch. Nothing plays until you ask, so you can write in peace, and while nothing
 * plays your hands are your own, to cast it yourself. Each set has its own mark and note, and each moment
 * an overall one.
 *
 * Before is what the game plays today. Reference is a local comparison the dev server offers if it's on this
 * machine (vite.config.ts): it's never in a build. An element whose kit is itself local (?lab=sigil) offers
 * each take of it instead. A set the user has rejected comes out, so it needn't be heard again.
 * Notes go through the dev server into content/audio/lab-notes.json, where Claude reads them.
 */
import { NO_INPUT, type PlayerInput, type World } from '@wizard-sim/sim';
import { demoInput, parseDemo, PERIOD, type Demo } from '../demo';
import { loadBaseline } from './baseline';
import type { GameAudio } from './game-audio';
import { useKit, type Kit, type KitLayer } from './kits';
import type { ElementName } from './recipes';

/** `single`: its takes are the same sound, so there's one to hear and rate. `ref`: Reference has this one too. */
interface Moment { id: string; name: string; spell: string; listen: string; single?: boolean; ref?: boolean }

/** An element whose kit is local (`takes`) compares each take of it with what the game plays today. */
const LABS: Readonly<Record<string, { el: ElementName; moments: Moment[]; takes?: number; ref?: boolean }>> = {
  fire: {
    el: 'fire',
    moments: [
      { id: 'flamethrower', name: 'Flamethrower', spell: 'fire,fire,fire/force', listen: 'The catch, the held roar, and the dying breath when it stops.' },
      { id: 'ring', name: 'Fire ring', spell: 'fire,fire/area', listen: 'One big bloom of flame around you.' },
      { id: 'fireball', name: 'Fireball', spell: 'earth,fire,fire/force', listen: 'The throw, then the landing.' },
      { id: 'beam', name: 'Fire beam', spell: 'arcane,fire/force', listen: 'A steady line of flame, thinner than the flamethrower.' },
      { id: 'burning', name: 'On fire', spell: 'fire/self', listen: 'A body burning: it should sit under everything else.' },
    ],
  },
  sigil: {
    el: 'sigil', takes: 2,
    moments: [
      { id: 'lens', name: 'Lens', spell: 'sigil/place', listen: 'Set down where the lens lands.', single: true },
      { id: 'motes', name: 'Rune motes', spell: 'sigil/area', listen: 'Three small sounds, each with a mote appearing.' },
      { id: 'glyph', name: 'Frost glyph', spell: 'sigil,cold/place', listen: 'Scratched in as it draws, then a small crack of ice as it arms.' },
      { id: 'turret', name: 'Frost turret', spell: 'sigil,cold/force@3,-1', listen: 'The summon, landing on the flash, then its shots: try Hits off too.' },
      { id: 'haste', name: 'Haste aura', spell: 'sigil,lightning/self', listen: 'The local baseline, as you picked it.', single: true },
      { id: 'aura-fire', name: 'Fire aura', spell: 'sigil,fire/self', listen: 'Warm flame wrapping around you.' },
      { id: 'aura-frost', name: 'Frost aura', spell: 'sigil,cold/self', listen: 'A cold breath, with ice crystals forming.' },
      { id: 'aura-mist', name: 'Mist aura', spell: 'sigil,water/self', listen: 'A soft damp hiss spreading outward.' },
      { id: 'aura-earth', name: 'Bulldoze', spell: 'sigil,earth/self', listen: 'Heavy stone settling onto you.' },
      { id: 'aura-life', name: 'Regeneration', spell: 'sigil,life/self', listen: "A stand-in: its element's self-cast sound.", single: true },
      { id: 'aura-arcane', name: 'Glass cannon', spell: 'sigil,arcane/self', listen: "A stand-in: its element's self-cast sound.", single: true },
    ],
  },
};

/** One take of a kit: each layer's clips ending in n, else its first. A layer with only one clip keeps it. */
function pickTake(clips: readonly string[], n: number): readonly string[] {
  const these = clips.filter((c) => c.endsWith(`-${n}`));
  return these.length ? these : clips.slice(0, 1);
}

function takeOf(kit: Kit, n: number): Kit {
  const one = (ls: readonly KitLayer[]) => ls.map((l) => ({ ...l, clips: pickTake(l.clips, n) }));
  const all = <T extends Readonly<Record<string, readonly KitLayer[]>>>(ls: T) => Object.fromEntries(Object.entries(ls).map(([k, v]) => [k, one(v)]));
  const { spells, ...roles } = kit;
  return { ...all(roles), spells: all(spells ?? {}) };
}

const CSS = `
#lab{position:fixed;top:12px;right:12px;width:340px;max-height:calc(100vh - 24px);overflow:auto;z-index:50;background:#14121bf2;color:#ece6d8;
  border:1px solid #4a4257;border-radius:8px;padding:12px;font:13px/1.4 system-ui,sans-serif}
#lab h2{margin:0 0 2px;font-size:15px}#lab p{margin:0 0 8px;color:#a9a1b5;font-size:12px}
#lab .sets,#lab .marks{display:flex;gap:4px}#lab .sets{margin-bottom:8px}
#lab button{flex:1;background:#2a2535;color:inherit;border:1px solid #4a4257;border-radius:5px;padding:5px 6px;font:inherit;cursor:pointer}
#lab button:hover{background:#393246}#lab button.on{background:#d9772b;border-color:#f0a35e;color:#1b1209;font-weight:600}
#lab button:disabled{opacity:.4;cursor:default}
#lab .m{border-top:1px solid #3a3346;padding:8px 0}#lab .m>button{width:100%;text-align:left;margin-bottom:4px}
#lab .m small{display:block;color:#a9a1b5;margin-bottom:5px}#lab .m .more{display:none}#lab .m.open .more{display:block}
#lab .play{display:flex;gap:4px;margin-bottom:6px}
#lab .r{border-left:3px solid transparent;padding:4px 0 4px 6px;margin-bottom:2px}#lab .r.now{border-left-color:#d9772b}
#lab .r b{display:block;font-size:12px;margin-bottom:3px}
#lab .marks button{font-size:12px;padding:3px}
#lab textarea{box-sizing:border-box;width:100%;height:40px;margin-top:4px;background:#0f0d14;color:inherit;border:1px solid #4a4257;border-radius:5px;padding:5px;font:inherit;resize:vertical}
#lab .saved{color:#8fc98f;font-size:11px;height:14px}`;

type Set = 'before' | 'reference' | `take${number}`;
type Part = 'spell' | 'hits' | 'burning' | 'other';
const PARTS: readonly [Part, string][] = [['spell', 'Spell'], ['hits', 'Hits'], ['burning', 'Burning'], ['other', 'Runes, steps']];
/** Every kind of sound the fire moments make, by the part it's switched with. Anything unlisted is "other". */
const PART_OF: Readonly<Record<string, Part>> = { cast: 'spell', chan: 'spell', charge: 'spell', flight: 'spell', hit: 'hits', impact: 'hits', burst: 'hits', floorfire: 'burning', burn: 'burning' };
/** The Now playing line's names. */
const SAYS: readonly [RegExp, string][] = [
  [/^kit:hold|^hold:/, 'held loop'], [/^kit:stop/, 'dying breath'], [/^kit:charge|^charge/, 'charge'], [/^kit:flight|^flight/, 'in flight'],
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
  private ratings = new Map<Set, HTMLElement[]>();
  /** Take away what the last moment left standing: a turret would go on firing over the next one. */
  private clear = false;
  private set: Set = 'before';
  private ref: Kit | null = null;
  private lab: typeof LABS[string];
  private notes: Record<string, { mark?: string; note?: string }> = {};
  private setButtons = new Map<Set, HTMLButtonElement>();
  /** Which parts are on. Rune blips, footsteps and the like start off, so what you compare is the spell. */
  private parts: Record<Part, boolean> = { spell: true, hits: true, burning: true, other: false };
  private recent: { name: string; at: number }[] = [];
  private loops = new Map<string, string>();
  private now: HTMLElement | null = null;

  constructor(private audio: GameAudio, name: string) {
    this.lab = LABS[name] ?? LABS.fire;
    if (this.lab.takes) this.set = 'take1';
    const d = audio.director;
    d.hear = (k) => this.parts[PART_OF[k] ?? 'other'];
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
    if (this.clear) { w.devices.type.fill(0); w.devices.chan.fill(0); this.clear = false; }
    if (this.once && this.tick >= PERIOD) this.stop();
    if (!this.demo) return null;
    return demoInput(w, this.tick++, 0, this.demo) ?? NO_INPUT;
  }

  private play(spell: string, once: boolean, done: () => void): void {
    this.stop();
    this.demo = parseDemo(spell);
    this.once = once;
    this.tick = 0;
    this.played = done;
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
    this.build();
    await this.loadReference();
  }

  /** The local baseline, if this machine has one: it's what you hear first, as it's what the game plays here. */
  private async loadReference(): Promise<void> {
    const kits = await loadBaseline(this.audio);
    this.ref = kits?.[this.lab.el] ?? null;
    const first: Set = this.lab.takes ? 'take1' : 'reference';
    if (!this.ref || !this.setButtons.has(first)) return;
    for (const [k, b] of this.setButtons) if (k !== 'before') { b.disabled = false; b.title = ''; }
    this.choose(first);
  }

  private choose(s: Set): void {
    this.set = s;
    const take = s.startsWith('take') ? Number(s.slice(4)) : 0;
    useKit(this.lab.el, s === 'before' ? null : take && this.ref ? takeOf(this.ref, take) : this.ref);
    for (const [k, b] of this.setButtons) b.classList.toggle('on', k === s);
    for (const [k, rs] of this.ratings) for (const r of rs) r.classList.toggle('now', k === s);
    this.audio.director.restartLoops(); // or a loop already going would carry on as the old set
  }

  private save(key: string, saved: HTMLElement): void {
    void fetch('/__lab/notes', { method: 'POST', body: JSON.stringify({ id: key, ...this.notes[key] }) })
      .then((r) => { saved.textContent = r.ok ? 'Saved' : 'Not saved: is the dev server running?'; })
      .catch(() => { saved.textContent = 'Not saved: is the dev server running?'; });
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
      b.onclick = () => { n.mark = n.mark === m ? undefined : m; for (const x of mb) x.classList.toggle('on', x.textContent === n.mark); this.save(key, saved); };
      marks.appendChild(b);
      return b;
    });
    let wait = 0;
    const write = () => { window.clearTimeout(wait); if ((n.note ?? '') !== t.value) { n.note = t.value; this.save(key, saved); } };
    t.oninput = () => { saved.textContent = ''; window.clearTimeout(wait); wait = window.setTimeout(write, 700); };
    t.onblur = write;
    box.append(name, marks, t, saved);
    parent.appendChild(box);
    return box;
  }

  private build(): void {
    const style = document.createElement('style');
    style.textContent = CSS;
    const root = document.createElement('div');
    root.id = 'lab';
    // typing a note mustn't cast runes, and a click here mustn't cast a spell
    for (const ev of ['keydown', 'keyup']) root.addEventListener(ev, (e) => { if ((e.target as HTMLElement).tagName === 'TEXTAREA') e.stopPropagation(); });
    for (const ev of ['pointerdown', 'pointerup']) root.addEventListener(ev, (e) => e.stopPropagation());
    // and a button keeps no focus, so the keys go back to the game
    root.addEventListener('click', (e) => { if ((e.target as HTMLElement).tagName === 'BUTTON') (e.target as HTMLElement).blur(); });
    const el = (tag: string, text = '', parent: HTMLElement = root) => { const n = document.createElement(tag); n.textContent = text; parent.appendChild(n); return n; };
    el('h2', `Sound Lab: ${this.lab.el}`);
    el('p', 'Open a moment and play it once or on a loop, switching sets as you go. With nothing playing, your keys cast as usual.');
    const sets = el('div'); sets.className = 'sets';
    const takes = Array.from({ length: this.lab.takes ?? 0 }, (_, i): [Set, string] => [`take${i + 1}`, `Take ${i + 1}`]);
    const choices: [Set, string][] = takes.length ? [...takes, ...(this.lab.ref ? [[`take${takes.length + 1}`, 'Reference'] as [Set, string]] : [])] : [['before', 'Before'], ['reference', 'Reference']];
    for (const [k, label] of choices) {
      const b = el('button', label, sets) as HTMLButtonElement;
      b.classList.toggle('on', k === this.set);
      if (k !== 'before') { b.disabled = true; b.title = 'Local only, and not on this machine'; }
      b.onclick = () => this.choose(k);
      this.setButtons.set(k, b);
    }
    el('p', 'Hear only:').style.margin = '0 0 3px';
    const parts = el('div'); parts.className = 'sets';
    for (const [k, label] of PARTS) {
      const b = el('button', label, parts) as HTMLButtonElement;
      b.classList.toggle('on', this.parts[k]);
      b.onclick = () => {
        this.parts[k] = !this.parts[k];
        b.classList.toggle('on', this.parts[k]);
        if (k === 'other') this.audio.director.punches = this.parts[k];
      };
    }
    this.now = el('p', 'Now playing: nothing');
    const rows: HTMLElement[] = [];
    for (const m of this.lab.moments) {
      const key = `${this.lab.el}/${m.id}`;
      const row = el('div'); row.className = 'm'; rows.push(row);
      const open = el('button', m.name, row) as HTMLButtonElement;
      const more = el('div', '', row); more.className = 'more';
      el('small', m.listen, more);
      const play = el('div', '', more); play.className = 'play';
      const once = el('button', 'Once', play) as HTMLButtonElement, loop = el('button', 'Loop', play) as HTMLButtonElement, stop = el('button', 'Stop', play) as HTMLButtonElement;
      const idle = () => { once.classList.remove('on'); loop.classList.remove('on'); };
      once.onclick = () => { this.play(m.spell, true, idle); once.classList.add('on'); };
      loop.onclick = () => { this.play(m.spell, false, idle); loop.classList.add('on'); };
      stop.onclick = () => this.stop();
      const own: [Set, string][] = m.single ? [[choices[0][0], 'This sound']] : choices.filter(([, label]) => label !== 'Reference' || m.ref || !takes.length);
      for (const [k, label] of own) {
        const r = this.rating(more, `${key}/${k}`, label, `${label}: what is off, in your own words`);
        r.classList.toggle('now', k === this.set);
        this.ratings.set(k, [...(this.ratings.get(k) ?? []), r]);
      }
      this.rating(more, key, 'Overall', 'The spell as a whole, whichever set');
      open.onclick = () => {
        const was = row.classList.contains('open');
        this.stop();
        this.clear = true;
        for (const r of rows) { r.classList.remove('open'); r.querySelector('button')!.classList.remove('on'); }
        if (!was) { row.classList.add('open'); open.classList.add('on'); }
      };
    }
    document.body.append(style, root);
  }
}
